// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/* The console's time formatting (lib/time.ts). Run with `npm test`: Node runs
 * the TypeScript as it is, with its own full IANA zone database. */
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_TIME_ZONE,
  browserTimeZone,
  currentZoneName,
  DEFAULT_DISPLAY_PREFERENCES,
  displayTimeZone,
  formatDate,
  formatDateTime,
  formatTime,
  formatWallClock,
  instantAt,
  isDisplayZone,
  preferredZoneName,
  setDisplayPreferences,
  utcOffsetLabel,
  utcTitle,
  zoneCity,
  zoneLabel,
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
    assert.equal(formatDateTime(MOMENT), "22/10/2026 22:05");
    assert.equal(formatTime(MOMENT, { seconds: true }), "22:05:09");
    assert.equal(formatTime("2026-10-22T00:00:00Z"), "00:00");
  });

  test("12-hour", () => {
    setDisplayPreferences({ timeZone: "UTC", timeFormat: "12h" });
    assert.equal(formatDateTime(MOMENT), "22/10/2026 10:05 PM");
    assert.equal(formatTime(MOMENT, { seconds: true }), "10:05:09 PM");
    assert.equal(formatTime("2026-10-22T00:30:00Z"), "12:30 AM");
    assert.equal(formatTime("2026-10-22T12:00:00Z"), "12:00 PM");
    assert.equal(formatTime("2026-10-22T09:15:00Z", { withZone: true }), "9:15 AM UTC");
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
    assert.equal(formatDateTime("2026-11-04T09:41:00Z"), "4 Nov 2026 09:41");
    assert.equal(formatDate(MOMENT), "22 Oct 2026");
    assert.equal(formatDate(MOMENT, { short: true }), "22 Oct");
    assert.equal(formatDateTime(MOMENT, { weekday: true }), "Thu, 22 Oct 2026 22:05");
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
    assert.equal(formatDateTime(MOMENT), "10/22/2026 22:05");
    assert.equal(formatDate(MOMENT, { short: true }), "10/22");
  });

  test("YYYY-MM-DD", () => {
    setDisplayPreferences({ timeZone: "UTC", dateFormat: "YYYY-MM-DD" });
    assert.equal(formatDate(MOMENT), "2026-10-22");
    assert.equal(formatDateTime(MOMENT), "2026-10-22 22:05");
  });

  test("with the weekday", () => {
    setDisplayPreferences({ timeZone: "UTC" });
    assert.equal(formatDateTime(MOMENT, { weekday: true }), "Thu, 22/10/2026 22:05");
    assert.equal(formatDate(MOMENT, { weekday: true }), "Thu, 22/10/2026");
  });

  test("the day is the server's", () => {
    setDisplayPreferences({ timeZone: "Asia/Tokyo" });
    assert.equal(formatDateTime(MOMENT), "23/10/2026 07:05");
    setDisplayPreferences({ timeZone: "America/Los_Angeles" });
    assert.equal(formatDateTime(MOMENT), "22/10/2026 15:05");
    assert.equal(formatDateTime(MOMENT, { withZone: true }), "22/10/2026 15:05 GMT-7");
  });

  test("options override the saved formats, for a preview", () => {
    setDisplayPreferences({ timeZone: "UTC" });
    assert.equal(formatDateTime(MOMENT, { dateFormat: "YYYY-MM-DD", timeFormat: "12h" }), "2026-10-22 10:05 PM");
  });
});

