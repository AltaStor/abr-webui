// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  HardDrive,
  HelpCircle,
  Loader2,
  Server,
  ShieldCheck,
  type LucideIcon,
} from "@/lib/icons";
import type { Repository, RepositoryType } from "@/types";
import type { Tone } from "@/lib/status";
import i18n from "@/i18n";

/** Friendly label + icon for each repository backend type.
 *  `label`/`short` are getters resolving through i18next at access time, so every
 *  consumer picks up the current language with no call-site change. */
export const REPO_TYPE_META: Record<
  RepositoryType,
  { label: string; short: string; icon: LucideIcon }
> = {
  "hardened-immutable": {
    get label() { return i18n.t("repositories:type.hardenedImmutable.label"); },
    get short() { return i18n.t("repositories:type.hardenedImmutable.short"); },
    icon: ShieldCheck,
  },
  "object-lock-s3": {
    get label() { return i18n.t("repositories:type.objectLockS3.label"); },
    get short() { return i18n.t("repositories:type.objectLockS3.short"); },
    icon: Cloud,
  },
  nfs: {
    get label() { return i18n.t("repositories:type.nfs.label"); },
    get short() { return i18n.t("repositories:type.nfs.short"); },
    icon: Server,
  },
  local: {
    get label() { return i18n.t("repositories:type.local.label"); },
    get short() { return i18n.t("repositories:type.local.short"); },
    icon: HardDrive,
  },
};

/** Map repo health → status pill tone + label. */
export const REPO_STATUS_META: Record<
  "healthy" | "warning" | "offline",
  { label: string; tone: Tone }
> = {
  healthy: { get label() { return i18n.t("repositories:status.healthy"); }, tone: "success" },
  warning: { get label() { return i18n.t("repositories:status.warning"); }, tone: "warning" },
  offline: { get label() { return i18n.t("repositories:status.offline"); }, tone: "danger" },
};

type IntegrityStatus = NonNullable<Repository["integrityStatus"]>;

/** Integrity-scan result → tone + label + icon + a short human blurb. */
export const REPO_INTEGRITY_META: Record<
  IntegrityStatus,
  { label: string; tone: Tone; icon: LucideIcon; blurb: string }
> = {
  verified: {
    get label() { return i18n.t("repositories:integrity.verified.label"); },
    tone: "success",
    icon: CheckCircle2,
    get blurb() { return i18n.t("repositories:integrity.verified.blurb"); },
  },
  scanning: {
    get label() { return i18n.t("repositories:integrity.scanning.label"); },
    tone: "info",
    icon: Loader2,
    get blurb() { return i18n.t("repositories:integrity.scanning.blurb"); },
  },
  issues: {
    get label() { return i18n.t("repositories:integrity.issues.label"); },
    tone: "warning",
    icon: AlertTriangle,
    get blurb() { return i18n.t("repositories:integrity.issues.blurb"); },
  },
  never: {
    get label() { return i18n.t("repositories:integrity.never.label"); },
    tone: "muted",
    icon: HelpCircle,
    get blurb() { return i18n.t("repositories:integrity.never.blurb"); },
  },
};

/** Resolve integrity meta with a graceful fallback for live-mode omissions. */
export function integrityMeta(status: Repository["integrityStatus"]) {
  return REPO_INTEGRITY_META[status ?? "never"];
}

type CompressionMode = NonNullable<Repository["compression"]>;

/** Per-repo compression mode → label + one-liner. */
export const REPO_COMPRESSION_META: Record<
  CompressionMode,
  { label: string; hint: string }
> = {
  none: {
    get label() { return i18n.t("repositories:compression.none.label"); },
    get hint() { return i18n.t("repositories:compression.none.hint"); },
  },
  optimal: {
    get label() { return i18n.t("repositories:compression.optimal.label"); },
    get hint() { return i18n.t("repositories:compression.optimal.hint"); },
  },
  high: {
    get label() { return i18n.t("repositories:compression.high.label"); },
    get hint() { return i18n.t("repositories:compression.high.hint"); },
  },
};

export const COMPRESSION_OPTIONS: CompressionMode[] = ["none", "optimal", "high"];

/** Mirrors the API's repository-name validation (`_ensure_ascii_name` in
 *  abr_v41.py) so a bad name is caught before the round trip instead of
 *  surfacing as a generic rejection on submit. */
export const REPOSITORY_NAME_MAX_LENGTH = 125;
export const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
