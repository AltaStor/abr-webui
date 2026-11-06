// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Time zones, and the one way the console prints a moment. See
 * doc/TimeZones.md for the model; in short:
 *
 * - Display zone: the one the user picked in Settings → Appearance, or the
 *   browser's on "Auto" (the default). Every absolute time the console prints
 *   is in it and carries its label ("23 Oct 2026 01:00 GMT+3"); the tooltip
 *   (`utcTitle`) gives the same moment in UTC.
 * - Job zone: the zone a schedule's wall-clock time ("22:00") is read in, per
 *   schedule, as the appliance reports it. Schedules are printed in it, with
 *   the display-zone equivalent beside them when that reads differently.
 * - Appliance zone: the operating system zone of the appliance; read-only.
 *
 * The date format (D MMM YYYY, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) and the time format
 * (24-hour, 12-hour) are the user's too. The settings store hands all of it
 * to `setDisplayPreferences`; this module reads no store and imports nothing
 * at run time, so `node --test` runs it as it is (time.test.ts).
 *
 * No date library here knows zones (date-fns 3 has no zone support), so the
 * zone arithmetic below runs on `Intl.DateTimeFormat`, which every supported
 * browser carries with the full IANA database.
 */
import type { DateFormat, TimeFormat } from "@/types";

export const UTC = "UTC";

/* ----------------------------------------------------------- preferences -- */

/** The time zone setting that means "the browser's". */
export const AUTO_TIME_ZONE = "auto";

export interface DisplayPreferences {
  /** An IANA zone, or `AUTO_TIME_ZONE`. */
  timeZone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  /** BCP-47 tag the weekday and month names are spelled in. */
  locale: string;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  timeZone: AUTO_TIME_ZONE,
  // Not DD/MM/YYYY: "04/11/2026" is 4 November to some readers and 11 April
  // to others (ABR-515); a spelled month is one day to everyone.
  dateFormat: "D MMM YYYY",
  timeFormat: "24h",
  locale: "en-US",
};

let preferences: DisplayPreferences = DEFAULT_DISPLAY_PREFERENCES;

/** Takes the user's zone and formats; every format call after reads them. */
export function setDisplayPreferences(next: Partial<DisplayPreferences>): void {
  preferences = { ...preferences, ...next };
}

export function displayPreferences(): DisplayPreferences {
  return preferences;
}

/* ----------------------------------------------------------------- zones -- */

let browserZone: string | null = null;

/** The browser's IANA zone, which its operating system sets, by its current
 *  name ("Europe/Kyiv", though the browser says "Europe/Kiev"). */
export function browserTimeZone(): string {
  if (browserZone === null) {
    try {
      browserZone = preferredZoneName(Intl.DateTimeFormat().resolvedOptions().timeZone || UTC);
    } catch {
      browserZone = UTC;
    }
  }
  return browserZone;
}

/** The console's display zone: the user's pick, or the browser's on "Auto"
 *  and for a picked zone this browser does not know. */
export function userTimeZone(): string {
  return resolveTimeZone(preferences.timeZone);
}

/** The zone a time zone setting prints in. */
export function resolveTimeZone(setting: string): string {
  return setting !== AUTO_TIME_ZONE && isValidTimeZone(setting) ? preferredZoneName(setting) : browserTimeZone();
}

const zoneValidity = new Map<string, boolean>();

/** Whether `zone` is a name this browser can compute with. */
export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  let valid = zoneValidity.get(zone);
  if (valid === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      valid = true;
    } catch {
      valid = false;
    }
    zoneValidity.set(zone, valid);
  }
  return valid;
}

/** Every zone the browser knows, by current names, for a picker; UTC first. */
export function allTimeZones(): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    /* an older browser: the picker still offers the zones named below */
  }
  return [UTC, ...new Set(zones.filter((z) => z !== UTC).map(preferredZoneName))];
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

/* Browsers report zones by their CLDR names, which keep some names IANA has
 * since replaced: Chrome, Firefox and Node say "Asia/Calcutta" and
 * "Europe/Kiev", not "Asia/Kolkata" or "Europe/Kyiv". Browsers accept both,
 * but an appliance on Debian 13 knows only the current names (the old ones
 * are in tzdata-legacy, which it does not have) and refused a job saved as
 * "Europe/Kiev". So the console uses the current names throughout and sends
 * nothing else. The appliance keeps the same table (RENAMED_ZONES in
 * python/srv/core/time_zones.py) for older clients and catalogs. */
