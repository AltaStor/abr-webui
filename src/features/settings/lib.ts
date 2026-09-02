// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  Info,
  Palette,
  ShieldCheck,
  ShieldOff,
  type LucideIcon,
} from "@/lib/icons";
import type { StatusMeta, Tone } from "@/lib/status";
import type { AccentKey } from "@/types";
import type { UserRole, UserStatus } from "@/store/settings";
import i18n from "@/i18n";

/* ----------------------------------- nav ---------------------------------- */

export type SectionKey = "appearance" | "notifications" | "security" | "about";

export interface SectionDef {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  blurb: string;
}

/** `label`/`blurb` are getters so they resolve through i18next at access time. */
export const SECTIONS: SectionDef[] = [
  { key: "appearance", get label() { return i18n.t("settings:sections.appearance.label"); }, icon: Palette, get blurb() { return i18n.t("settings:sections.appearance.blurb"); } },
  { key: "notifications", get label() { return i18n.t("settings:sections.notifications.label"); }, icon: Bell, get blurb() { return i18n.t("settings:sections.notifications.blurb"); } },
  { key: "security", get label() { return i18n.t("settings:sections.security.label"); }, icon: ShieldCheck, get blurb() { return i18n.t("settings:sections.security.blurb"); } },
  { key: "about", get label() { return i18n.t("settings:sections.about.label"); }, icon: Info, get blurb() { return i18n.t("settings:sections.about.blurb"); } },
];

export function resolveSection(raw: string | undefined): SectionKey {
  const found = SECTIONS.find((s) => s.key === raw);
  return found ? found.key : "appearance";
}

/* ----------------------------- accent swatches ---------------------------- */

export interface AccentSwatch {
  key: AccentKey;
  label: string;
  /** Literal HSL used purely to render the swatch preview on this page. */
  hsl: string;
}

export const ACCENT_SWATCHES: AccentSwatch[] = [
  { key: "emerald", get label() { return i18n.t("settings:appearance.swatch.emerald"); }, hsl: "158 64% 42%" },
  { key: "cyan", get label() { return i18n.t("settings:appearance.swatch.cyan"); }, hsl: "201 66% 54%" },
  { key: "blue", get label() { return i18n.t("settings:appearance.swatch.blue"); }, hsl: "214 84% 56%" },
  { key: "violet", get label() { return i18n.t("settings:appearance.swatch.violet"); }, hsl: "262 72% 62%" },
  { key: "amber", get label() { return i18n.t("settings:appearance.swatch.amber"); }, hsl: "38 92% 52%" },
];

/* ----------------------------- users / tokens ----------------------------- */

/** `label`/`blurb` are getters so they resolve through i18next at access time. */
export const ROLE_LABEL: Record<UserRole, string> = {
  get admin() { return i18n.t("settings:security.roles.admin.label"); },
  get operator() { return i18n.t("settings:security.roles.operator.label"); },
  get viewer() { return i18n.t("settings:security.roles.viewer.label"); },
};

export const ROLE_BLURB: Record<UserRole, string> = {
  get admin() { return i18n.t("settings:security.roles.admin.blurb"); },
  get operator() { return i18n.t("settings:security.roles.operator.blurb"); },
  get viewer() { return i18n.t("settings:security.roles.viewer.blurb"); },
};

/**
 * The roles an administrator may hand out from Invite user. `viewer` is
 * legacy: existing rows keep working and are shown honestly (and remain
 * choosable from the change-role menu on an existing account), but nothing
 * new is created with it — the product has exactly two roles day to day,
 * Admin and User (`operator`).
 */
export const ASSIGNABLE_ROLES: readonly UserRole[] = ["admin", "operator"];

export function userStatusMeta(status: UserStatus): StatusMeta {
  const map: Record<UserStatus, StatusMeta & { tone: Tone }> = {
    active: { get label() { return i18n.t("settings:security.userStatus.active"); }, tone: "success", icon: CheckCircle2 },
    invited: { get label() { return i18n.t("settings:security.userStatus.invited"); }, tone: "info", icon: Clock },
    disabled: { get label() { return i18n.t("settings:security.userStatus.disabled"); }, tone: "muted", icon: ShieldOff },
  };
  return map[status];
}

/**
 * The two-letter mark that stands in for an avatar. `UserAccount` carries no
 * image URL, so initials are the only identity affordance available — which is
 * exactly why this lives here rather than inline: any other place that needs
 * to show a person's mark should agree with the users table on what it looks
 * like.
 */
export function userInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The short, familiar form of a name, for greeting the signed-in person.
 *
 * The first whitespace-delimited part, which is a heuristic and not a rule: a
 * mononym has no part to drop, and plenty of names put the family name first.
 * Both cases degrade to something the person still recognises as themselves,
 * which is the bar here — this is a greeting, not an identity claim. Anywhere
 * the exact account matters (the account menu, the users table, audit
 * records) shows the full stored name instead.
 */
export function displayFirstName(name: string): string {
  const [first] = name.trim().split(/\s+/).filter(Boolean);
  return first ?? "";
}

/* --------------------------------- helpers -------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL_RE.test(v);

/**
 * A believable one-time secret revealed when a token is created. There is no
 * real backend issuing tokens yet — this stays BR-only (TheVault generates
 * them server-side) so `CreateTokenDialog` keeps a plausible local flow.
 */
export function fakeTokenSecret(prefix: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let body = "";
  // Deterministic-enough per call; not used as a real secret.
  for (let i = 0; i < 32; i++) {
    body += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}_${body}`;
}

/* ------------------------------- draft hook ------------------------------- */

/**
 * A local editable copy of a slice of settings. `dirty` compares the draft to
 * the committed value; `reset` re-seeds from the store (used on Discard and
 * whenever the upstream value changes, e.g. after Save or resetAll()).
 */
export function useDraft<T>(committed: T): {
  draft: T;
  setDraft: React.Dispatch<React.SetStateAction<T>>;
  patch: (p: Partial<T>) => void;
  dirty: boolean;
  reset: () => void;
} {
  const [draft, setDraft] = useState<T>(committed);
  const committedKey = JSON.stringify(committed);

  // Re-seed whenever the committed value changes identity (save / reset).
  useEffect(() => {
    setDraft(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedKey]);

  const patch = useCallback((p: Partial<T>) => setDraft((d) => ({ ...d, ...p })), []);
  const reset = useCallback(() => setDraft(committed), [committedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== committedKey;
  return { draft, setDraft, patch, dirty, reset };
}
