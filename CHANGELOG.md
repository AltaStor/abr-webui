# Changelog

All notable changes to the AltaStor WebUI are documented in this file.

## Unreleased

## [v26.11] - 2026-11-27

Hyper-V support, backup copy and replication jobs, SMB repositories, users, roles and two-factor sign-in, notifications,
VMware access settings, and every time printed on the appliance's clock.

### Added
- Hyper-V support: back up and restore Hyper-V VMs from the console.
  - Register Hyper-V hosts and failover clusters. The add and edit dialogs choose the WinRM protocol, HTTPS by default
    or HTTP; a standard port follows the protocol and a custom one stays, HTTP shows a warning and hides Skip TLS
    verification, and an environment not yet detected shows Auto.
  - VM detail shows a Hyper-V VM's generation, placement, checkpoints, disks and adapters, each parameter with its icon.
  - Hyper-V jobs set their checkpoint consistency, and "Crash-consistent backup if quiescing fails" shows for them too,
    on by default with application consistency. Their repository must be S3, SMB, or a local repository the appliance
    shares over SMB; the job form names one the hosts cannot reach.
  - Restore Hyper-V restore points to the volumes and virtual switches of a Hyper-V host. An in-place restore reconnects
    adapters to the recorded virtual switches and VLANs and is refused when the host lacks one of them.
- Backup copy jobs. Backup → Add backup copy job copies the restore points of backup jobs, or of whole repositories,
  into another repository, where the copies keep a chain, retention, GFS, Object Lock dates and encryption key of their
  own. The form sets the sources, every VM of the sources or some of them, the destination, the copy mode (periodic: on
  a schedule, by hand or after another job; immediate: after each source backup), the copy window (days and hours, past
  midnight too, on server time), the retries, the full backup schedules, retention, compression and encryption. It names
  what the appliance would refuse before saving: no source, a destination that is a source or where a source job backs
  up, VMs the sources don't hold, encrypted sources without encryption, Hyper-V sources on an unshared local folder, a
  window rule without days or with the same start and end. A job with a schedule stays periodic, since the appliance
  cannot remove a schedule. The job page shows the copy settings, whether the copy window is open, and why queued copies
  wait; a copy waiting for its window can be cancelled there and from the run's details. Run now, Run full copy, Apply
  retention, Edit, Enable/Disable and Delete work as for backup jobs. A running copy speaks of a copy ("Copying <VM>",
  "Read · source repo", "Copy completed", the copy rate), without the guest snapshot, guest read, consistency and VMware
  Tools note of a backup. Copy runs read "Backup copy" in Activity and the run history, with what started them (new
  restore point, after another job, copy window), what they copied or that nothing was new. Copies carry a Copy badge
  wherever restore points are listed (VM page, Backups tab, restore wizard), with the job and repository they came from,
  and keep it after their job is deleted. Needs `copy_source` on the points of `GET /api/v1/backups` (abr-core). New
  strings are in English only.
