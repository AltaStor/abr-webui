# Time zones in the web console: design and implementation

Ticket: "WebUI shows times in mixed time zones with no zone label; job schedule
form hides the time zone". This document states what was built, so QA, support
and developers do not have to read it out of the code. It is kept in step with
the code: a change to the behaviour below changes this document in the same
commit.

## 1. Chosen approach

**Option 1, "label everything", is implemented**, with two pieces of option 3
that cost nothing extra (the job form's zone choice, and a read-only display
zone row in Settings).

- Every absolute time is printed in the **browser's time zone with its offset**
  ("Oct 23, 01:00 GMT+3"), and its UTC reading is one hover away.
- A **schedule is printed in the job's own zone**, followed by the viewer's
  reading when that differs: "Daily · 22:00 UTC (01:00 GMT+3, next day)".
- The **job form shows and sets the job's zone**, explains the entered time on
  the viewer's clock, and gives the first run as a dated moment in both zones.
- One date-and-time format everywhere.

Rejected or deferred:

| Option | Decision | Why |
|---|---|---|
| 2. One display zone (server/UTC) for the whole console | Rejected | Every user far from the appliance's zone would convert in their head, including for "Today" and "Yesterday". Labelling (option 1) already lets two users in different zones agree on a moment, which was the actual defect. |
| 3. Per-user display zone (Browser / Appliance / UTC / Custom) stored on the server | Deferred (follow-up) | Needs a user-preferences API and a new role permission. Option 1 is a strict subset of it: `lib/time.ts` takes the display zone in one place (`userTimeZone()`), so option 3 replaces that function's source and adds the setting. |

## 2. Time zone model

| Zone | What it is | Where it is stored | Where it is read | Default | Editable |
|---|---|---|---|---|---|
| **Appliance zone** (device zone) | The appliance's operating system zone (`TZ`, else `/etc/localtime`, else `/etc/timezone`, else UTC) | The OS | `GET /system/clock` and `GET /system/info`: `timezone`, `utc_offset`. Shown in Settings → About (Time zone, Server clock) and the clock-jump dialog | — | No (read-only; not configurable from the console) |
| **Job zone** | The zone a schedule's wall-clock time ("22:00") and a cron expression are read in. Per schedule: the base schedule, the active full and the synthetic full schedule each carry one | Job record, `schedule.timezone`, `active_full_schedule.timezone`, `synthetic_full_schedule.timezone` (catalog) | Job DTO `*.timezone` (never empty, see 5) | New job in the console: the **browser's zone**. Job created by API/CLI without one: the appliance zone. | Yes: job form, `abr job edit`, API |
| **Display zone** | The zone the console prints absolute times in | The browser (operating system setting) | `Intl.DateTimeFormat().resolvedOptions().timeZone`, `userTimeZone()` in `src/lib/time.ts`; shown read-only in Settings → Appearance → Time zone | The browser's zone | Not in the console (change the OS zone); option 3 would add it |

Why the browser's zone as the default job zone: the person typing "22:00" in
the form means 22:00 on their own clock, which is what the old summary
("tonight at 22:00") promised and what the UTC default broke. The form names
the zone and lets the user pick another (their own, the appliance's, UTC, or
any IANA zone), so a team that runs jobs on the appliance's clock picks it once.

## 3. Display rules

Implemented in `src/lib/time.ts`; `src/lib/format.ts` keeps its old function
names as thin wrappers so every existing call site follows the same rules.

- **One format**: `MMM d, HH:mm` with the zone label, 24-hour clock
  ("Oct 23, 01:00 GMT+3"); the year is added when it is not the current year
  ("Oct 23, 2025, 01:00 GMT+3"). Variants of the same format: with seconds for
  log lines and clocks ("Oct 28, 16:14:53 GMT+3"), with the weekday where a
  day matters ("Thu, Oct 23, 01:00 GMT+3"), time only under a heading that
  already names the day ("01:00 GMT+3"). Month names follow the console
  language (English today). The Settings "Date format" preference of the old
  demo settings is no longer read.
- **Zone label**: the offset at that moment, computed by the console, not taken
  from `Intl` (browsers spell zero differently): `UTC` for offset 0, otherwise
  `GMT+3`, `GMT-4`, `GMT+5:30`, `GMT+5:45`. Schedules name the zone itself
  (`UTC` or the IANA name, e.g. `Europe/Berlin`), because a schedule keeps its
  wall-clock time across DST while an offset does not.
- **Tooltip**: every absolute time has a `title` with the same moment in UTC,
  ISO-like and to the second: `2026-10-22 22:00:03 UTC`. Where the time is
  part of a sentence, the tooltip is on the sentence's element; in the jobs
  table's Last run hint, the UTC reading is a line of the hint itself.
  `<DateTime>` (`src/components/DateTime.tsx`) renders a `<time datetime=ISO>`
  with both.
- **Relative time** ("2 hours ago", "in 4 hours") is never shown alone: it is
  paired with the absolute time (`TimeStamp`, KPI hints) or carries the UTC
  tooltip. A next run in the past reads "x ago".
