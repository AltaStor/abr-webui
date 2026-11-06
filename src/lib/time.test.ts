// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/* The console's time formatting (lib/time.ts). Run with `npm test`: Node runs
 * the TypeScript as it is, with its own full IANA zone database. */
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  allTimeZones,
  AUTO_TIME_ZONE,
  browserTimeZone,
  currentZoneName,
  DEFAULT_DISPLAY_PREFERENCES,
  formatDate,
  formatDateTime,
  formatTime,
  formatWallClock,
  instantAt,
  preferredZoneName,
  resolveTimeZone,
  setDisplayPreferences,
  userTimeZone,
  utcTitle,
  zoneLabel,
  zonePickerLabel,
} from "./time.ts";

// Thursday 22 October 2026, 22:05:09 UTC.
const MOMENT = "2026-10-22T22:05:09Z";

// Cases read in DD/MM/YYYY, whose digits are the easiest to check; the
// default format has cases of its own below.
beforeEach(() => setDisplayPreferences({ ...DEFAULT_DISPLAY_PREFERENCES, dateFormat: "DD/MM/YYYY" }));
afterEach(() => setDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES));

describe("time format", () => {
  test("24-hour", () => {
    setDisplayPreferences({ timeZone: "UTC", timeFormat: "24h" });
    assert.equal(formatDateTime(MOMENT), "22/10/2026 22:05 UTC");
    assert.equal(formatTime(MOMENT, { seconds: true }), "22:05:09 UTC");
    assert.equal(formatTime("2026-10-22T00:00:00Z"), "00:00 UTC");
  });

  test("12-hour", () => {
    setDisplayPreferences({ timeZone: "UTC", timeFormat: "12h" });
    assert.equal(formatDateTime(MOMENT), "22/10/2026 10:05 PM UTC");
    assert.equal(formatTime(MOMENT, { seconds: true }), "10:05:09 PM UTC");
    assert.equal(formatTime("2026-10-22T00:30:00Z"), "12:30 AM UTC");
    assert.equal(formatTime("2026-10-22T12:00:00Z"), "12:00 PM UTC");
    assert.equal(formatTime("2026-10-22T09:15:00Z", { noZone: true }), "9:15 AM");
  });

  test("a schedule's wall-clock time", () => {
    assert.equal(formatWallClock("22:00", "24h"), "22:00");
    assert.equal(formatWallClock("22:00", "12h"), "10:00 PM");
    assert.equal(formatWallClock("00:00", "12h"), "12:00 AM");
    assert.equal(formatWallClock("7:05", "24h"), "07:05");
    assert.equal(formatWallClock("0 2 * * *", "12h"), "0 2 * * *");
  });
});

