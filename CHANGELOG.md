# Changelog

All notable changes to the AltaStor WebUI are documented in this file.

## Unreleased

### Added
- VMware access is asked after sign-in while nobody has chosen it: on a new
  appliance, right after the first sign-in's password change (admin/admin), a
  user who may change environments gets "Choose how to reach VMware disks"
  with the API (AltaVDDK or SOAP, an unavailable one with the appliance's
  reason) and, for AltaVDDK, its own library or a full path (VMware's
  original VDDK; the libraries the appliance found fill it with a click).
  What the appliance uses now is preselected and marked In use (ABR-595).
  "Save and continue" saves the choice, even unchanged, which confirms it
  and sends the library only when it was changed;
  "Decide later" leaves it for this browser session, and the next session
  asks again. Settings → VMware says when the values are still the ones the
  appliance started with and saves them unchanged too. Needs `confirmed` and
  `detected_vddk_libraries` in `GET /api/v1/system/vsphere` (abr-core
  7e1b035); an appliance without them is never asked.
- Settings → Security → Encryption key escrow imports an archive too
  ("Import archive…"): the archive file and its password bring its jobs,
  restore points with their encryption keys, repositories, environments and
  users into this appliance's catalog, as `abr system import` does. The
  dialog warns that records with the same ID are overwritten and that an
  account with the same name is replaced and signed out, names a wrong
  password or a file that is no catalog archive, and afterwards lists what
  came in, the accounts it replaced, and the server settings the archive
  holds (an import does not apply them) to download as a .env file. Shown
  with `system.import`. Needs `POST /api/v1/system/catalog-restore`.