- Replication jobs. They are listed with the backup and backup copy jobs, and "Add replication job" opens their form
  once a backup job of one VM has a restore point; until then it is greyed out with the reason. The form picks the
  source backup job (the others say why they can't be picked), the restore point of the first run, the target
  environment of the same platform, its host, datastore (Hyper-V: storage location) and network mapping, and the
  replica's name, from the restore options of that point. The job runs after the source backup, on a schedule, both, or
  by hand. Once the replica exists, the source and placement are fixed, with the reason; the name, the schedule and
  following the source backup still change, and a new name renames the replica on the next run. The job page shows the
  source, the replica, its last update and restore point, a run waiting for the current one and a pending rename; its
  Settings tab has a replication card in place of retention and repository. Run history, Activity and the run panel name
  replication runs and what they did (created, updated, disks rebuilt, already up to date), with "After the source
  backup" as a trigger of its own. Deleting a replication job keeps its replica unless "Also delete the replica" is
  ticked, and says what the appliance removed or kept. "Back up now" on a VM runs a backup job only. Failover is not in
  the console yet. New strings are in English only.
- SMB repositories next to local and object storage. Add repository → "SMB / CIFS share" takes the share path Hyper-V
  hosts reach (`\\server\share`), an optional account and password, and the folder the appliance mounts the share at; a
  bad UNC path, or an account without its password, keeps Add off. Edit changes the share and its account, and the
  details show where the share is mounted. SMB repositories offer synthetic fulls like local ones.
- Default repository and shared local repositories. "Set as default" in a repository's menu (with Edit settings and
  Delete) makes it the default, labelled Default on its card, and a new backup job starts with it picked; the appliance
  moves the mark off the previous default (`PATCH /repositories/{id}` with `default: true`). Local repositories, the
  appliance's own Initial Repo among them, are shared over SMB by the appliance as soon as they are added, so Hyper-V
  hosts can back up into them. The Add dialog says so and warns when the appliance could not share the new one; a shared
  one keeps showing as Local storage, and its details show the share, or "Not shared". Needs abr-core with
  `share_error`, `initial` and `default` on repositories.
- VMware access. Settings → VMware → Default API sets how every vCenter and ESXi environment without its own setting
  reads and writes disks. LibreVDDK, listed first and the appliance's default, is the VDDK library that comes with
  AltaStor (`vddk_library: librevddk`); it shows the library in effect and is marked "not installed" when the appliance
  lacks it. VDDK is VMware's own VDDK: Default VDDK library takes the full path of its libvixDiskLib.so (the libraries
  the appliance found fill it with a click, and Save waits for a path), with the VDDK directory under it and the file
  the library resolves to (e.g. libvixDiskLib.so.9.1.0.0). SOAP needs no library. An API this appliance cannot use is
  marked with the appliance's reason, and a library it refuses is named next to the field. A new appliance starts on
  LibreVDDK and nothing asks for the choice; an unchanged Save sends nothing. "Update all existing environment settings"
  hands every environment back to these values after a confirmation that names them. An environment's Edit → Advanced
  settings sets its own API and VDDK library or inherits them, each marked as an override and with the value in effect
  and where it comes from. The run drawer and a job's run history show the API (VDDK for both libraries), the library,
  the resolved file and the source of each that the session recorded. Needs `GET`/`PUT /api/v1/system/vsphere` and the
  inventory `api`/`vddk_library` fields of abr-core.
- Server time. Every time the console prints is on the appliance's clock and zone, in one format with its year and
  without a zone label ("4 Nov 2026 01:00"), and the top bar names that zone once ("Server time 16:08 · City (UTC+2)");
  its tooltip gives the zone, the time in UTC and, when this computer is on another clock, the time here. Hovering any
  time shows it in UTC, and on this computer when that reads differently. The weekday leads only the times a schedule
  decides: next runs and copy windows. Restore point groups, the restore calendar and the dashboard use the server's
  days ("Today · 4 Nov 2026"), and log lines carry their date. A new job runs on server time and the job form takes its
  times as server time; a schedule on another zone (from the CLI or an older console) names it ("Daily · 22:00 UTC"),
  and "Use server time" in the form moves it. Zones are sent by their current names ("Europe/Kyiv", not "Europe/Kiev"),
  which an appliance with a current time zone database accepts. The appliance's zone is read as soon as there is a
  session, tried again within seconds when the reading fails, and cached in this browser; until it arrives the top bar
  shows no clock, and every screen draws again when it comes. Settings → About shows the appliance's zone and clock. See
  `doc/TimeZones.md`.
