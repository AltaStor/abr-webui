// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { addDays, format, isBefore, startOfDay } from "date-fns";
import type { FullBackupSchedule, Schedule } from "@/types";

/**
 * Schedule projection — turns a job's {@link Schedule} into concrete run
 * instants so the console can *draw* the schedule (calendar cells, upcoming-run
 * lists) instead of only labelling it.
 *
 * Everything here is deterministic and anchored to local midnight, so the same
 * schedule renders identically on every paint. This is a faithful illustration
 * of the schedule *pattern* — it never triggers anything; the appliance engine
 * remains the single source of truth for when a job actually fires.
 */

/** A backup engine won't sensibly fire more than this many times a day; also a
 *  loop guard for a pathological `everyHours` of 0. */
const MAX_HOURLY_PER_DAY = 48;

/** Parse "HH:mm" into [hours, minutes], tolerating malformed input. */
function parseTime(t: string | undefined, fallback: string): [number, number] {
  const [h, m] = (t ?? fallback).split(":").map((x) => Number(x));
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}

/**
 * Every scheduled run of `schedule` that lands on the local calendar day `day`,
 * ascending:
 *   · hourly  → 00:00, +N, +2N … through the day (every N hours from midnight)
 *   · daily   → once at `atTime`
 *   · weekly  → once at `atTime`, only on the schedule's `daysOfWeek`
 *   · custom  → [] (a raw cron string isn't projected; callers show it verbatim)
 */
export function runsOnDay(schedule: Schedule, day: Date): Date[] {
  const base = startOfDay(day);
  switch (schedule.frequency) {
    case "hourly": {
      const every = Math.max(1, Math.floor(schedule.everyHours ?? 1));
      const out: Date[] = [];
      for (let h = 0; h < 24 && out.length < MAX_HOURLY_PER_DAY; h += every) {
        const d = new Date(base);
        d.setHours(h, 0, 0, 0);
        out.push(d);
      }
      return out;
    }
    case "weekly": {
      const days = schedule.daysOfWeek?.length ? schedule.daysOfWeek : [0];
      if (!days.includes(base.getDay())) return [];
      const [h, m] = parseTime(schedule.atTime, "01:00");
      const d = new Date(base);
      d.setHours(h, m, 0, 0);
      return [d];
    }
    case "custom":
      return [];
    case "daily":
    default: {
      const [h, m] = parseTime(schedule.atTime, "22:00");
      const d = new Date(base);
      d.setHours(h, m, 0, 0);
      return [d];
    }
  }
}

/**
 * The next `count` scheduled runs strictly after `from`, walking forward one day
 * at a time. Empty for custom/cron schedules (not projected). `maxDays` bounds
 * the search so a schedule that never fires can't loop unbounded.
 */
export function upcomingRuns(schedule: Schedule, from: Date, count = 5, maxDays = 400): Date[] {
  if (schedule.frequency === "custom") return [];
  const out: Date[] = [];
  let cursor = startOfDay(from);
  for (let i = 0; i < maxDays && out.length < count; i++) {
    for (const run of runsOnDay(schedule, cursor)) {
      if (isBefore(from, run)) {
        out.push(run);
        if (out.length >= count) break;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Whether a daily/weekly/monthly full schedule fires on the calendar day `day`. */
function fullRunsOnDay(schedule: FullBackupSchedule, day: Date): boolean {
  switch (schedule.frequency) {
    case "weekly":
      return (schedule.daysOfWeek ?? []).includes(day.getDay());
    case "monthly": {
      // The appliance runs a day the month doesn't have (31 in April) on the
      // month's last day instead of skipping the month.
      const lastDay = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
      return day.getDate() === Math.min(schedule.dayOfMonth ?? 1, lastDay);
    }
    default:
      return true;
  }
}

/**
 * The next time a full backup schedule fires after `from`, or null when it is
 * suspended or can't be projected (cron). Like `runsOnDay`, this only
 * illustrates the schedule. The appliance's own `*_full_next_run_at` is the
 * real value.
 */
export function nextFullBackupRun(schedule: FullBackupSchedule, from: Date): Date | null {
  if (!schedule.enabled) return null;
  switch (schedule.frequency) {
    case "cron":
      return null;
    case "periodic":
      return new Date(from.getTime() + Math.max(1, schedule.everyMinutes ?? 60) * 60_000);
    default: {
      const [h, m] = parseTime(schedule.atTime, "00:00");
      // Two months covers the widest gap a monthly schedule can have.
      for (let i = 0, day = startOfDay(from); i <= 62; i++, day = addDays(day, 1)) {
        if (!fullRunsOnDay(schedule, day)) continue;
        const run = new Date(day);
        run.setHours(h, m, 0, 0);
        if (isBefore(from, run)) return run;
      }
      return null;
    }
  }
}

/** Stable local-day key ("yyyy-MM-dd") for bucketing events into calendar cells. */
export function dayKey(d: Date | string): string {
  return format(typeof d === "string" ? new Date(d) : d, "yyyy-MM-dd");
}

/** Group items into a `dayKey → items[]` map by an ISO/Date accessor. */
export function groupByDay<T>(items: T[], getDate: (item: T) => Date | string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(getDate(item));
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