describe("daylight saving time", () => {
  test("the hour Kyiv repeats in autumn reads the same twice, on two offsets", () => {
    setDisplayPreferences({ timeZone: "Europe/Kyiv" });
    // 25 October 2026: clocks go from 04:00 EEST back to 03:00 EET.
    assert.equal(formatDateTime("2026-10-25T00:30:00Z", { withZone: true }), "25/10/2026 03:30 GMT+3");
    assert.equal(formatDateTime("2026-10-25T01:30:00Z", { withZone: true }), "25/10/2026 03:30 GMT+2");
    // A schedule time in that hour runs at the first of the two.
    const repeated = instantAt({ year: 2026, month: 10, day: 25, hour: 3, minute: 30 }, "Europe/Kyiv");
    assert.equal(repeated.toISOString(), "2026-10-25T00:30:00.000Z");
  });

  test("New York skips 02:00-03:00 in spring", () => {
    setDisplayPreferences({ timeZone: "America/New_York", timeFormat: "12h" });
    // 8 March 2026: clocks go from 02:00 EST to 03:00 EDT.
    assert.equal(formatTime("2026-03-08T06:59:00Z"), "1:59 AM");
    assert.equal(formatTime("2026-03-08T07:00:00Z"), "3:00 AM");
    assert.equal(formatTime("2026-03-08T07:00:00Z", { withZone: true }), "3:00 AM GMT-4");
    // A schedule time inside the skipped hour runs at the same wall time on
    // the offset from before the change.
    const skipped = instantAt({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/New_York");
    assert.equal(skipped.toISOString(), "2026-03-08T07:30:00.000Z");
  });

  test("the server clock names a zone by its offset on the given day", () => {
    assert.equal(zoneLabel("Australia/Sydney", Date.parse("2026-07-01T00:00:00Z")), "GMT+10");
    assert.equal(zoneLabel("Australia/Sydney", Date.parse("2026-12-01T00:00:00Z")), "GMT+11");
  });
});

describe("offsets that are not whole hours", () => {
  test("India, UTC+05:30", () => {
    setDisplayPreferences({ timeZone: "Asia/Kolkata" });
    assert.equal(formatDateTime(MOMENT), "23/10/2026 03:35");
    assert.equal(formatDateTime(MOMENT, { withZone: true }), "23/10/2026 03:35 GMT+5:30");
    assert.equal(utcOffsetLabel(330), "UTC+5:30");
  });

  test("the server clock names a zone's place by its current name", () => {
    // What browsers say for India and Kyiv.
    assert.equal(zoneCity("Asia/Calcutta"), "Kolkata");
    assert.equal(zoneCity("Europe/Kiev"), "Kyiv");
    assert.equal(zoneCity("America/Argentina/Buenos_Aires"), "Buenos Aires");
    assert.equal(zoneCity("Etc/UTC"), "UTC");
  });

  test("Nepal, UTC+05:45, and Newfoundland, below UTC", () => {
    assert.equal(zoneLabel("Asia/Kathmandu", Date.parse(MOMENT)), "GMT+5:45");
    assert.equal(utcOffsetLabel(345), "UTC+5:45");
    assert.equal(utcOffsetLabel(-210), "UTC-3:30");
    assert.equal(utcOffsetLabel(0), "UTC+0");
  });
});

describe("tooltip", () => {
  test("on a computer on server time, the same moment in UTC, in the user's formats", () => {
    setDisplayPreferences({ timeZone: browserTimeZone(), dateFormat: "MM/DD/YYYY", timeFormat: "12h" });
    assert.equal(utcTitle(MOMENT), "10/22/2026 10:05:09 PM UTC");
    assert.equal(utcTitle(null), undefined);
  });

  test("on a computer on another clock, that clock's reading too", () => {
    // A server zone whose offset is never the computer's at that moment.
    const local = browserTimeZone();
    const other = zoneLabel(local, Date.parse(MOMENT)) === "GMT+5:45" ? "Asia/Kolkata" : "Asia/Kathmandu";
    setDisplayPreferences({ timeZone: other, localSuffix: "on your computer" });
    const [utc, mine] = (utcTitle(MOMENT) ?? "").split("\n");
    assert.equal(utc, "22/10/2026 22:05:09 UTC");
    assert.equal(mine, `${formatDateTime(MOMENT, { zone: local, seconds: true, withZone: true })} on your computer`);
  });
});

describe("UTC", () => {
  test("a zone the browser does not know prints in UTC", () => {
    assert.equal(formatDateTime(MOMENT, { zone: "Mars/Olympus_Mons", withZone: true }), "22/10/2026 22:05 UTC");
    assert.equal(zoneLabel("Mars/Olympus_Mons", Date.parse(MOMENT)), "UTC");
  });

  test("a zero offset is labelled UTC, whatever the zone", () => {
    setDisplayPreferences({ timeZone: "Europe/London" });
    assert.equal(formatDateTime("2026-01-15T09:00:00Z", { withZone: true }), "15/01/2026 09:00 UTC");
  });

  test("no value", () => {
    assert.equal(formatDateTime(null), "—");
    assert.equal(formatDate(""), "—");
    assert.equal(formatTime("not a date"), "—");
  });
});

describe("server time", () => {
  test("until the appliance names its zone, the browser's stands in", () => {
    setDisplayPreferences({ timeZone: AUTO_TIME_ZONE });
    assert.equal(displayTimeZone(), browserTimeZone());
    assert.equal(browserTimeZone(), preferredZoneName(Intl.DateTimeFormat().resolvedOptions().timeZone));
  });

  test("the appliance's zone is used", () => {
    setDisplayPreferences({ timeZone: "Asia/Kolkata" });
    assert.equal(displayTimeZone(), "Asia/Kolkata");
  });

  test("a server zone this browser does not know falls back to the browser's", () => {
    setDisplayPreferences({ timeZone: "Mars/Olympus_Mons" });
    assert.equal(displayTimeZone(), browserTimeZone());
  });

  test("a schedule on server time needs no zone; one on another does", () => {
    setDisplayPreferences({ timeZone: "Europe/Kyiv" });
    assert.ok(isDisplayZone("Europe/Kyiv"));
    assert.ok(isDisplayZone("Europe/Kiev"));
    assert.ok(!isDisplayZone("UTC"));
    assert.ok(!isDisplayZone("Europe/Riga"));
    setDisplayPreferences({ timeZone: "Etc/UTC" });
    assert.ok(isDisplayZone("UTC"));
    assert.ok(!isDisplayZone(null));
  });
});

describe("old zone names", () => {
  // Browsers report Kyiv as "Europe/Kiev"; an appliance on Debian 13 refused a
  // job saved with it ("Unknown time zone 'Europe/Kiev'").
  test("the console uses the current name", () => {
    assert.equal(preferredZoneName("Europe/Kiev"), "Europe/Kyiv");
    assert.equal(preferredZoneName("Asia/Calcutta"), "Asia/Kolkata");
    assert.equal(preferredZoneName("Europe/Berlin"), "Europe/Berlin");
    setDisplayPreferences({ timeZone: "Asia/Saigon" });
    assert.equal(displayTimeZone(), "Asia/Ho_Chi_Minh");
  });

  test("the appliance is sent the current name", () => {
    assert.equal(currentZoneName("Europe/Kiev"), "Europe/Kyiv");
    assert.equal(currentZoneName("UTC"), "UTC");
  });
});