- Settings → Appearance → Date format and Time format: D MMM YYYY ("4 Nov 2026", the month in the console language; the
  default), MMM D, YYYY, YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY, and 24-hour (the default) or 12-hour (AM/PM). Each option
  shows today, or the time now, as it reads in that format, with the format beside it, muted. The note under Date format
  shows the appliance's clock as the top bar reads it, turning over with the appliance's minute. They save with the
  section and are kept in this browser, like the rest of Appearance. `npm test` runs the unit tests of the formatting
  module (Node's own test runner).
- Roles: the console shows each user what their role allows. The sidebar, the pages and every action (run, edit, delete,
  restore, verify, stop, add, ...) follow the signed-in role's permissions from the appliance, refreshed on every poll;
  a page the role has no use for explains so, and the console never requests data the role may not read: without
  `system.view` it asks for no version, update check or clock and shows no top bar clock. The account menu shows the
  role, and a disabled account's sign-in says so.
- Settings → Users: add users with a role, change a user's role, enable or disable them, delete them, and see the
  permission matrix of the built-in roles. An Administrator renames a user or gives them a new password, which signs
  them out everywhere; editing yourself has no password fields and points to Settings → Security. Read-only for an
  Auditor.
- Custom roles under Settings → Users → Roles & permissions: create a role from a checklist of the appliance's
  functions, clone any role into a new one, rename it, change what it allows, and delete it once nobody holds it. Custom
  roles are offered wherever a role is chosen. What the appliance would refuse is greyed out with the reason: built-in
  roles, your own role, roles or users allowing more than yours, and functions your role can't grant. The permission
  matrix scrolls in its own frame with the role names and function names kept in view.
- Two-factor sign-in. Settings → Security → Two-factor sign-in is a switch: switching it on asks for the password, then
  shows a QR code for an authenticator app such as Google Authenticator or Microsoft Authenticator, or its key to type
  in, and turns it on once a code from the app is accepted; ten recovery codes are shown once. Switching it off asks for
  the password and a code or recovery code, and cancelling a step puts the switch back. While it is on, the card shows
  how many recovery codes are left and offers "Set up again" with a new secret (the current app works until the new one
  is confirmed) and "New recovery codes" (the earlier ones stop working), each after the password and a code or recovery
  code. Sign-in asks for the code after the password, with "Use a recovery code instead". A shield left of the theme and
  notification buttons shows whether it is on for the signed-in user and opens Settings → Security. Settings → Users
  shows who has it, and an Administrator resets it for a user who lost their phone. New strings are in English only.
- Logs → Audit log: the appliance's audit log of every command and user change, from every interface, filterable by
  user, area and result. The area filter lists the areas of the functions catalogue (`GET /functions`) when the role may
  read it, notification included; records the scheduler wrote say "Scheduler" under Via, with what started them (its
  schedule, a copy window, another job…).
- Settings → Notifications → E-mail notifications: the appliance's SMTP server and connection security (STARTTLS,
  SSL/TLS, none; certificate verification), sign-in with a username and password or none, sender, recipients, the events
  that send e-mail and the repository space threshold. The appliance's checks run in the form, and whatever it still
  refuses is shown on the field it concerns. Send test e-mail uses the unsaved changes and says why a message did not go
  (connection, TLS, sign-in, sender or recipients refused). Secrets are write-only: shown as stored, kept when left
  empty, removed on request. Recent deliveries, with failures and retries. While e-mail is off the card folds its
  settings into one line that says what is kept for switching it on again (the saved server and the number of
  recipients) or that nothing is set up, with Show settings / Hide settings; switching e-mail on, or a setting that
  needs fixing, opens them. Read-only for an Auditor. The browser's own pop-up notifications are the card below,
  "In-console notifications".
