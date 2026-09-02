// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { create } from "zustand";

export type Theme = "dark" | "light";

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

export const useUiStore = create<UiState>((set, get) => ({
  theme: "dark",
  sidebarCollapsed: false,
  commandOpen: false,
  envFilter: "all",
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    set({ theme: next });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setEnvFilter: (id) => set({ envFilter: id }),
}));
