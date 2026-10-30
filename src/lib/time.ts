// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Time zones, and the one way the console prints a moment. See
 * doc/TimeZones.md for the model; in short:
 *
 * - Display zone: the browser's. Every absolute time the console prints is in
 *   it and carries its label ("Oct 23, 01:00 GMT+3"); the tooltip
 *   (`utcTitle`) gives the same moment in UTC.
 * - Job zone: the zone a schedule's wall-clock time ("22:00") is read in, per
 *   schedule, as the appliance reports it. Schedules are printed in it, with
 *   the display-zone equivalent beside them when that reads differently.
 * - Appliance zone: the operating system zone of the appliance; read-only.
 *
 * No date library here knows zones (date-fns 3 has no zone support), so the
 * zone arithmetic below runs on `Intl.DateTimeFormat`, which every supported
 * browser carries with the full IANA database.
 */
import i18n from "@/i18n";
import { languageMeta } from "@/i18n/languages";

export const UTC = "UTC";

/* ----------------------------------------------------------------- zones -- */

let browserZone: string | null = null;

/** The browser's IANA zone; the console's display zone. */
export function userTimeZone(): string {
  if (browserZone === null) {
    try {
      browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || UTC;
    } catch {
      browserZone = UTC;
    }
  }
  return browserZone;
}

/** Whether `zone` is a name this browser can compute with. */
export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Every zone the browser knows, for a picker; UTC first. */
export function allTimeZones(): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    /* an older browser: the picker still offers the zones named below */
  }
  return [UTC, ...zones.filter((z) => z !== UTC)];
}

/** `zone` if the browser can use it, else UTC — what the appliance falls back
 *  to for a name it does not know either. */