- Settings → Notifications → Messaging platforms, marked Experimental: Telegram, Slack, Discord and ntfy, which the
  appliance sends through Apprise. Add a platform picks from the ones not set up yet; each one set up is a column with
  its On/Off switch (saved at once), a summary (bot and chats, or where its webhook goes; its events; its last
  delivery), Edit and Remove (with a confirmation; its history stays). Edit opens the whole form: Telegram's bot token
  (write-only, shown with the bot's number) and up to ten chats, the webhook URL of Slack or Discord, or ntfy's topic
  URL and optional access token (all write-only, the URL shown with its host), the platform's own events, Send test
  message with the unsaved changes and the reason a message did not go, and recent deliveries. A platform chosen but not
  saved is a dashed "Not saved" column until it is saved or removed. Wrong URLs and tokens are caught in the form.
  Without Apprise on the appliance the card says so and nothing can be switched on or tested. Read-only for an Auditor
  (Edit becomes View). The Experimental badge, a flask next to the section's name, says on click that the feature may
  change or be removed and that a message can be late or lost, so e-mail should stay on for alerts that matter; the
  badge (`components/ExperimentalBadge.tsx`) is for any unfinished feature.
- Every notification channel's On/Off badge follows its switch, with "Not saved" until it is saved, and a card without
  edits of its own takes up a change another console made and looks again when its tab comes back to the front.
- Settings → Security → Encryption key escrow imports an archive too ("Import archive…"): the archive file and its
  password bring its jobs, restore points with their encryption keys, repositories, environments and users into this
  appliance's catalog, as `abr system import` does. The dialog warns that records with the same ID are overwritten and
  that an account with the same name is replaced and signed out, names a wrong password or a file that is no catalog
  archive, and afterwards lists what came in, the accounts it replaced, and the server settings the archive holds (an
  import does not apply them) to download as a .env file. Shown with `system.import`. Needs
  `POST /api/v1/system/catalog-restore`.
- Apply a job's retention from the console: preview what it would remove across all of the job's chains, then remove it.
  Held and failed points are listed with the reason.
- A job keeps its newest full backups: job create and edit set how many of each VM's newest fulls, with their
  incrementals, retention never removes however old they get, and the job's retention policy names it ("always the 2
  newest fulls"). Apply retention names the expired points it keeps for that.
- A banner across the console while retention is paused by a forward jump of the server clock, with the appliance's
  reason. An Administrator confirms the time from it, after a dialog with the server time, the last trusted time and the
  jump. Apply retention says the clock blocks it and keeps its remove button off, and Settings → About shows the server
  clock, in step or jumped forward.
- Jobs list and job page show how the last run went across all of the job's VMs: a per-run summary (e.g. how many VMs
  failed, stopped or warned) and a list of the VMs that had problems.
- Jobs whose last run is dated ahead of the server clock are marked in the jobs list and on the job page, with the
  appliance's warning in a tooltip.
- Restore points show whether the backup was quiesced: a consistency badge on the Backups tab, in the restore wizard,
  the inventory and the run drawer. A backup job sets what a failed quiesce does in the form's Advanced settings and on
  its Settings tab.
- A backup job can run only when started: "Manual only" in the schedule card of the job form (full backup schedules
  still run).
- Password and secret fields (password change, users, environments, S3 secret key and SMB share, key escrow, TLS key
  passphrase) have an eye button that shows what was typed, hidden again whenever the field is shown anew.

