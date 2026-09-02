// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Drives the desktop sidebar's collapsed state from the browser-local
 * "Auto-collapse sidebar" appearance preference (Settings → Appearance).
 *
 * When the setting is ON, the navigation rail collapses to icons on narrower
 * desktop windows: the sidebar surfaces at `lg` (1024px), so we auto-collapse
 * whenever the viewport is below `xl` (1280px) and expand it once it's wider.
 * The width is watched with `matchMedia` and re-applied on every `change`.
 *
 * When the setting is OFF, we touch nothing — `sidebarCollapsed` stays under
 * the user's manual control (the chevron toggle in the sidebar) — and any
 * listener is torn down.
 */
import { useEffect } from "react";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

/** Collapse below `xl` (1280px), i.e. the narrower desktop range. */
const NARROW_DESKTOP = "(max-width: 1279px)";

/** React hook — keeps the sidebar collapsed/expanded from the width preference. */
export function useSidebarAutoCollapse(): void {
  const autoCollapse = useSettingsStore((s) => s.appearance.sidebarAutoCollapse);

  useEffect(() => {
    if (!autoCollapse || typeof window === "undefined") return;

    const setSidebarCollapsed = useUiStore.getState().setSidebarCollapsed;
    const mql = window.matchMedia(NARROW_DESKTOP);
    const apply = () => setSidebarCollapsed(mql.matches);

    apply(); // reflect the current width immediately on mount / when toggled on
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [autoCollapse]);
}
