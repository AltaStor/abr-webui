# Changelog

All notable changes to the AltaStor WebUI are documented in this file.

## Unreleased

### Added
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
- The console's reads are sent as background refreshes (`X-ABR-Refresh`), so
  the appliance's audit log records its actions rather than every poll.
- The Original location card on restore describes the source VM's own
  platform.

### Fixed
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