### Changed
- A run stopped before it finished, by an operator or by a backup copy's window, reads Stopped, in amber, instead of
  Failed: on the job page (last run banner, Last run, the run panel's "Backup stopped"), in the jobs list, in Activity
  (with a Stopped filter), in the run drawer and run history, and in the bell ("Nightly stopped", a warning). A stopped
  run is left out of the job's and the 24 h success rates; with no other run the rate reads "—".
- Repository cards follow the design: the repository mark in the sidebar and on local repositories (S3 repositories keep
  the cloud), the SMB share mark, a restore point mark for "Restore points" and the backup mark for "Jobs writing here",
  the database mark on both capacity tiles, and "Used capacity" with "N% of total" under it. Default is the one label a
  repository carries, in the primary colour. Neither the cards nor the details draw a usage trend line; the details say
  "N% used". A local repository's share shows only its name, not the appliance's address; an SMB repository's share
  keeps its server. Status pills carry a check, a warning triangle or a cross.
- A repository's warning status reads Warning instead of "Filling up", and the appliance's own text, which says what is
  wrong and, where it can, the command that fixes it, is listed under "Needs attention" in its details and in the status
  pill's tooltip on its card.
- VM details → Specs shows each icon beside its parameter, not its value, and every parameter has one; an unknown IP
  address reads "—". Power state, Provisioned, Used, IP address and Guest OS use the design's own glyphs. The Hyper-V
  configuration card has an icon by each parameter too (Generation, Configuration version, Runs on, Checkpoints), and
  its Disks and Network adapters headings use the design's glyphs.
- Settings → About → Resources: Documentation, GitHub and Community open https://altastor.com/docs,
  https://github.com/AltaStor and https://altastor.discourse.group instead of placeholder addresses.
- Enabling or disabling a job is sent as a job-level `enabled` flag instead of being nested inside the job's schedule.
- A disabled job reads Disabled, with Enable to turn it back on, while a run of it is still queued or running; it used
  to read Running until the run ended, so Disable seemed to do nothing.
- Only the reads the console repeats on its own (the world poll, the server clock and update checks, the system log's
  refresh) are sent as background refreshes (`X-ABR-Refresh`), so the appliance neither records them in the audit log
  nor counts them as activity; the reads a user's action causes are sent as such.
- The Original location card on restore describes the source VM's own platform.

### Fixed
- Deleting a restore point, or a VM's backups in a job, that Object Lock still holds says so and until when: the points
  stay, marked for deletion, and go by themselves once the lock ends. The console reported them gone.
- A run that completed with warnings (retention that could not delete, change tracking lost and a full forced, and the
  like) counts as a warning, as the appliance counts it, with its first warning as its message; it read as a success.
- Restore to a new location offers every host of the target environment the appliance lists, also one that runs no VM
  yet, such as a second Hyper-V host, by name and as "(auto)", and the restore names it; only "Automatic" was offered
  and no host was sent.
- Deleting a repository that a job still targets, or that still holds restore points, says so up front and names the
  jobs, with no confirm that would fail; a refusal over stored restore points is no longer reported as one over jobs.
  The Edit dialog says what it changes and has no Object Lock note for a repository without Object Lock.
- A rescan that fails gives the appliance's reason, such as a Hyper-V host rejecting the credentials, instead of saying
  it could not be reached; Rescan lists each failed environment with its reason, and discovery after Add environment
  shows the same.
- A VM with 512 MB of memory reads 512 MB on its page, not 1 GB.
- Counts of one are singular ("1 environment", "1 host", "1 VM", "1 run", "1 day") in all four languages.
- Editing a backup job without a regular schedule kept it so: the console showed such a job as "Daily · 00:00" and
  saving its edit form, even after a rename only, gave it a daily schedule at 00:00. It now reads "When started by
  hand", the form opens on "Manual only", and the schedule is sent only when it changed (`schedule: null` takes it
  away).
- "Sign out after inactivity" is remembered per account on this browser: an account sends its own choice when it signs
  in, and one that never chose gets the appliance's default, which the slider then shows. It was one value per browser,
  so the next account to sign in inherited it.
- Saving any change to a disabled job no longer turns it back on: the form sent the job's schedule without its `enabled`
  flag, which the appliance reads as on.
- A queued run is no longer shown as the job's last run, with a success mark.
- The console no longer signs the user out at a fixed time while they are working. Switching views sends no request of
  its own, and the polls are background refreshes the appliance does not count, so the console now keeps the session
  alive itself (`POST /auth/session/touch`) on a click, key press, scroll or page change, at most every 30 seconds. A
  minute before an idle session ends a panel counts down, with Stay signed in and Sign out, without blocking the page;
  five minutes before the limit from sign-in it says when the session ends. The sign-in page says why the last session
  ended (inactivity, the time limit, or the appliance no longer accepting it). The stored session follows each renewal,
  so a reload no longer signs out a session that is still alive. Settings → Security calls the setting "Sign out after"
  inactivity, says what counts as activity and when this session ends at the latest.
