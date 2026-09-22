// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * What a run actually did, as one label.
 *
 * "Full", "Synthetic full" and "Incremental" used to be spelled out at each
 * place that showed them — the Activity feed's detail panel, a job's run
 * history, the Overview's last-run footer — and they disagreed: the footer
 * ignored `synthetic` and called a merge a "Full backup" while the history row
 * beside it called the same run a "Synthetic full". One function, one set of
 * strings, so the same run cannot be named two things on two screens.
 */

import i18n from "@/i18n";
import type { Session } from "@/types";

/**
 * Does this run produce a restore point at all?
 *
 * A restore, a verification and a deletion carry `backupType: "full"` simply
 * because the appliance has no backup type to report for them, so anything
 * that prints the type has to ask this first — otherwise a deletion reads as a
 * full backup, which is exactly the wrong thing to tell someone about a run
 * that removed their data.
 */
export function producesBackup(session: Session): boolean {
  return session.type === "backup" || session.type === "backup-copy" || session.type === "replication";
}

/** "Full" / "Synthetic full" / "Incremental", or null for a run that writes no
 *  restore point (see `producesBackup`). */
export function backupTypeLabel(session: Session): string | null {
  if (!producesBackup(session)) return null;
  if (session.synthetic) return i18n.t("jobs:runType.syntheticFull");
  return session.backupType === "incremental"
    ? i18n.t("jobs:runType.incremental")
    : i18n.t("jobs:runType.full");
}