function usable(zone: string | null | undefined): string {
  return isValidTimeZone(zone) ? zone : UTC;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(zone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A wall-clock reading: what a clock in some zone shows. `month` is 1–12,
 *  `weekday` 0 (Sun) – 6 (Sat). */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

/** What a clock in `zone` shows at `at`. */
export function wallTime(at: Date | number, zone: string): WallTime {
  const p: Record<string, string> = {};
  for (const part of partsFormatter(usable(zone)).formatToParts(at)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** `zone`'s offset from UTC at `at`, in minutes (GMT+3 → 180). */
export function offsetMinutes(zone: string, at: Date | number): number {
  const ms = typeof at === "number" ? at : at.getTime();
  const w = wallTime(ms, zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/**
 * The moment a clock in `zone` reads the given wall time. In the hour a DST
 * change skips, the result is the same wall time on the offset from before
 * the change (02:30 that never happened → 03:30); in the hour it repeats, the
 * first of the two. That is how the appliance reads a schedule time too.
 */
export function instantAt(
  wall: Pick<WallTime, "year" | "month" | "day" | "hour" | "minute">,
  zone: string,
): Date {
  const z = usable(zone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // A day either side is past any offset change at this wall time.
  const early = asUtc - offsetMinutes(z, asUtc - 86_400_000) * 60_000;
  const late = asUtc - offsetMinutes(z, asUtc + 86_400_000) * 60_000;
  if (early === late) return new Date(early);
  const readsBack = (t: number) => {
    const w = wallTime(t, z);
    return w.day === wall.day && w.hour === wall.hour && w.minute === wall.minute;
  };
  const earlyOk = readsBack(early);
  const lateOk = readsBack(late);
  if (earlyOk && lateOk) return new Date(Math.min(early, late));
  if (lateOk) return new Date(late);
  return new Date(early);
}

/** "UTC" for a zero offset, else "GMT+3", "GMT-4", "GMT+5:30". Computed rather
 *  than taken from `Intl`, which spells zero as "GMT", "GMT+0" or "UTC"
 *  depending on the browser. */
export function offsetLabel(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** The label of `zone` at `at`: its offset then ("GMT+3"). */
export function zoneLabel(zone: string, at: Date | number = Date.now()): string {
  return offsetLabel(offsetMinutes(usable(zone), at));
}

/** A schedule's zone as the console names it: "UTC", or the IANA name
 *  ("Europe/Kyiv"), which keeps its meaning across DST where an offset does
 *  not. */
export function scheduleZoneName(zone: string | null | undefined): string {
  if (!zone) return UTC;
  return /^(Etc\/)?(UTC|GMT|Zulu|Universal|UCT)$/i.test(zone) ? UTC : zone;
}

/* ------------------------------------------------------------ formatting -- */

export type TimeInput = string | number | Date | null | undefined;

function toDate(value: TimeInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const textFormatters = new Map<string, Intl.DateTimeFormat>();

function textFormatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = languageMeta(i18n.language).bcp47;
  const key = `${locale}|${zone}|${JSON.stringify(options)}`;
  let f = textFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone, hourCycle: "h23" });
    textFormatters.set(key, f);
  }
  return f;
}

export interface FormatOptions {
  /** The zone to print in; the display zone by default. */
  zone?: string;
  /** Add seconds: log lines, clocks. */
  seconds?: boolean;
  /** Lead with the weekday: "Sat, Oct 25, 01:00 GMT+3". */
  weekday?: boolean;
  /** Leave the zone label off — only where a label right beside it already
   *  names the zone. */
  noZone?: boolean;
}

/**
 * The console's one date-and-time format: "Oct 23, 01:00 GMT+3", with the year
 * when it is not the current one ("Oct 23, 2025, 01:00 GMT+3"). "—" for no
 * value.
 */
export function formatDateTime(value: TimeInput, options: FormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return "—";
  const zone = usable(options.zone ?? userTimeZone());
  const thisYear = wallTime(Date.now(), zone).year === wallTime(d, zone).year;
  const text = textFormatter(zone, {
    ...(options.weekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    ...(options.seconds ? { second: "2-digit" } : {}),
  }).format(d);
  return options.noZone ? text : `${text} ${zoneLabel(zone, d)}`;
}

/** Time of day with its zone: "01:00 GMT+3". For a row under a heading that
 *  already names the day. */
export function formatTime(value: TimeInput, options: Omit<FormatOptions, "weekday"> = {}): string {
  const d = toDate(value);
  if (!d) return "—";
  const zone = usable(options.zone ?? userTimeZone());
  const text = textFormatter(zone, {
    hour: "2-digit",
    minute: "2-digit",
    ...(options.seconds ? { second: "2-digit" } : {}),
  }).format(d);
  return options.noZone ? text : `${text} ${zoneLabel(zone, d)}`;
}

/** A calendar day in the display zone: "Oct 23", "Oct 23, 2025". A day has no
 *  zone label of its own; the screens that group by day name the zone once. */
export function formatDate(value: TimeInput, options: Pick<FormatOptions, "zone" | "weekday"> = {}): string {
  const d = toDate(value);
  if (!d) return "—";
  const zone = usable(options.zone ?? userTimeZone());
  const thisYear = wallTime(Date.now(), zone).year === wallTime(d, zone).year;
  return textFormatter(zone, {
    ...(options.weekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  }).format(d);
}

/** The tooltip of every absolute time: the moment in UTC, ISO-style, to the
 *  second ("2026-10-22 22:00:03 UTC"). */
export function utcTitle(value: TimeInput): string | undefined {
  const d = toDate(value);
  if (!d) return undefined;
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** "yyyy-MM-dd" of the calendar day `value` falls on in `zone` (the display
 *  zone by default): the key "Today"/"Yesterday" groups and calendar cells
 *  bucket by. */
export function dayKeyIn(value: Date | number | string, zone: string = userTimeZone()): string {
  const w = wallTime(typeof value === "string" ? new Date(value) : value, zone);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** Whole calendar days from `value`'s day to today's, in the display zone:
 *  0 today, 1 yesterday, negative in the future. */
export function daysAgo(value: Date | number | string, now: Date | number = Date.now()): number {
  const day = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(day(dayKeyIn(now)) - day(dayKeyIn(value)));
}