- **Today / Yesterday groups** (Restore → restore point picker): calendar days
  of the **display zone**, by its midnight; the heading carries the date and
  the zone ("Today · Oct 28 (GMT+3)"), so two users in different zones see
  which day each means. Other day buckets (restore point calendar, dashboard
  activity chart) also use display-zone days.
- **"Last 24 hours"** (Activity summary, dashboard success rate) is a rolling
  window of 24 × 3600 s back from now: it does not depend on any zone.
- **Charts**: axis ticks leave the label off to stay readable; the chart's
  hover tooltip carries it.
- **Exceptions, printed in the appliance zone and labelled**: the appliance's
  own clock (About → Server clock, the clock-jump dialog), because that is the
  question they answer.

## 4. Schedule rules

Implemented in `src/lib/schedule.ts` (`nextWallClockRun`, `zonedScheduleTime`)
and `src/features/jobs/lib.ts` (`scheduleLabel`, `fullScheduleLabel`).

- A schedule is printed in its job zone: `Daily · 22:00 UTC`,
  `Weekly · Sat 22:00 Europe/Berlin`, `Monthly · day 1 02:00 UTC`,
  `Custom · 0 22 * * * (UTC)`. Interval schedules ("Every 4h") have no
  wall-clock time and no zone.
- **Equivalent in the viewer's zone**: the console projects the schedule's
  **next run** in the job zone (the next date whose wall time in the job zone
  is the schedule's time, on an allowed weekday or day of month) and reads that
  moment on the viewer's clock. When the viewer's reading differs (other time,
  or other day), it is appended:
  - daily and monthly: `(01:00 GMT+3, next day)` / `(…, previous day)`;
  - weekly: the weekdays are shifted with it: `Weekly · Sat 22:00 UTC (Sun 01:00 GMT+3)`;
  - nothing is appended when both clocks read the same (same zone, or another
    zone with the same offset at that moment).
- **DST**: the comparison is made at the next run, so a DST change in either
  zone shows from the run it first affects (a job at 22:00 UTC reads 00:00
  GMT+2 in Berlin summer and 23:00 GMT+1 in winter). The label is recomputed on
  every render.
- **Job form** (`CreateJobPage.tsx`, `components/TimeZoneField.tsx`):
  - Time zone field under the time: the viewer's zone, the appliance's and UTC
    first (tagged "your time zone" / "the appliance's"), then every IANA zone
    the browser knows. A zone the job came with stays selectable even if the
    browser does not know it.
  - Default: a new job starts on the viewer's zone; an edited job keeps its
    zone.
  - Explanation under the field: "22:00 UTC is 01:00 GMT+3 the next day on
    your clock." or "22:00 Europe/Istanbul is the same time on your clock."
  - Full backup schedules carry their own zone; new ones take the job zone, and
    when the job zone changes, the full schedules that were on the old job zone
    follow it (one set to another zone from the CLI keeps it). Each shows the
    same explanation.
  - Summary → First run: the next run as a moment, in the job zone and, when it
    reads differently, the viewer's: "Wed, Oct 28, 22:00 UTC (Thu, Oct 29,
    01:00 GMT+3)". This replaces "tonight at 22:00".
- The appliance's own next run (`next_run_at`, `*_full_next_run_at`) is always
  the authority where it exists (job page, jobs list); the console's
  projection is used for labels and the form only.

## 5. Backend and API (abr-core)

| Change | Detail |
|---|---|
| `GET /api/v1/system/clock` | New fields `timezone` (IANA, e.g. `Etc/UTC`, `Europe/Kyiv`) and `utc_offset` (`+03:00`). Also on `POST /system/clock/confirm`. |
| `GET /api/v1/system/info` | Same two fields. |
| Schedule DTO `timezone` (job `schedule`, `active_full_schedule`, `synthetic_full_schedule`) | Always non-empty and always **the zone the schedule actually runs on**: the stored name; the appliance zone for a schedule stored without one (`null`, empty) or with an abbreviation of the appliance zone (`EDT`); `UTC` for a stored name the appliance does not know (only possible in records from before names were checked). Previously the DTO echoed an unknown stored name while the scheduler used UTC. |
| Schedule input `timezone` | Unchanged behaviour, corrected description: an IANA name; `null`, empty or omitted means the appliance zone; a name the appliance does not know is refused with `422 invalid_job`. |
| Console request | The console no longer sends a hard-coded `"UTC"`: it sends the zone chosen in the form. |
| API reference | `ScheduleDTO.timezone`, `ScheduleRequest.timezone`, `SystemClockDTO` and `SystemInfoDTO` describe the above. |

Timestamps: API responses carry ISO 8601 with an offset (`2026-10-22T22:00:03+00:00`);
the system log API converts the log file's local wall-clock time to ISO with
the appliance's offset; the audit log is UTC. The console parses all of them
as instants, so the browser zone never changes which moment is meant.