- VMware access (ABR-497). Settings → VMware sets the server-wide API (VDDK
  or vSphere SOAP) and VDDK library file every vCenter and ESXi environment
  without its own uses, shows the VDDK directory a library left empty
  follows and the file the library resolves to (e.g.
  libvixDiskLib.so.9.1.0.0), marks an API this appliance cannot use with the
  appliance's reason, and "Update all existing environment settings" hands
  every environment back to these values after a confirmation that names
  them. An environment's Edit → Advanced settings sets its own API (or
  inherits) and VDDK library (or inherits, with Reset to default), each
  marked as an override and with the value in effect and where it comes
  from; the library is not offered while the API is vSphere SOAP. A library
  the appliance refuses is named next to the field. The run drawer and a
  job's run history show the API, VDDK library, resolved file and source
  each session recorded. Needs `GET`/`PUT /api/v1/system/vsphere` and the
  inventory `api`/`vddk_library` fields of abr-core.
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
- Settings → Appearance → Time zone, Date format and Time format. The time
  zone is a searchable list of every zone by its offset today
  ("(UTC +05:30) Kolkata"), with "Auto (browser time zone)" first and as the
  default; the date format is DD/MM/YYYY (default), MM/DD/YYYY or
  YYYY-MM-DD; the time format 24-hour (default) or 12-hour (AM/PM). They save
  with the section and are kept in this browser, like the rest of Appearance.
  Every time the console prints, the UTC tooltips, schedule times, copy
  windows and day groups follow them, and new jobs start on the picked zone.
  The note under Time zone shows the current time as it will read. `npm test`
  runs the unit tests of the formatting module (Node's own test runner).
- A shield left of the theme and notification buttons shows whether
  two-factor sign-in is on for the signed-in user and opens Settings →
  Security.
- Settings → Notifications → E-mail notifications: the appliance's SMTP
  server and connection security (STARTTLS, SSL/TLS, none; certificate
  verification), sign-in with a username and password or none, sender,
  recipients, the events that send e-mail and the
  repository space threshold. The appliance's checks run in the form, and
  whatever it still refuses is shown on the field it concerns. Send test
  e-mail uses the unsaved changes and says why a message did not go
  (connection, TLS, sign-in, sender or recipients refused).
  Secrets are write-only: shown as stored, kept when left empty, removed on
  request. Recent deliveries, with failures and retries. Read-only for an
  Auditor. The browser's own pop-up notifications are the card below,
  "In-console notifications".
- Settings → Notifications → Messaging platforms: Telegram, Slack, Discord
  and ntfy, which the appliance sends through Apprise. Add a platform
  picks from the ones not set up yet; each one set up is a column with its
  On/Off switch (saved at once), a summary (bot and chats, or where its webhook
  goes; its events; its last delivery), Edit and Remove (with a confirmation;
  its history stays). Edit opens the whole form: Telegram's bot token
  (write-only, shown with the bot's number) and up to ten chats, the webhook
  URL of Slack or Discord, or ntfy's topic URL and optional access token (all
  write-only, the URL shown with its host),
  the platform's own events, Send test message with the unsaved changes and
  the reason a message did not go, and recent deliveries. A platform chosen
  but not saved is a dashed "Not saved" column until it is saved or removed.
  Wrong URLs and tokens are caught in the form. Without Apprise on the
  appliance the card says so and
  nothing can be switched on or tested. Read-only for an Auditor (Edit
  becomes View).
- Settings → Storage → Default repository: the folder of the appliance's own
  repository, and the Support Hyper-V backups switch, which has the appliance
  make (or remove) a hidden SMB share and an account for it and then shows the
  share and the account, never the password. Without a default repository it
  offers Create default repository. Repository cards and details carry a
  Hyper-V tag, beside Default, on every repository Hyper-V jobs can use: S3,
  and SMB through its share.
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
- Repositories carry one label of their own, Default, in the primary colour;
  the Shared and Hyper-V tags are gone from the cards and the details, and a
  local repository's Edit settings no longer has the "Share over SMB"
  switch. The cards follow the design (ABR-609): the repository mark in the
  sidebar and on local and S3 repositories, the SMB share mark, a restore
  point mark for "Restore points" and the backup mark for "Jobs writing
  here", the database mark on both capacity tiles, "Used capacity" with
  "N% of total" under it, and no usage trend line on the cards (the details
  still draw it).
- VMware access names its two APIs AltaVDDK and SOAP. AltaVDDK is the VDDK
  library that comes with AltaStor (oVDDK to the appliance and the CLI).
  Settings → VMware → Default VDDK library left empty uses it ("Use
  AltaVDDK" empties it); a full path there uses that library instead, which
  is how VMware's original VDDK is chosen. A library that follows the VDDK
  directory shows as that directory's path. Without AltaVDDK on the
  appliance an empty field cannot be saved. The environment's Advanced
  settings and the run details use the same names.
- A backup job can run only when started: "Manual only" in the schedule
  card of the job form (backup jobs; full backup schedules still run).
- Logs → Audit log: the area filter lists the areas of the functions
  catalogue (`GET /functions`) when the role may read it, notification
  included (ABR-578); records the scheduler wrote say "Scheduler" under Via,
  with what started them (on its schedule, copy window, after another job…)
  (ABR-613).
- Repositories: "Set as default" in a repository's menu (with Edit settings
  and Delete) makes it the default repository, tagged Default on its card;
  a new backup job starts with it picked. The appliance moves the mark off
  the previous default (`PATCH /repositories/{id}` with `default: true`).
- Local repositories are shared over SMB by the appliance as soon as they
  are added, so Hyper-V hosts can back up into them; the Add dialog says so,
  and warns when the appliance could not share the new one. A shared one
  keeps showing as Local storage; its details show the share, or "Not
  shared". Needs abr-core with `share_error`, `initial` and `default` on
  repositories.
- Settings → Storage is gone with the Default repository card: the
  appliance's own repository is now the Initial Repo, shared like any other
  local repository from its settings.
- Settings → VMware shows the VDDK directory only while VDDK is chosen,
  like the VDDK library.
- Settings → About → Resources: Documentation, GitHub and Community open
  https://altastor.com/docs, https://github.com/AltaStor and
  https://altastor.discourse.group instead of placeholder addresses.
- A run stopped before it finished, by an operator or by a backup copy's
  window, reads Stopped, in amber, instead of Failed (ABR-543): on the job
  page (last run banner, Last run, the run panel's "Backup stopped"), in the
  jobs list, in Activity (with a Stopped filter), in the run drawer and run
  history, and in the bell ("Nightly stopped", a warning). A stopped run is
  left out of the job's and the 24 h success rates; with no other run the
  rate reads "—".
- VM details → Specs shows each icon beside its parameter, not its value,
  and every parameter has one; an unknown IP address reads "—" (ABR-559).
  Power state, Provisioned, Used, IP address and Guest OS use the design's
  own glyphs (Figma Altastore-UI, VM details → Specs). The Hyper-V
  configuration card has an icon by each parameter too (Generation,
  Configuration version, Runs on, Checkpoints), and its Disks and Network
  adapters headings use the design's glyphs.
- Every date reads in the date format, DD/MM/YYYY by default, with its year:
  "23/10/2026 01:00 GMT+3" instead of "Oct 23, 01:00 GMT+3".
- Settings → Security → Two-factor sign-in is a switch. Switching it on asks
  for the password, then shows the QR code; switching it off asks for the
  password and a code or recovery code. Cancelling a step puts the switch
  back. "Set up again" and "New recovery codes" stay below it while it is on.
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
- Editing a backup job without a regular schedule kept it so (ABR-596): the
  console showed such a job as "Daily · 00:00" and saving its edit form,
  even after a rename only, gave it a daily schedule at 00:00. It now reads
  "When started by hand", the form opens on "Manual only", and the schedule
  is sent only when it changed (`schedule: null` takes it away).
- A backup copy waiting for its copy window can be cancelled (ABR-589):
  "Cancel run" in the job page's waiting note and in the run's details.
- The details of a backup copy run no longer show the guest read rate, the
  consistency and the "VMware Tools was not running" note, which belong to
  a backup of the guest (ABR-590); the live panel calls its rate the copy
  rate.
- The console no longer asks for the appliance's version and clock for a
  role without `system.view` (ABR-614): the clock-jump banner, the update
  check and Settings → About did, and each refusal went into the audit log
  as a denied record. Such a role sees no top bar clock.
- Times are on server time once the appliance has named its zone
  (ABR-579, ABR-615): the System log's lines kept the computer's zone for
  the whole visit on about half the loads, and a job page or form kept it
  until something else redrew it. The page now draws again when the zone
  arrives, the log redraws its lines, and the top bar shows no clock before
  it.
- A new job stays on server time when its time is typed (ABR-575). On a
  computer on another zone, a console that had not yet heard the appliance's
  zone opened the form on the browser's zone; typing a time then showed
  "At time (Asia/Kolkata)" with the "Use server time" note, named the zone in
  the summary, computed the first run on it and saved the job on it. A job on
  server time now moves to the appliance's zone when it arrives; a job saved
  on another zone keeps it until "Use server time".
- The time in Settings → Appearance → Date format's note is the appliance's
  clock on server time, as the top bar reads it, and draws again when the
  appliance's zone arrives (ABR-576); it showed the computer's time. The note
  and the top bar's clock both turn over with the appliance's minute.
- The On/Off badge beside each channel's switch in Settings → Notifications
  follows the switch, with "Not saved" until it is saved;
  it showed the saved setting only, so turning the switch on still read Off.
  A card also takes up a change another console made while it has no edits
  of its own, and looks again when its tab comes back to the front; it used
  to keep the answer it first rendered, often a cached one, so the switch and
  the badge disagreed (ABR-566).
- "Sign out after inactivity" is remembered per account on this browser: an
  account sends its own choice when it signs in, and one that never chose
  gets the appliance's default, which the slider then shows. It was one value
  per browser, so the next account to sign in inherited it (ABR-542).
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