describe("date format", () => {
  test("the default spells the month, so no reader takes 4 November for 11 April", () => {
    assert.equal(DEFAULT_DISPLAY_PREFERENCES.dateFormat, "D MMM YYYY");
    setDisplayPreferences({ ...DEFAULT_DISPLAY_PREFERENCES, timeZone: "UTC" });
    assert.equal(formatDateTime("2026-11-04T09:41:00Z"), "4 Nov 2026 09:41 UTC");
    assert.equal(formatDate(MOMENT), "22 Oct 2026");
    assert.equal(formatDate(MOMENT, { short: true }), "22 Oct");
    assert.equal(formatDateTime(MOMENT, { weekday: true }), "Thu, 22 Oct 2026 22:05 UTC");
  });

  test("the spelled month follows the console language, day first", () => {
    const spelled = (locale: string) => {
      setDisplayPreferences({ timeZone: "UTC", dateFormat: "D MMM YYYY", locale });
      return formatDate("2026-11-04T09:41:00Z");
    };
    assert.equal(spelled("en-US"), "4 Nov 2026");
    assert.equal(spelled("de-DE"), "4. Nov. 2026");
    assert.equal(spelled("fr-FR"), "4 nov. 2026");
    assert.equal(spelled("es-ES"), "4 nov 2026");
  });

  test("DD/MM/YYYY", () => {
    setDisplayPreferences({ timeZone: "UTC" });
    assert.equal(formatDate(MOMENT), "22/10/2026");
    assert.equal(formatDate(MOMENT, { short: true }), "22/10");
  });

  test("MM/DD/YYYY", () => {
    setDisplayPreferences({ timeZone: "UTC", dateFormat: "MM/DD/YYYY" });
    assert.equal(formatDate(MOMENT), "10/22/2026");
    assert.equal(formatDateTime(MOMENT), "10/22/2026 22:05 UTC");
    assert.equal(formatDate(MOMENT, { short: true }), "10/22");
  });

  test("YYYY-MM-DD", () => {
    setDisplayPreferences({ timeZone: "UTC", dateFormat: "YYYY-MM-DD" });
    assert.equal(formatDate(MOMENT), "2026-10-22");
    assert.equal(formatDateTime(MOMENT), "2026-10-22 22:05 UTC");
  });

  test("with the weekday", () => {
    setDisplayPreferences({ timeZone: "UTC" });
    assert.equal(formatDateTime(MOMENT, { weekday: true }), "Thu, 22/10/2026 22:05 UTC");
    assert.equal(formatDate(MOMENT, { weekday: true }), "Thu, 22/10/2026");
  });

  test("the day is the display zone's", () => {
    setDisplayPreferences({ timeZone: "Asia/Tokyo" });
    assert.equal(formatDateTime(MOMENT), "23/10/2026 07:05 GMT+9");
    setDisplayPreferences({ timeZone: "America/Los_Angeles" });
    assert.equal(formatDateTime(MOMENT), "22/10/2026 15:05 GMT-7");
  });

  test("options override the saved formats, for a preview", () => {
    setDisplayPreferences({ timeZone: "UTC" });
    assert.equal(formatDateTime(MOMENT, { dateFormat: "YYYY-MM-DD", timeFormat: "12h" }), "2026-10-22 10:05 PM UTC");
  });
});

