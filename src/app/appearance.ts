// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Applies the browser-local appearance preferences (accent, density, reduce
 * motion) to the document root so the Settings → Appearance controls actually
 * change the whole console, not just their own page.
 *
 *  - accent   → overrides --primary / --primary-foreground / --ring (the
 *               highlight colour for selected + focus states). "cyan" is the
 *               stored key for the brand Ice/Glacial default, so it clears the
 *               override entirely and falls back to the theme tokens.
 *  - density  → data-density on <html>; globals.css nudges the root size.
 *  - reduceMotion → data-reduce-motion on <html>; globals.css disables
 *               animations/transitions under that scope.
 */
import { useEffect } from "react";
import type { AccentKey } from "@/types";
import { useSettingsStore } from "@/store/settings";
import type { AppearanceSettings } from "@/store/settings";

/**
 * Per-accent HSL triples (space-separated, to slot into hsl(var(--…))).
 *
 * Curated to the brand's two accents. Emerald, violet and amber were retired:
 * the brand has exactly two chromatic colours, and stray hues collide with the
 * semantic vocabulary — amber reads as "warning", and the calm states
 * (protected, running, sealed) already own the brand's blues. `AccentKey` stays
 * wider on purpose, because stored preferences still name the retired keys;
 * those fall back to the Ice default below.
 */
const ACCENT: Partial<Record<AccentKey, { primary: string; fg: string; ring: string }>> = {
  // Signal Blue #3179C4 — the brand's secondary accent.
  blue: { primary: "211 60% 48%", fg: "210 90% 98%", ring: "211 60% 52%" },
};

export function applyAppearance(a: AppearanceSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Accent — "cyan" is the brand Ice default, so it removes any override. A
  // preference saved against a retired accent falls back to the same default.
  const c = a.accent === "cyan" ? undefined : ACCENT[a.accent];
  if (!c) {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--ring");
  } else {
    root.style.setProperty("--primary", c.primary);
    root.style.setProperty("--primary-foreground", c.fg);
    root.style.setProperty("--ring", c.ring);
  }

  root.dataset.density = a.density;
  root.dataset.reduceMotion = a.reduceMotion ? "true" : "false";
}

/** React hook — applies appearance now and whenever it changes. */
export function useAppearanceEffects(): void {
  const appearance = useSettingsStore((s) => s.appearance);
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);
}
