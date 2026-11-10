# Time zones in the web console: design and implementation

Tickets: ABR-466 "WebUI shows times in mixed time zones with no zone label;
job schedule form hides the time zone", ABR-484 "Settings > Date and time"
(the date and time formats), and ABR-515 (the spelled month as the default
date format, and where the weekday is printed). This document states what was
built, so QA, support and developers do not have to read it out of the code.
It is kept in step with the code: a change to the behaviour below changes this
document in the same commit.

## 1. Chosen approach

**Server time, named once** (Henry Morgan's design of 2026-11-05 on ABR-466):

- Every absolute time is printed on **server time**, the appliance's own time
  zone, in one format and **without a zone label**: "4 Nov 2026 01:00".
- The top bar names that zone once: **"Server time 16:08 · Tallinn (UTC+2)"**.
  Its tooltip gives the zone by name, the time in UTC and, when the viewer's
  computer is on another clock, the time there.
- Hovering any time shows the same moment **in UTC**, and **on the viewer's
  computer** when that reads differently from server time.
- **No zone in the job form.** A new job runs on server time and its times are
  entered as server time. A schedule shows one zone only: none when it is on
  server time ("Daily · 22:00"), its own when it is not ("Daily · 22:00 UTC").
- One date-and-time format everywhere, in the date format and time format set
  in Settings → Appearance.

History and what was rejected:

| Option | Decision | Why |
|---|---|---|
| 1. Label every time with the viewer's zone ("01:00 GMT+3"), schedules in the job zone with the viewer's equivalent, a zone field in the job form (webui #45–#49) | Replaced | Two users in different zones read different times for one event, the labels took room on every row, and a zone per job let a team end up with jobs on several clocks. |
| 2. One display zone, the server's, for the whole console | **Implemented**, with the zone named once in the top bar | Every user reads the same time for the same event, which matches the logs, the CLI and the appliance's own scheduler. A user far from the server's zone sees their own reading on hover. |
| 3. Per-user display zone (Browser / Appliance / UTC / Custom) | Not built; the browser-stored zone setting of ABR-484 was removed | It brings back two readings of one event, which option 2 exists to prevent. |

## 2. Time zone model

| Zone | What it is | Where it is stored | Where it is read | Editable |
|---|---|---|---|---|
| **Server zone** (appliance zone) | The appliance's operating system zone (`TZ`, else `/etc/localtime`, else `/etc/timezone`, else UTC). **Every time in the console is printed in it.** | The OS | `GET /system/clock` (`timezone`, `server_time`), read by the console when it connects and every 10 minutes (`components/layout/ServerTime.tsx`), held in `store/serverClock.ts` and handed to `lib/time.ts`. Cached in the browser (`localStorage` `abr.serverTimeZone`) so the next visit's first paint is already on server time. | No (read-only) |
| **Job zone** | The zone a schedule's wall-clock time ("22:00") and a cron expression are read in. Per schedule: the base schedule, the active full and the synthetic full each carry one, and so does each copy window rule | Job record (catalog) | Job DTO `*.timezone` (never empty, see 5) | A new job gets the server zone. A job on another zone keeps it until "Use server time" in the form moves it. `abr job edit` and the API can still set any zone. |
| **Viewer's zone** | The zone of the viewer's computer | The browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`) | `browserTimeZone()` in `lib/time.ts`: only for the second tooltip line and the top bar's tooltip, and as the stand-in until the appliance has named its zone | No |

Before the appliance has answered (first visit, or a role without
`system.view`) and in the demo world, the browser's zone stands in for the
server zone. Every built-in role holds `system.view`.

The date and time formats are stored in the browser with the rest of
Appearance (`basalt.settings` → `appearance.dateFormat`: `D MMM YYYY`
(default), `DD/MM/YYYY`, `MM/DD/YYYY` or `YYYY-MM-DD`; `appearance.timeFormat`:
`24h` (default) or `12h`). `D MMM YYYY` writes the day, the month's short name
in the console language and the year: "4 Nov 2026", in German "4. Nov. 2026".
It is the default because `04/11/2026` is 4 November to some readers and
11 April to others (ABR-515).

## 3. Display rules

Implemented in `src/lib/time.ts` (`formatDateTime`, `formatDate`,
`formatTime`, `utcTitle`, `displayTimeZone`); `src/lib/format.ts` keeps its old
function names as thin wrappers. Components use `useDateTimeFormat()`
(`src/lib/useDateTimeFormat.ts`), which re-renders them when the server zone
becomes known or a format is saved; `<DateTime>` and `TimeStamp` do.
Timestamps stay ISO/UTC everywhere else and are converted only when printed.

- **One format**: the date in the user's date format, the time in the user's
  time format, on server time, no zone label: "4 Nov 2026 01:00",
  "04/11/2026 01:00", "11/04/2026 1:00 AM", "2026-11-04 01:00". The year is
  always printed (a chart axis drops it: "4 Nov"). With seconds for log lines
  and clocks ("4 Nov 2026 16:14:53"); the time alone under a heading that
  already names the day ("01:00"). The 12-hour clock writes `h:mm AM`/`PM`.
- **The weekday** ("Thu, 5 Nov 2026 01:00") leads a time a schedule decides:
  every next run (jobs list, job page, full backup schedules, job form,
  Dashboard, Activity) and a copy window's opening and closing. A moment that
  has happened or a fixed date prints without it: last runs, restore points,
  log lines, certificate dates. The restore point calendar's heading for the
  picked day keeps it. (ABR-515; `formatFullDateTime` in `lib/format.ts`.)
- **Top bar**: "Server time HH:MM · City (UTC±N)", the city from the zone's
  current IANA name (`Europe/Kiev` → Kyiv), the offset at this moment
  (`UTC+2`, `UTC+5:30`, `UTC-4`); "UTC" alone for a server on UTC. The clock is
  the appliance's (this computer's clock corrected by the difference
  `server_time` showed at the last reading) and moves every 10 seconds. Hidden
  below the `md` breakpoint, where the bar has no room.
- **Tooltip of a time**: the same moment in UTC, to the second, in the user's
  formats ("4 Nov 2026 22:00:03 UTC"); when the viewer's computer is on
  another offset at that moment, a second line with its reading
  ("5 Nov 2026 03:30:03 GMT+5:30 on your computer"). Where a time is part of a
  sentence, the tooltip is on the sentence's element. `<DateTime>` renders a
  `<time datetime=ISO>` with both.
- **Relative time** ("2 hours ago") is never shown alone: it is paired with
  the absolute time or carries the tooltip. A next run in the past reads
  "x ago".
- **Today / Yesterday** (Restore → restore point picker): the server's
  calendar days, by its midnight; the heading carries the date
  ("Today · 4 Nov 2026"). The restore point calendar, the dashboard chart and
  the dashboard greeting use server days and hours too.
- **"Last 24 hours"** (Activity summary, dashboard success rate) is a rolling
  window of 24 × 3600 s back from now: no zone.
- **Settings → About** shows the server zone by name and offset and the
  server clock; **Settings → Appearance** has the date and time formats, and
  no zone.

## 4. Schedule rules

Implemented in `src/lib/schedule.ts` (`scheduleTimeLabel`, `nextWallClockRun`)
and `src/features/jobs/lib.ts` (`scheduleLabel`, `fullScheduleLabel`,
`copyWindowLabel`).

- A schedule on server time names no zone: `Daily · 22:00`,
  `Weekly · Sat 22:00`, `Monthly · day 1 02:00`, `Custom · 0 22 * * *`; a copy
  window "Mon, Tue 22:00–06:00". Interval schedules ("Every 4h") have no
  wall-clock time.
- A schedule on **another zone** names it, and only it: `Daily · 22:00 UTC`,
  `Weekly · Sat 22:00 Europe/Berlin`, `Custom · 0 22 * * * (UTC)`, a copy
  window "… (UTC)" and in the editor "Times are on the clock of UTC, not
  server time." There is no second reading beside it: the job page's next run
  (server time) says when that is.
- "Server time" is compared by zone name (current names: `Europe/Kiev` is
  `Europe/Kyiv`; `UTC`, `Etc/UTC` and `GMT` are one), not by offset, since two
  zones with today's offset can differ at the next DST change.
- **Job form** (`CreateJobPage.tsx`):
  - The time field reads "At time (server time)", or "At time (UTC)" on a job
    saved on another zone. There is no zone field.
  - A new job, its full schedules and its copy window rules are on the server
    zone (sent explicitly as `timezone`).
  - An edited job keeps its zone. When that is not server time, a note under
    the time says so ("This schedule runs on UTC, not server time, …") with
    **Use server time**, which moves the job and every full schedule and copy
    window rule that was on the job's zone to the server zone (the times as
    typed stay; they are then read on server time). A full schedule on a zone
    of its own (from the CLI) shows the same note without the button.
  - Summary → First run: the next run on server time, with the weekday:
    "Wed, 4 Nov 2026 22:00".
  - The time fields take a 24-hour time ("22:00") whatever the time format.
- The appliance's own next run (`next_run_at`, `*_full_next_run_at`) is the
  authority wherever it exists (job page, jobs list).

## 5. Backend and API (abr-core)

No change for this design; the console uses what ABR-466's first round added.

| Field | Detail |
|---|---|
| `GET /api/v1/system/clock` | `timezone` (IANA, e.g. `Etc/UTC`, `Europe/Kyiv`), `utc_offset` (`+03:00`), `server_time`. Also on `POST /system/clock/confirm` and `GET /system/info`. Function `system.view`, held by every built-in role. |
| Schedule DTO `timezone` (`schedule`, `active_full_schedule`, `synthetic_full_schedule`, copy window rules) | Always non-empty: the zone the schedule runs on (the appliance zone for one stored without a zone). |
| Schedule input `timezone` | An IANA name; `null`, empty or omitted means the appliance zone; an unknown name is refused (`422 invalid_job`); an old name (`Europe/Kiev`) is stored by its current one. The console sends the server zone for a new job and the job's own zone (or the server zone after "Use server time") for an edited one. |

Timestamps: API responses carry ISO 8601 with an offset; the system log API
converts the log file's wall-clock time to ISO with the appliance's offset; the
audit log is UTC. The console parses them as instants.

## 6. Compatibility

- **Jobs created by the console before this change** were saved on the zone
  picked in the form (by default the viewer's, earlier `UTC`). They keep
  running on it and show it ("Daily · 22:00 UTC"); "Use server time" in the
  form moves one. Nothing is migrated automatically, because moving a job's
  zone moves its runs.
- **Browser settings**: `basalt.settings` → `appearance.timeZone` (ABR-484) is
  no longer read and no longer written; the date and time formats are kept.
- **Automated tests that compare time strings**: absolute times have no zone
  label any more ("4 Nov 2026 01:00", was "4 Nov 2026 01:00 GMT+3"); they are
  on server time, not the browser's; the restore point headings read
  `Today · 4 Nov 2026` (no "(GMT+3)"); schedules on server time name no zone
  and none carries a viewer equivalent; the job form has no Time zone field
  and Settings → Appearance no Time zone setting; the UTC tooltip's first line
  is unchanged and a second line appears when the browser's zone differs from
  the server's. Run UI tests with a fixed browser zone (Playwright
  `timezoneId`), once equal to the appliance's and once different, and read
  `<time datetime>` where possible. The top bar's clock is
  `data-testid="server-time"`.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| DST spring-forward (wall time skipped, e.g. 02:30) | A schedule time in the gap is read on the offset from before the change (02:30 → 03:30 new offset), as the appliance does. |
| DST fall-back (wall time repeated) | Printed times are server time, so the repeated hour reads twice (the tooltip's UTC line tells them apart). A schedule time in that hour runs at the first pass. |
| A schedule on another zone across a DST change | Its runs move against server time by the difference; the next run on the job page (server time) shows where it falls. |
| Non-whole-hour offsets (India UTC+5:30, Nepal UTC+5:45, Chatham UTC+12:45) | The top bar and tooltips print minutes. |
| Viewer's computer on the server's offset but another zone name | One tooltip line: the readings are the same at that moment. |
| Server zone not known yet, role without `system.view`, demo world | The browser's zone stands in (the top bar then shows the browser's zone as server time; in the live console that is until the first answer, a second or so, and only on the first visit). |
| Server zone the browser does not know | Printed in the browser's zone (the same fallback). |
| Zone unknown to the appliance | Refused on save (422). |
| Disabled job | The schedule reads "Disabled"; no next run. |
| Next run in the past | Printed with "x ago". |
| **Known limitation**: the date and time formats are stored in the browser, not with the user account. |
| **Known limitation**: the job form's time fields take 24-hour times on a 12-hour clock too. |

## 8. Tests

| Kind | What | Zones |
|---|---|---|
| Console unit tests (`npm test`: `src/lib/time.test.ts`, Node's own test runner) | 24-hour and 12-hour output, each date format, the spelled month as default and in four languages, the weekday, no zone label by default and the label on request, server-time days, a preview's override, the repeated autumn hour and the skipped spring hour, +05:30, +05:45 and −03:30 offsets in `UTC±N` form, the city of old zone names, the tooltip with one line (computer on server time) and two (on another clock), the browser's zone standing in before the server's is known or when it is unknown, which schedule zones count as server time | UTC, Europe/Kyiv, America/New_York, Australia/Sydney, Asia/Kolkata, Asia/Kathmandu, Asia/Tokyo, America/Los_Angeles, Europe/London |
| REST (abr-core) | Unchanged: `test_input_limits` (schedule zones, `/system/clock` zone), scheduler DST tests in `test_fall_back_night.py` | appliance Europe/Berlin, Asia/Kolkata, America/New_York |
| UI (headless Chromium against an in-memory appliance, by hand) | Top bar clock and its tooltip, times without labels on the jobs list, job page, Activity and Restore, the two-line tooltip, the job form without a zone field, a UTC job's note and "Use server time", Appearance without a zone | browser Asia/Kolkata against an appliance on another zone, and browser on the appliance's zone |
| Type check | `npm run typecheck` | — |

## 9. User-facing documentation

- Top bar → **Server time**: hover for the zone, the time in UTC and on your
  computer.
- Hover any time for UTC (and your computer's reading when it differs).
- Settings → Appearance → **Date format** (D MMM YYYY, DD/MM/YYYY,
  MM/DD/YYYY, YYYY-MM-DD) and **Time format** (24-hour, 12-hour); the date
  format's note shows a time as it will read.
- Job form: "At time (server time)"; on a job saved on another zone, the note
  and **Use server time**.
- Settings → About: the server's time zone and clock.
- README → "Times and time zones"; Confluence: "Time zones in the Web UI".