describe("daylight saving time", () => {
  test("the hour Kyiv repeats in autumn reads the same twice, on two offsets", () => {
    setDisplayPreferences({ timeZone: "Europe/Kyiv" });
    // 25 October 2026: clocks go from 04:00 EEST back to 03:00 EET.
    assert.equal(formatDateTime("2026-10-25T00:30:00Z"), "25/10/2026 03:30 GMT+3");
    assert.equal(formatDateTime("2026-10-25T01:30:00Z"), "25/10/2026 03:30 GMT+2");
    // A schedule time in that hour runs at the first of the two.
    const repeated = instantAt({ year: 2026, month: 10, day: 25, hour: 3, minute: 30 }, "Europe/Kyiv");
    assert.equal(repeated.toISOString(), "2026-10-25T00:30:00.000Z");
  });

  test("New York skips 02:00-03:00 in spring", () => {
    setDisplayPreferences({ timeZone: "America/New_York", timeFormat: "12h" });
    // 8 March 2026: clocks go from 02:00 EST to 03:00 EDT.
    assert.equal(formatTime("2026-03-08T06:59:00Z"), "1:59 AM GMT-5");
    assert.equal(formatTime("2026-03-08T07:00:00Z"), "3:00 AM GMT-4");
    // A schedule time inside the skipped hour runs at the same wall time on
    // the offset from before the change.
    const skipped = instantAt({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/New_York");
    assert.equal(skipped.toISOString(), "2026-03-08T07:30:00.000Z");
  });

  test("the picker labels a zone by its offset on the given day", () => {
    assert.equal(zonePickerLabel("Australia/Sydney", Date.parse("2026-07-01T00:00:00Z")), "(UTC +10:00) Sydney");
    assert.equal(zonePickerLabel("Australia/Sydney", Date.parse("2026-12-01T00:00:00Z")), "(UTC +11:00) Sydney");
  });
});

describe("offsets that are not whole hours", () => {
  test("India, UTC+05:30", () => {
    setDisplayPreferences({ timeZone: "Asia/Kolkata" });
    assert.equal(formatDateTime(MOMENT), "23/10/2026 03:35 GMT+5:30");
    assert.equal(zonePickerLabel("Asia/Kolkata"), "(UTC +05:30) Kolkata");
  });

  test("the picker names a zone by its current name", () => {
    // What browsers list for India and Kyiv.
    assert.equal(zonePickerLabel("Asia/Calcutta", Date.parse(MOMENT)), "(UTC +05:30) Kolkata");
    assert.equal(zonePickerLabel("Europe/Kiev", Date.parse(MOMENT)), "(UTC +03:00) Kyiv");
  });

  test("Nepal, UTC+05:45, and Newfoundland, below UTC", () => {
    assert.equal(zoneLabel("Asia/Kathmandu", Date.parse(MOMENT)), "GMT+5:45");
    assert.equal(zonePickerLabel("America/St_Johns", Date.parse("2026-01-15T00:00:00Z")), "(UTC -03:30) St Johns");
  });
});

describe("UTC", () => {
  test("the tooltip is the same moment in UTC, in the user's formats", () => {
    setDisplayPreferences({ timeZone: "Asia/Kolkata", dateFormat: "MM/DD/YYYY", timeFormat: "12h" });
    assert.equal(utcTitle(MOMENT), "10/22/2026 10:05:09 PM UTC");
    assert.equal(utcTitle(null), undefined);
  });

  test("a zone the browser does not know prints in UTC", () => {
    assert.equal(formatDateTime(MOMENT, { zone: "Mars/Olympus_Mons" }), "22/10/2026 22:05 UTC");
    assert.equal(zoneLabel("Mars/Olympus_Mons", Date.parse(MOMENT)), "UTC");
  });

  test("a zero offset is labelled UTC, whatever the zone", () => {
    setDisplayPreferences({ timeZone: "Europe/London" });
    assert.equal(formatDateTime("2026-01-15T09:00:00Z"), "15/01/2026 09:00 UTC");
    assert.equal(zonePickerLabel("UTC"), "(UTC +00:00) UTC");
  });

  test("no value", () => {
    assert.equal(formatDateTime(null), "—");
    assert.equal(formatDate(""), "—");
    assert.equal(formatTime("not a date"), "—");
  });
});

describe("display zone", () => {
  test("Auto is the browser's zone", () => {
    setDisplayPreferences({ timeZone: AUTO_TIME_ZONE });
    assert.equal(userTimeZone(), browserTimeZone());
    assert.equal(browserTimeZone(), preferredZoneName(Intl.DateTimeFormat().resolvedOptions().timeZone));
  });

  test("a picked zone is used", () => {
    setDisplayPreferences({ timeZone: "Asia/Kolkata" });
    assert.equal(userTimeZone(), "Asia/Kolkata");
  });

  test("a saved zone this browser does not know falls back to the browser's", () => {
    setDisplayPreferences({ timeZone: "Mars/Olympus_Mons" });
    assert.equal(userTimeZone(), browserTimeZone());
  });
});

describe("old zone names", () => {
  // Browsers report Kyiv as "Europe/Kiev"; an appliance on Debian 13 refused a
  // job saved with it ("Unknown time zone 'Europe/Kiev'").
  test("the console uses the current name", () => {
    assert.equal(preferredZoneName("Europe/Kiev"), "Europe/Kyiv");
    assert.equal(preferredZoneName("Asia/Calcutta"), "Asia/Kolkata");
    assert.equal(preferredZoneName("Europe/Berlin"), "Europe/Berlin");
    assert.equal(resolveTimeZone("Europe/Kiev"), "Europe/Kyiv");
    setDisplayPreferences({ timeZone: "Asia/Saigon" });
    assert.equal(userTimeZone(), "Asia/Ho_Chi_Minh");
  });

  test("the zone list has no old names", () => {
    const zones = allTimeZones();
    assert.ok(zones.includes("Europe/Kyiv"));
    assert.ok(!zones.includes("Europe/Kiev"));
    assert.equal(zones.filter((zone) => currentZoneName(zone) !== zone).length, 0);
    assert.equal(new Set(zones).size, zones.length);
  });

  test("the appliance is sent the current name", () => {
    assert.equal(currentZoneName("Europe/Kiev"), "Europe/Kyiv");
    assert.equal(currentZoneName("UTC"), "UTC");
  });
});
