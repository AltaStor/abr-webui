// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  XCircle,
  type LucideIcon,
} from "@/lib/icons";
import type { ProtectionStatus, SessionStatus } from "@/types";
import i18n from "@/i18n";

export type Tone = "success" | "warning" | "danger" | "info" | "immutable" | "muted";

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
  unprotected: { get label() { return i18n.t("domain:protection.unprotected"); }, tone: "danger", icon: ShieldOff },
};

export const SESSION_META: Record<SessionStatus, StatusMeta> = {
  success: { get label() { return i18n.t("domain:session.success"); }, tone: "success", icon: CheckCircle2 },
  warning: { get label() { return i18n.t("domain:session.warning"); }, tone: "warning", icon: AlertTriangle },
  failed: { get label() { return i18n.t("domain:session.failed"); }, tone: "danger", icon: XCircle },
  running: { get label() { return i18n.t("domain:session.running"); }, tone: "info", icon: Loader2, spin: true },
  queued: { get label() { return i18n.t("domain:session.queued"); }, tone: "muted", icon: Clock },
};

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
      return "text-immutable";
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
    default:
      return "bg-muted-foreground";
  }
}