const RENAMED_ZONES: Record<string, string> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

/** A zone's current IANA name: "Europe/Kiev" → "Europe/Kyiv". What a zone is
 *  sent to the appliance as. */
export function currentZoneName(zone: string): string {
  return RENAMED_ZONES[zone] ?? zone;
}

/** `currentZoneName`, where this browser computes with the current name too
 *  (any current one does; an old one may not), so that a zone the browser
 *  reports and the same zone the appliance reports compare equal. */
export function preferredZoneName(zone: string): string {
  const current = currentZoneName(zone);
  return current !== zone && isValidTimeZone(current) ? current : zone;
}

/** The place an IANA zone is named after, by its current name:
 *  "Europe/Kiev" → "Kyiv", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(zone: string): string {
  if (scheduleZoneName(zone) === UTC) return UTC;
  return (currentZoneName(zone).split("/").pop() ?? zone).replace(/_/g, " ");
}

/** A zone the way the zone picker lists it, at its offset on `at` (today by
 *  default, so DST is the current one): "(UTC +02:00) Kyiv",
 *  "(UTC +05:30) Kolkata". */
export function zonePickerLabel(zone: string, at: Date | number = Date.now()): string {
  const minutes = offsetMinutes(usable(zone), at);
  const abs = Math.abs(minutes);
  const hhmm = `${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `(UTC ${minutes < 0 ? "-" : "+"}${hhmm}) ${zoneCity(zone)}`;
}

/* ------------------------------------------------------------ formatting -- */

export type TimeInput = string | number | Date | null | undefined;

function toDate(value: TimeInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A calendar day in `format`: "23 Oct 2026", "23/10/2026", "10/23/2026",
 *  "2026-10-23"; without the year "23 Oct", "23/10", "10/23", "10-23". */
function dayText(w: Pick<WallTime, "year" | "month" | "day">, format: DateFormat, withYear = true): string {
  const d = pad(w.day);
  const m = pad(w.month);
  switch (format) {
    case "D MMM YYYY":
      return spelledDay(w, withYear, preferences.locale);
    case "MM/DD/YYYY":
      return withYear ? `${m}/${d}/${w.year}` : `${m}/${d}`;
    case "YYYY-MM-DD":
      return withYear ? `${w.year}-${m}-${d}` : `${m}-${d}`;
    default:
      return withYear ? `${d}/${m}/${w.year}` : `${d}/${m}`;
  }
}

/** A clock reading in `format`: "13:05", "1:05 PM"; "13:05:09", "1:05:09 PM". */
function clockText(hour: number, minute: number, second: number | null, format: TimeFormat): string {
  const rest = `${pad(minute)}${second === null ? "" : `:${pad(second)}`}`;
  if (format === "12h") return `${hour % 12 || 12}:${rest} ${hour < 12 ? "AM" : "PM"}`;
  return `${pad(hour)}:${rest}`;
}

const spelledDays = new Map<string, Intl.DateTimeFormat>();

/** The day, the month's short name and the year, in that order and in the
 *  console's language: "4 Nov 2026", "4. Nov. 2026", "4 nov. 2026"; "4 Nov"
 *  without the year. English is written the British way, since "en-US" would
 *  put the month first ("Nov 4, 2026") and the format promises day first. */
function spelledDay(w: Pick<WallTime, "year" | "month" | "day">, withYear: boolean, locale: string): string {
  const tag = /^en(-|$)/i.test(locale) ? "en-GB" : locale;
  const key = `${tag}|${withYear}`;
  let f = spelledDays.get(key);
  if (!f) {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: UTC,
    };
    try {
      f = new Intl.DateTimeFormat(tag, options);
    } catch {
      f = new Intl.DateTimeFormat("en-GB", options);
    }
    spelledDays.set(key, f);
  }
  return f.format(Date.UTC(w.year, w.month - 1, w.day));
}

const weekdayNames = new Map<string, string[]>();

/** "Thu" for weekday 4, in the user's language. */
function weekdayName(weekday: number, locale: string): string {
  let names = weekdayNames.get(locale);
  if (!names) {
    let f: Intl.DateTimeFormat;
    try {
      f = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: UTC });
    } catch {
      f = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: UTC });
    }
    // 2024-01-07 was a Sunday.
    names = WEEKDAYS.map((_, i) => f.format(Date.UTC(2024, 0, 7 + i)));
    weekdayNames.set(locale, names);
  }
  return names[weekday] ?? WEEKDAYS[weekday] ?? "";
}

export interface FormatOptions {
  /** The zone to print in; the display zone by default. */
  zone?: string;
  /** Add seconds: log lines, clocks. */
  seconds?: boolean;
  /** Lead with the weekday: "Sat, 25/10/2026 01:00 GMT+3". */
  weekday?: boolean;
  /** Leave the zone label off — only where a label right beside it already
   *  names the zone. */
  noZone?: boolean;
  /** Formats other than the user's: a preview of ones not saved yet. */
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
}

/**
 * The console's one date-and-time format, in the user's date and time formats
 * and the display zone, with the zone's label: "23 Oct 2026 01:00 GMT+3",
 * "10/23/2026 1:00 AM GMT+3". "—" for no value.
 */
export function formatDateTime(value: TimeInput, options: FormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return "—";
  const zone = usable(options.zone ?? userTimeZone());
  const w = wallTime(d, zone);
  const day = dayText(w, options.dateFormat ?? preferences.dateFormat);
  const clock = clockText(w.hour, w.minute, options.seconds ? w.second : null, options.timeFormat ?? preferences.timeFormat);
  const text = `${options.weekday ? `${weekdayName(w.weekday, preferences.locale)}, ` : ""}${day} ${clock}`;
  return options.noZone ? text : `${text} ${zoneLabel(zone, d)}`;
}

/** Time of day with its zone: "01:00 GMT+3", "1:00 AM GMT+3". For a row
 *  under a heading that already names the day. */
export function formatTime(
  value: TimeInput,
  options: Omit<FormatOptions, "weekday" | "dateFormat"> = {},
): string {
  const d = toDate(value);
  if (!d) return "—";
  const zone = usable(options.zone ?? userTimeZone());
  const w = wallTime(d, zone);
  const text = clockText(w.hour, w.minute, options.seconds ? w.second : null, options.timeFormat ?? preferences.timeFormat);
  return options.noZone ? text : `${text} ${zoneLabel(zone, d)}`;
}

/** A calendar day in the display zone: "23 Oct 2026"; "23 Oct" with `short`,
 *  for a chart axis. A day has no zone label of its own; the screens that
 *  group by day name the zone once. */
export function formatDate(
  value: TimeInput,
  options: Pick<FormatOptions, "zone" | "weekday" | "dateFormat"> & { short?: boolean } = {},
): string {
  const d = toDate(value);
  if (!d) return "—";
  const w = wallTime(d, usable(options.zone ?? userTimeZone()));
  const day = dayText(w, options.dateFormat ?? preferences.dateFormat, !options.short);
  return options.weekday ? `${weekdayName(w.weekday, preferences.locale)}, ${day}` : day;
}

/** A day of a calendar grid, which is a local `Date` at midnight rather than a
 *  moment: its own year, month and day, in the user's date format. */
export function formatCalendarDay(day: Date, options: { weekday?: boolean } = {}): string {
  const text = dayText({ year: day.getFullYear(), month: day.getMonth() + 1, day: day.getDate() }, preferences.dateFormat);
  return options.weekday ? `${weekdayName(day.getDay(), preferences.locale)}, ${text}` : text;
}

/** A schedule's wall-clock time ("22:00", as the appliance stores it) in the
 *  user's time format: "22:00" or "10:00 PM". Anything else is returned as
 *  it came. */
export function formatWallClock(atTime: string, timeFormat: TimeFormat = preferences.timeFormat): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(atTime.trim());
  if (!m) return atTime;
  return clockText(Number(m[1]) % 24, Number(m[2]), null, timeFormat);
}

/** The tooltip of every absolute time: the same moment in UTC, to the second,
 *  in the user's formats ("22/10/2026 22:00:03 UTC"). */
export function utcTitle(value: TimeInput): string | undefined {
  const d = toDate(value);
  if (!d) return undefined;
  return formatDateTime(d, { zone: UTC, seconds: true });
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