## 6. Compatibility

- **Existing jobs with an empty zone** keep running on the appliance zone
  (unchanged). They now show that zone (e.g. `Daily · 22:00 America/New_York`)
  instead of an unlabelled time, and the form opens on it; saving the form
  stores it explicitly. Jobs created by the old console were stored with
  `UTC` and keep it.
- **Browser settings in localStorage**: the old demo "Date format",
  "Time format" and "Time zone" preferences (`basalt.settings` →
  `general.*`) are no longer read; nothing is migrated or deleted. Appearance,
  language and the rest are untouched.
- **Automated tests that compare time strings** must expect the new format:
  every absolute time ends with a zone label (`Oct 23, 01:00 GMT+3`), schedules
  carry the job zone and possibly the viewer's equivalent, the restore point
  picker's headings read `Today · Oct 28 (GMT+3)` and its rows `01:00 GMT+3`,
  log lines `Oct 28, 16:14:53 GMT+3`, and the first run in the job summary is a
  dated moment. Run UI tests with a fixed browser zone (Playwright
  `timezoneId`) to make them deterministic; prefer reading `<time datetime>`
  or the `title` (UTC) over the visible text.

## 7. Edge cases

| Case | Behaviour |
|---|---|
| DST spring-forward (wall time skipped, e.g. 02:30) | The console reads the time on the offset from before the change (02:30 → 03:30 new offset), as the appliance does. |
| DST fall-back (wall time repeated) | The console projects the first of the two moments. The appliance runs such a job once, at the first pass, except a job created during the repeated hour, which runs at the second pass; its own next run (shown on the job page) says which. |
| DST of the viewer's zone between now and the next run | The equivalent uses the offset at the next run. |
| Non-whole-hour offsets (India GMT+5:30, Nepal GMT+5:45, Chatham GMT+12:45) | Labels print minutes; equivalents and day shifts are computed in minutes. |
| Disabled job | The schedule reads "Disabled"; full schedules keep their label; there is no next run. |
| Next run in the past (run in progress, clock ahead, backup window shut) | Printed as an absolute time with its zone and "x ago"; the jobs list marks a last run ahead of the server clock as before. |
| Zone unknown to the browser | Formatting falls back to UTC for that value; the form keeps the stored name selectable. |
| Zone unknown to the appliance | Refused on save (422); a legacy stored one is shown as UTC, which is what it runs on. |
| **Known limitation**: weekly/monthly equivalents use the shift at the **next** run; a schedule whose shift changes later (a DST change in between) shows the new shift from that run on. |
| **Known limitation**: the display zone is the browser's; to see times in another zone, change the OS zone (option 3 is the follow-up). |
| **Known limitation**: cron schedules are not projected; they show the expression and its zone without an equivalent. |

## 8. Tests

| Kind | What | Zones |
|---|---|---|
| REST (abr-core, `python -m unittest`) | `test_input_limits.JobFieldTests.test_a_schedule_reports_the_zone_it_runs_on` (no zone → appliance zone, abbreviation → appliance zone, unknown → UTC), `test_the_server_reports_its_own_zone` (`/system/clock`, `/system/info`), `test_a_schedule_time_zone_must_exist` (unknown names refused) | appliance Europe/Berlin and Asia/Kolkata (+05:30) |
| REST | `test_api_engine…test_legacy_schedule_timezone_abbreviation_uses_server_zone`; the scheduler's DST tests in `python/tests/srv/jobs/test_fall_back_night.py` (repeated and skipped hour) | America/New_York, Europe zones |
| Console logic (ad hoc, esbuild + node) | `instantAt` in the skipped and repeated hour (Europe/Berlin), labels for +5:30, +5:45, +12:45, −3:30, weekday and previous-day shifts, same-offset zones, day 31 in November | UTC, Europe/Berlin, Asia/Kolkata, Asia/Kathmandu, Pacific/Chatham, America/St_Johns |
| UI (headless Chromium, console against an in-memory appliance) | Jobs list and job page schedules, job form zone field, explanation and first run, restore point groups, About clock and zone, Appearance zone row, log line tooltips | browser Europe/Istanbul (GMT+3), appliance UTC: the QA stand's setup |
| Type check | `npm run typecheck` | — |

The web console has no unit test runner; QA's UI suite should add the cases of
section 6 with a fixed `timezoneId`, and one run with a non-whole-hour zone
(Asia/Kolkata) and one across a DST change (Europe/Berlin, last Sunday of
October).

## 9. User-facing documentation

- Settings → Appearance → **Time zone** (read-only): "Every time in the console
  is shown in your browser's time zone, with its offset (GMT+3); hover one to
  see it in UTC. A job's schedule is shown in the job's own time zone, with
  your time beside it when the two differ. The browser's zone is set by your
  operating system."
- Job form: the Time zone field and the sentence under it explain each
  entered time on the user's clock.
- Settings → About: the appliance's time zone ("UTC, set on the appliance")
  and its clock in that zone.
- README → "Times and time zones".
