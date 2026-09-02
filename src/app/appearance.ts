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

/** Per-accent HSL triples (space-separated, to slot into hsl(var(--…))). */
const ACCENT: Record<Exclude<AccentKey, "cyan">, { primary: string; fg: string; ring: string }> = {
  emerald: { primary: "152 58% 42%", fg: "150 80% 97%", ring: "152 58% 46%" },
  blue: { primary: "214 82% 54%", fg: "210 90% 98%", ring: "214 82% 58%" },
  violet: { primary: "262 60% 60%", fg: "265 90% 98%", ring: "262 60% 64%" },
  amber: { primary: "36 92% 50%", fg: "30 90% 10%", ring: "36 92% 52%" },
};

export function applyAppearance(a: AppearanceSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Accent — "cyan" is the brand Ice/Glacial default, so remove any override.
  if (a.accent === "cyan") {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--ring");
  } else {
    const c = ACCENT[a.accent];
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
