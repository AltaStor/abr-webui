// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { create } from "zustand";

export type Theme = "dark" | "light";

/** Shared with the pre-paint script in index.html — the two must agree on the
 *  key and on the stored value, or the page paints one theme and then swaps to
 *  the other as soon as this module loads. */
const THEME_KEY = "basalt.theme";

/** Dark is the product default (index.html ships `class="dark"` so the very
 *  first paint is already right). Only an EXPLICIT choice is stored, so a
 *  visitor who has never touched the toggle keeps following the default if it
 *  ever changes. */
const DEFAULT_THEME: Theme = "dark";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME; // storage disabled — the choice just won't survive
  }
}

function writeStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage full / disabled — the toggle still works for this session */
  }
}

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  /** Selected environment id, or "all". */
  envFilter: string;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setEnvFilter: (id: string) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

/* localStorage, not sessionStorage: a theme is a preference about how the
 * console looks, not a credential, and losing it on every reload — which is
 * exactly what a hard-coded "dark" here did — makes the toggle look broken.
 * Applied at module load rather than in an effect so the store, the <html>
 * class and the `color-scheme` never disagree, even for the one render before
 * React mounts. */
const initialTheme = readStoredTheme();
applyTheme(initialTheme);

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme,
  sidebarCollapsed: false,
  commandOpen: false,
  envFilter: "all",
  setTheme: (theme) => {
    applyTheme(theme);
    writeStoredTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    writeStoredTheme(next);
    set({ theme: next });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setEnvFilter: (id) => set({ envFilter: id }),
}));
