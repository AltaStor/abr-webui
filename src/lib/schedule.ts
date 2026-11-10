// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { addDays, format, isBefore, startOfDay } from "date-fns";
import { dayKeyIn, formatWallClock, instantAt, isDisplayZone, scheduleZoneName, wallTime } from "@/lib/time";
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

/**
 * The next time a full backup schedule fires after `from`, or null when it is
 * suspended or can't be projected (cron). Read in the schedule's own zone
 * (UTC when it names none). Like `runsOnDay`, this only illustrates the
 * schedule. The appliance's own `*_full_next_run_at` is the real value.
 */
export function nextFullBackupRun(schedule: FullBackupSchedule, from: Date): Date | null {
  if (!schedule.enabled) return null;
  switch (schedule.frequency) {
    case "cron":
      return null;
    case "periodic":
      return new Date(from.getTime() + Math.max(1, schedule.everyMinutes ?? 60) * 60_000);
    case "weekly":
      return nextWallClockRun(schedule.atTime ?? "00:00", schedule.timezone || "UTC", { daysOfWeek: schedule.daysOfWeek ?? [] }, from);
    case "monthly":
      return nextWallClockRun(schedule.atTime ?? "00:00", schedule.timezone || "UTC", { dayOfMonth: schedule.dayOfMonth ?? 1 }, from);
    default:
      return nextWallClockRun(schedule.atTime ?? "00:00", schedule.timezone || "UTC", {}, from);
  }
}

/* ------------------------------------------------------- schedule zones -- */

/** Which calendar days a wall-clock schedule fires on. */
export interface ScheduleDays {
  /** 0 (Sun) – 6 (Sat); absent: every day. */
  daysOfWeek?: number[];
  /** 1–31; a month without that day fires on its last day. */
  dayOfMonth?: number;
}

/**
 * The next moment a schedule that fires at `atTime` ("HH:mm") on the clock of
 * `zone` fires after `from`. This is the console's own projection, read the
 * way the appliance reads a schedule (see `instantAt` for the DST hours); the
 * appliance's next run is the authority where it has one.
 */
export function nextWallClockRun(atTime: string, zone: string, days: ScheduleDays, from: Date = new Date()): Date | null {
  const [h, m] = parseTime(atTime, "00:00");
  const start = wallTime(from, zone);
  // Two months covers the widest gap a monthly schedule can have.
  for (let i = 0; i <= 62; i++) {
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth() + 1;
    const date = day.getUTCDate();
    if (days.daysOfWeek?.length && !days.daysOfWeek.includes(day.getUTCDay())) continue;
    if (days.dayOfMonth !== undefined) {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (date !== Math.min(days.dayOfMonth, lastDay)) continue;
    }
    const at = instantAt({ year, month, day: date, hour: h, minute: m }, zone);
    if (at.getTime() > from.getTime()) return at;
  }
  return null;
}

/**
 * A schedule time as the console prints it, in the user's time format: on
 * server time it needs no zone ("22:00", "10:00 PM"); on any other zone (an
 * older job, or one set from the CLI) it names it ("22:00 UTC",
 * "10:00 PM Europe/Berlin"), since the run then falls at another server time
 * as the two zones' daylight saving differ.
 */
export function scheduleTimeLabel(atTime: string, zone: string | null | undefined): string {
  const clock = formatWallClock(atTime);
  return !zone || isDisplayZone(zone) ? clock : `${clock} ${scheduleZoneName(zone)}`;
}

/** Stable local-day key ("yyyy-MM-dd") of a calendar cell, which is a local
 *  `Date` at midnight. */
export function dayKey(d: Date | string): string {
  return format(typeof d === "string" ? new Date(d) : d, "yyyy-MM-dd");
}

/** Group moments into a `dayKey → items[]` map by the display zone's calendar
 *  day each falls on, which is the day the console prints for it. */
export function groupByDay<T>(items: T[], getDate: (item: T) => Date | string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKeyIn(getDate(item));
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
