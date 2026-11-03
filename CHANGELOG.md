# Changelog

All notable changes to the AltaStor WebUI are documented in this file.

## Unreleased

### Added
- Backup copy jobs. Backup → Add backup copy job copies the restore points
  of backup jobs, or of whole repositories, into another repository, where
  the copies keep a chain, retention, GFS, Object Lock dates and encryption
  key of their own. The form sets the sources, every VM of the sources or
  some of them, the destination, the copy mode (periodic: on a schedule, by
  hand or after another job; immediate: after each source backup), the copy
  window (days and hours, past midnight too, in the job's time zone), the
  retries, the full backup schedules, retention, compression and encryption.
  It names what the appliance would refuse before saving: no source, a
  destination that is a source or where a source job backs up, VMs the
  sources don't hold, encrypted sources without encryption, Hyper-V sources
  on a local folder, a window rule without days or with the same start and
  end. A job with a schedule stays periodic, since the appliance cannot
  remove a schedule. The job page shows the copy settings, whether the copy
  window is open, and why queued copies wait; Run now, Run full copy, Apply
  retention, Edit, Enable/Disable and Delete work as for backup jobs. Copy
  runs read "Backup copy" in Activity and the run history, with what started
  them (new restore point, after another job, copy window), what they copied
  or that nothing was new. Copies carry a Copy badge wherever restore points
  are listed (VM page, Backups tab, restore wizard), with the job and
  repository they came from, and keep it after their job is deleted. Needs
  `copy_source` on the points of `GET /api/v1/backups` (abr-core). New
  strings are in English only.
- Two-factor sign-in. Settings → Security → Two-factor sign-in sets it up with a
  QR code for an authenticator app such as Google Authenticator or Microsoft
  Authenticator, or its key typed in, and turns it on once a code from the app
  is accepted. Ten recovery codes are shown once. While it is on, the card shows
  how many are left and offers, each after the password and a code or recovery
  code: set it up again with a new secret (the current app works until the new
  one is confirmed), make new recovery codes (the earlier ones stop working),
  and turn it off. Sign-in asks for the code after the password, with "Use a
  recovery code instead". Settings → Users shows who has it, and an
  Administrator resets it for a user who lost their phone. New strings are in
  English only.
- Settings → Notifications → E-mail notifications: the appliance's SMTP
  server and connection security (STARTTLS, SSL/TLS, none; certificate
  verification), sign-in with a username and password or OAuth 2.0
  (Microsoft 365, Google Workspace or any provider; client credentials or
  refresh token), sender, recipients, the events that send e-mail and the
  repository space threshold. The appliance's checks run in the form, and
  whatever it still refuses is shown on the field it concerns. Send test
  e-mail uses the unsaved changes and says why a message did not go
  (connection, TLS, sign-in, OAuth token, sender or recipients refused).
  Secrets are write-only: shown as stored, kept when left empty, removed on
  request. Recent deliveries, with failures and retries. Read-only for an
  Auditor. The browser's own pop-up notifications are the card below,
  "In-console notifications".
- Settings → Notifications → Custom script: upload a script the appliance
  runs on chosen events, view it, replace or remove it, switch it on, set its
  time limit and its own events (apart from those that send e-mail), run a test
  and see its exit code and output, and read its recent runs. The card says
  plainly that the script runs on the appliance as the service account and what
  it receives. Read-only for an Auditor, without the output; switched off with
  an explanation where the appliance has `ABR_NOTIFICATION_SCRIPTS=0`.
- Time zones: every absolute time shows its zone ("Oct 23, 01:00 GMT+3") in
  one format across the console, with UTC on hover; schedules show the job's
  zone and the viewer's equivalent ("Daily · 22:00 UTC (01:00 GMT+3, next
  day)", weekday shifts included); the job form shows and sets the job's time
  zone (new jobs start on the browser's instead of a hard-coded UTC),
  explains the entered time on the viewer's clock, and gives the first run as
  a dated moment; restore point groups say which day and zone they mean; log
  lines carry their date; About shows the appliance's zone and its clock in
  it; Settings → Appearance names the display zone. See `doc/TimeZones.md`.
- Roles: the console shows each user what their role allows. The sidebar, the
  pages and every action (run, edit, delete, restore, verify, stop, add, ...)
  follow the signed-in role's permissions from the appliance, refreshed on
  every poll; a page the role has no use for explains so, and the console
  never requests data the role may not read. The account menu shows the role,
  and a disabled account's sign-in says so.
- Settings → Users: add users with a role, change a user's role, enable or
  disable them, delete them, and see the permission matrix of the built-in
  roles. Read-only for an Auditor.
- Custom roles under Settings → Users → Roles & permissions: create a role
  from a checklist of the appliance's functions, clone any role into a new
  one, rename it, change what it allows, and delete it once nobody holds it.
  Custom roles are offered wherever a role is chosen. What the appliance
  would refuse is greyed out with the reason: built-in roles, your own role,
  roles or users allowing more than yours, and functions your role can't
  grant. The permission matrix scrolls in its own frame with the role names
  and function names kept in view.
- Logs → Audit log: the appliance's audit log of every command and user
  change, from every interface, filterable by user, area and result.
- Hyper-V support: back up and restore Hyper-V VMs from the console.
  - Register Hyper-V hosts and failover clusters.
  - VM detail shows a Hyper-V VM's generation, placement, checkpoints, disks
    and adapters.
  - Hyper-V jobs set their checkpoint consistency. Their repository must be
    S3, or a local repository with the SMB share the hosts reach it by,
    which the repository dialogs ask for.
  - Restore Hyper-V restore points to the volumes and virtual switches of a
    Hyper-V host. An in-place restore reconnects adapters to the recorded
    virtual switches and VLANs and is refused when the host lacks one of
    them.
- Apply a job's retention from the console: preview what it would remove
  across all of the job's chains, then remove it. Held and failed points are
  listed with the reason.
- Jobs list and job page show how the last run went across all of the job's
  VMs: a per-run summary (e.g. how many VMs failed, stopped or warned) and a
  list of the VMs that had problems.
- Jobs whose last run is dated ahead of the server clock are marked in the
  jobs list and on the job page, with the appliance's warning in a tooltip.

### Changed
- Enabling or disabling a job is sent as a job-level `enabled` flag instead
  of being nested inside the job's schedule.
- A disabled job reads Disabled, with Enable to turn it back on, while a run
  of it is still queued or running; it used to read Running until the run
  ended, so Disable seemed to do nothing.
- Only the reads the console repeats on its own (the world poll, the server
  clock and update checks, the system log's refresh) are sent as background
  refreshes (`X-ABR-Refresh`), so the appliance neither records them in the
  audit log nor counts them as activity; the reads a user's action causes are
  sent as such.
- The Original location card on restore describes the source VM's own
  platform.

### Fixed
- Saving any change to a disabled job no longer turns it back on: the form
  sent the job's schedule without its `enabled` flag, which the appliance
  reads as on.
- A queued run is no longer shown as the job's last run, with a success mark.
- The console no longer signs the user out at a fixed time while they are
  working. Switching views sends no request of its own, and the polls are
  background refreshes the appliance does not count, so the console now keeps
  the session alive itself (`POST /auth/session/touch`) on a click, key press,
  scroll or page change, at most every 30 seconds. A minute before an idle
  session ends a panel counts down, with Stay signed in and Sign out, without
  blocking the page; five minutes before the limit from sign-in it says when
  the session ends. The sign-in page says why the last session ended
  (inactivity, the time limit, or the appliance no longer accepting it). The
  stored session follows each renewal, so a reload no longer signs out a
  session that is still alive. Settings → Security calls the setting "Sign out
  after" inactivity, says what counts as activity and when this session ends
  at the latest.
- Collapsed sidebar: each icon-only link carries its name (Dashboard, Backup,
  Activity, ...) for screen readers and speech control, the current page is
  marked as such, and the name shows as a tooltip on hover and keyboard focus.
- A job can no longer be deleted while it runs: Delete is disabled, with the
  reason, in the job's row menu, the bulk bar and the job page, and an open
  confirmation disables itself when a run starts.
- The job page's Delete is a labelled button like Edit and Enable beside it.
- Logs: the log view no longer jumps to the bottom on every refresh. It
  follows new entries only while scrolled to the end; scrolled up, it stays
  put (also when old entries are trimmed) and shows "N new entries ↓". The
  Auto-scroll toggle says whether it is on, and scrolling back to the end
  turns it on again.
- A synthetic full on a chain with no incrementals is refused using the
  appliance's own wording, so the run's banner, its VM row and its log agree.
- An active full is flagged against the synthetic full merge whenever their
  days can coincide: weekly against monthly, and monthly days from the 28th
  that fall on a short month's last day.

## [v26.09.2] - 2026-09-25

No changes; tag points to the same commit as v26.09.

## [v26.09.1] - 2026-09-25

No changes; tag points to the same commit as v26.09.

## [v26.09] - 2026-09-25

First tagged release.

### Added
- Redesigned console: new type system, restyled navigation, cards, tables and
  charts, refreshed copy across all i18n namespaces, intro overlay,
  connection-lost banner and resizable panels.
- Session cancel from the Activity page.
- Repository immutability (Object Lock): view, edit, validate and apply it
  after creation; validation results show what a lock change does not cover.
  A new repository proposes a one-day Object Lock.
- Verify a VM's stored backup chain from the Backups tab.
- "Protection active" GFS toggle in the new-job wizard; a GFS-protected backup
  can be deleted after an explicit warning.
- Synthetic full backups: merge a stored chain into a new full restore point
  inside the repository, from VM detail, with the chain rules checked before
  the request is sent.
- Full and synthetic full backup schedules in job settings; weekly schedules
  accept several days.
- Settings > Security shows the served HTTPS certificate and can install a
  PEM certificate and key (CA-issued or self-signed) or revert to the
  self-signed one.
- Encryption key escrow: Settings exports a password-encrypted key catalog,
  generated keys can be copied, and restore accepts an explicit key when the
  catalog holds none.
- Out-of-place restore maps each source datastore to its own target, checks
  free space per target, and refuses a restore that cannot fit or leaves a
  datastore or network adapter unmapped.
- Run drawers are addressable via `?session=` links.
- Support bundle download from the Logs page.
- Translations for de, en, es and fr.

### Changed
- API port switched from 8443 to 443.
- Job status filter uses the Last run status vocabulary; schedule state has
  its own filter.
- Activity rows show the run type; deletions are their own kind of run.
- One label and failure reason for a run across the activity feed, a job's
  run history and the Overview footer.
- The Last run tile shows the last run's outcome, never the job's state, and
  reads "Never run" for a job that has not run.
- Custom encryption keys require 12+ characters and 3 character classes; job
  encryption always uses the operator's key.
- Job, repository and environment names are validated as typed.
- Synthetic full defaults to Saturday and warns when an active full shares
  any of its days.
- Log terminal follows the light/dark theme, and the theme choice survives a
  reload.
- Add environment closes once the record exists, with discovery continuing in
  the background.

### Fixed
- Incremental backups.
- Object storage repository data display.
- Session polling no longer runs while signed out.
- Restore points without an encryption record read as unknown instead of
  "not encrypted".
- Route chunks retry once and then reload the page, so a console left open
  across an appliance upgrade recovers instead of failing on stale assets.
- Units no longer wrap across lines in the inventory.
- A weekly schedule with no day is refused instead of shown as complete.
- Saving a repository closes the dialog unless the new lock leaves stored
  backups outside it, and says so when it stays open.
