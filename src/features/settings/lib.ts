// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useEffect, useState } from "react";
import { Bell, Info, Palette, ShieldCheck, Users, type LucideIcon } from "@/lib/icons";
import type { AccentKey } from "@/types";
import i18n from "@/i18n";
import { usePermissionsStore } from "@/store/permissions";

/* ----------------------------------- nav ---------------------------------- */

export type SectionKey = "appearance" | "notifications" | "security" | "users" | "about";

export interface SectionDef {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  blurb: string;
  /** Offered only when the signed-in role allows one of these function IDs. */
  functions?: string[];
}

/** `label`/`blurb` are getters so they resolve through i18next at access time. */
export const SECTIONS: SectionDef[] = [
  { key: "appearance", get label() { return i18n.t("settings:sections.appearance.label"); }, icon: Palette, get blurb() { return i18n.t("settings:sections.appearance.blurb"); } },
  { key: "notifications", get label() { return i18n.t("settings:sections.notifications.label"); }, icon: Bell, get blurb() { return i18n.t("settings:sections.notifications.blurb"); } },
  { key: "security", get label() { return i18n.t("settings:sections.security.label"); }, icon: ShieldCheck, get blurb() { return i18n.t("settings:sections.security.blurb"); } },
  { key: "users", get label() { return i18n.t("settings:sections.users.label"); }, icon: Users, get blurb() { return i18n.t("settings:sections.users.blurb"); }, functions: ["user.view", "role.view"] },
  { key: "about", get label() { return i18n.t("settings:sections.about.label"); }, icon: Info, get blurb() { return i18n.t("settings:sections.about.blurb"); } },
];

export function resolveSection(raw: string | undefined): SectionKey {
  const found = SECTIONS.find((s) => s.key === raw);
  return found ? found.key : "appearance";
}

/** The sections the signed-in role has a use for. */
export function useVisibleSections(): SectionDef[] {
  const grants = usePermissionsStore((s) => s.grants);
  return SECTIONS.filter(
    (section) => !section.functions || grants === "all" || section.functions.some((id) => grants.has(id)),
  );
}

/* ----------------------------- accent swatches ---------------------------- */

export interface AccentSwatch {
  key: AccentKey;
  label: string;
  /** Literal HSL used purely to render the swatch preview on this page. */
  hsl: string;
}

/**
 * The two accents the brand has. `AccentKey` stays wider on purpose — it is a
 * persisted preference and retired keys still sit in stored records — but
 * nothing offers them here, and a stored preference naming one falls back to
 * the Ice default (see `applyAppearance`).
 */
export const ACCENT_SWATCHES: AccentSwatch[] = [
  { key: "cyan", get label() { return i18n.t("settings:appearance.swatch.cyan"); }, hsl: "201 66% 54%" },
  { key: "blue", get label() { return i18n.t("settings:appearance.swatch.blue"); }, hsl: "211 60% 48%" },
];

/* --------------------------------- people --------------------------------- */

/**
 * The short, familiar form of a name, for greeting the signed-in person.
 *
 * The first whitespace-delimited part, which is a heuristic and not a rule: a
 * mononym has no part to drop, and plenty of names put the family name first.
 * Both cases degrade to something the person still recognises as themselves,
 * which is the bar here — this is a greeting, not an identity claim. Anywhere
 * the exact account matters (the account menu, audit records) shows the full
 * stored name instead.
 */
export function displayFirstName(name: string): string {
  const [first] = name.trim().split(/\s+/).filter(Boolean);
  return first ?? "";
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
