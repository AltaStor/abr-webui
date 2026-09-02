// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { addDays, format, isBefore, startOfDay } from "date-fns";
import type { Schedule } from "@/types";

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
