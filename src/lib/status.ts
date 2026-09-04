// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseLock,
  Loader2,
  Power,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  XCircle,
  type LucideIcon,
} from "@/lib/icons";
import type { ProtectionStatus, SessionStatus } from "@/types";
import i18n from "@/i18n";

/**
 * The console's whole colour vocabulary.
 *
 * Only four of these carry a verdict, and a widget should reach for one ONLY
 * when the number is genuinely a health signal:
 *   success  — glacial green, healthy
 *   warning  — amber, needs attention
 *   danger   — red, wrong now
 *   muted    — grey, no verdict is possible (nothing ran, no forecast, idle)
 *
 * The other three are not verdicts and must not compete with them:
 *   neutral    — plain ink. A measurement, not a judgement: totals, capacities,
 *                counts, ratios, durations. Most headline numbers are this, and
 *                painting them a colour is what turns a dashboard into a
 *                rainbow where nothing stands out.
 *   info       — work in flight, or a standing informational state that is
 *                neither good nor bad (a hot spare, an invited user). Never a
 *                plain measurement: a total is `neutral`, not `info`.
 *   immutable  — sealed/immutability, and nothing else.
 */
export type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "immutable"
  | "muted"
  | "neutral";

/**
 * The one threshold set for a health RATE (run success, RPO compliance,
 * protection coverage). Every surface reads it from here: five call sites once
 * carried five different ladders, so the same 93% was healthy on the dashboard
 * and a warning in reports, and two of them could never show red at all.
 *
 * `null` is not zero — it means nothing ran, so no verdict is available.
 */
export function rateTone(pct: number | null | undefined): Tone {
  if (typeof pct !== "number" || Number.isNaN(pct)) return "muted";
  if (pct >= 95) return "success";
  if (pct >= 85) return "warning";
  return "danger";
}

export interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  /**
   * Opt IN to a spinning icon — only for statuses that describe work actually
   * in flight (a run, a seed, a rebuild), and only with a spinner-shaped icon.
   * Consumers must never infer this from `tone`: "info" also covers standing
   * states like an invited user or a hot spare, and a rotating clock face there
   * reads as a glitch, not as progress.
   */
  spin?: boolean;
}

/*
 * `label` is a getter that resolves through i18next at *access time*, so every
 * existing consumer (`meta.label`, `<StatusPill meta={…}>`) picks up the current
 * language with no call-site change. Components re-render on language change
 * either via their own `useTranslation()` or the language-keyed page remount in
 * AppShell. This getter pattern is the template every other `*_META` map follows.
 */
export const PROTECTION_META: Record<ProtectionStatus, StatusMeta> = {
  protected: { get label() { return i18n.t("domain:protection.protected"); }, tone: "success", icon: ShieldCheck },
  warning: { get label() { return i18n.t("domain:protection.warning"); }, tone: "warning", icon: ShieldAlert },
  unprotected: { get label() { return i18n.t("domain:protection.unprotected"); }, tone: "danger", icon: ShieldX },
};

export const SESSION_META: Record<SessionStatus, StatusMeta> = {
  success: { get label() { return i18n.t("domain:session.success"); }, tone: "success", icon: CheckCircle2 },
  warning: { get label() { return i18n.t("domain:session.warning"); }, tone: "warning", icon: AlertTriangle },
  failed: { get label() { return i18n.t("domain:session.failed"); }, tone: "danger", icon: XCircle },
  running: { get label() { return i18n.t("domain:session.running"); }, tone: "info", icon: Loader2, spin: true },
  queued: { get label() { return i18n.t("domain:session.queued"); }, tone: "muted", icon: Clock },
};

/*
 * A job's enablement is NOT a run outcome. Switching a job off says nothing about
 * how its last run went, which is why this is deliberately not a `SessionStatus`
 * member: the Backup and Replication tables each used to paint a "Paused" pill
 * into their *Last run status* column, hiding the real Success/Warning/Failed
 * result behind it. Enablement is its own signal now, and one shared meta keeps
 * the two tables (and the job detail page) from drifting apart again.
 *
 * `Power` rather than `Pause`: Play/Pause is the transport pair — "Run now" and
 * "Stop run" — and the row menu was rendering `Play` for both "Run now" and
 * "Enable". The wire protocol has always called this enable/disable.
 */
export const JOB_DISABLED_META: StatusMeta = {
  get label() { return i18n.t("jobs:status.disabled"); },
  tone: "muted",
  icon: Power,
};

/** A job that has never run — `SESSION_META.queued` would claim a first run is pending. */
export const JOB_NEVER_RUN_META: StatusMeta = {
  get label() { return i18n.t("jobs:status.neverRun"); },
  tone: "muted",
  icon: Clock,
};

/** The pill for a job's LAST RUN — its outcome only, never its enablement. */
export function lastRunMeta(lastStatus: SessionStatus | null | undefined): StatusMeta {
  return lastStatus ? SESSION_META[lastStatus] : JOB_NEVER_RUN_META;
}

/** Tailwind classes for a soft "chip" of a given tone.
 *  Uses the `-text` tokens (darkened in light theme) so chip labels clear WCAG AA. */
export function toneChip(tone: Tone): string {
  switch (tone) {
    case "success":
      return "bg-success-subtle text-success-text";
    case "warning":
      return "bg-warning-subtle text-warning-text";
    case "danger":
      return "bg-danger-subtle text-danger-text";
    case "info":
      return "bg-info-subtle text-info-text";
    case "immutable":
      return "bg-immutable-subtle text-immutable-text";
    case "neutral":
      return "bg-secondary text-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Solid foreground color class for dots / icons. */
export function toneFg(tone: Tone): string {
  switch (tone) {
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-danger";
    case "info":
      return "text-info";
    case "immutable":
      // The raw Signal Blue fill sits mid-lightness in both themes; text and
      // icons take the -text ramp so small sizes clear AA on card surfaces.
      return "text-immutable-text";
    case "neutral":
      return "text-foreground";
    default:
      return "text-muted-foreground";
  }
}

export function toneBg(tone: Tone): string {
  switch (tone) {
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "danger":
      return "bg-danger";
    case "info":
      return "bg-info";
    case "immutable":
      return "bg-immutable";
    case "neutral":
      return "bg-foreground";
    default:
      return "bg-muted-foreground";
  }
}

/** Figma `Object/Immutable storage` — a store under lock, not a bare shield. */
export const ImmutableIcon = DatabaseLock;
