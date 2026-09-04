// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { CopyPlus, DatabaseBackup, HardDriveDownload, RotateCcw, type LucideIcon } from "@/lib/icons";
import type { Session, SessionStatus } from "@/types";
import type { Tone } from "@/lib/status";
import i18n from "@/i18n";

/** Filter buckets shown in the segmented control. */
export type StatusFilter = "all" | "running" | "success" | "warning" | "failed";

export const STATUS_FILTERS: { key: StatusFilter; label: string; tone: Tone }[] = [
  { key: "all", get label() { return i18n.t("common:generic.all"); }, tone: "muted" },
  { key: "running", get label() { return i18n.t("domain:session.running"); }, tone: "info" },
  { key: "success", get label() { return i18n.t("domain:session.success"); }, tone: "success" },
  { key: "warning", get label() { return i18n.t("domain:session.warning"); }, tone: "warning" },
  { key: "failed", get label() { return i18n.t("domain:session.failed"); }, tone: "danger" },
];

/** A restore run is a session of type "restore" — it has no backing job. */
export function isRestore(session: Session): boolean {
  return session.type === "restore";
}

/** Human label for the kind of run — restore / replication / backup. */
export function runKind(session: Session): string {
  if (isRestore(session)) return i18n.t("activity:runKind.restore");
  if (session.type === "replication") return i18n.t("activity:runKind.replication");
  if (session.type === "backup-copy") return i18n.t("activity:runKind.backupCopy");
  return i18n.t("activity:runKind.backup");
}

/** Leading icon for the kind of run, mirroring the job-type glyphs. */
export function runKindIcon(session: Session): LucideIcon {
  if (isRestore(session)) return RotateCcw;
  if (session.type === "replication") return CopyPlus;
  if (session.type === "backup-copy") return HardDriveDownload;
  return DatabaseBackup;
}

/** ms since epoch for "now minus 24h". */
export function since24h(): number {
  return Date.now() - 24 * 3_600_000;
}

/** Sessions started within the last 24 hours. */
export function within24h(sessions: Session[]): Session[] {
  const cutoff = since24h();
  return sessions.filter((s) => new Date(s.startedAt).getTime() >= cutoff);
}

/** The currently-active "current VM" name for a running session. */
export function currentVmName(session: Session): string | undefined {
  return session.vmResults.find((r) => r.status === "running")?.vmName ?? session.vmResults[0]?.vmName;
}

/** Does a session match the active status bucket? */
export function matchesStatus(session: Session, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return session.status === (filter as SessionStatus);
}