- Collapsed sidebar: each icon-only link carries its name (Dashboard, Backup, Activity, ...) for screen readers and
  speech control, the current page is marked as such, and the name shows as a tooltip on hover and keyboard focus.
- A job can no longer be deleted while it runs: Delete is disabled, with the reason, in the job's row menu, the bulk bar
  and the job page, and an open confirmation disables itself when a run starts.
- The job page's Delete is a labelled button like Edit and Enable beside it.
- Logs: the log view no longer jumps to the bottom on every refresh. It follows new entries only while scrolled to the
  end; scrolled up, it stays put (also when old entries are trimmed) and shows "N new entries ↓". The Auto-scroll toggle
  says whether it is on, and scrolling back to the end turns it on again.
- A synthetic full on a chain with no incrementals is refused using the appliance's own wording, so the run's banner,
  its VM row and its log agree.
- An active full is flagged against the synthetic full merge whenever their days can coincide: weekly against monthly,
  and monthly days from the 28th that fall on a short month's last day.

## [v26.09.2] - 2026-09-25

No changes; tag points to the same commit as v26.09.

## [v26.09.1] - 2026-09-25

No changes; tag points to the same commit as v26.09.

## [v26.09] - 2026-09-25

First tagged release.

### Added
- Redesigned console: new type system, restyled navigation, cards, tables and charts, refreshed copy across all i18n
  namespaces, intro overlay, connection-lost banner and resizable panels.
- Session cancel from the Activity page.
- Repository immutability (Object Lock): view, edit, validate and apply it after creation; validation results show what
  a lock change does not cover. A new repository proposes a one-day Object Lock.
- Verify a VM's stored backup chain from the Backups tab.
- "Protection active" GFS toggle in the new-job wizard; a GFS-protected backup can be deleted after an explicit warning.
- Synthetic full backups: merge a stored chain into a new full restore point inside the repository, from VM detail, with
  the chain rules checked before the request is sent.
- Full and synthetic full backup schedules in job settings; weekly schedules accept several days.
- Settings > Security shows the served HTTPS certificate and can install a PEM certificate and key (CA-issued or
  self-signed) or revert to the self-signed one.
- Encryption key escrow: Settings exports a password-encrypted key catalog, generated keys can be copied, and restore
  accepts an explicit key when the catalog holds none.
- Out-of-place restore maps each source datastore to its own target, checks free space per target, and refuses a restore
  that cannot fit or leaves a datastore or network adapter unmapped.
- Run drawers are addressable via `?session=` links.
- Support bundle download from the Logs page.
- Translations for de, en, es and fr.

### Changed
- API port switched from 8443 to 443.
- Job status filter uses the Last run status vocabulary; schedule state has its own filter.
- Activity rows show the run type; deletions are their own kind of run.
- One label and failure reason for a run across the activity feed, a job's run history and the Overview footer.
- The Last run tile shows the last run's outcome, never the job's state, and reads "Never run" for a job that has not
  run.
- Custom encryption keys require 12+ characters and 3 character classes; job encryption always uses the operator's key.
- Job, repository and environment names are validated as typed.
- Synthetic full defaults to Saturday and warns when an active full shares any of its days.
- Log terminal follows the light/dark theme, and the theme choice survives a reload.
- Add environment closes once the record exists, with discovery continuing in the background.

### Fixed
- Incremental backups.
- Object storage repository data display.
- Session polling no longer runs while signed out.
- Restore points without an encryption record read as unknown instead of "not encrypted".
- Route chunks retry once and then reload the page, so a console left open across an appliance upgrade recovers instead
  of failing on stale assets.
- Units no longer wrap across lines in the inventory.
- A weekly schedule with no day is refused instead of shown as complete.
- Saving a repository closes the dialog unless the new lock leaves stored backups outside it, and says so when it stays
  open.
