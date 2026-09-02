// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Reads the persisted language preference *synchronously* at module load, so
 * i18next initialises with the right language before React's first paint (no
 * English flash before the settings store rehydrates). We parse localStorage
 * directly rather than importing the settings store to keep i18n init free of
 * store/side-effect dependencies. The key + envelope shape mirror
 * `src/store/settings.ts` — keep them in sync.
 */
import { DEFAULT_LANGUAGE, isLanguage } from "./languages";
import type { Language } from "@/types";

const STORAGE_KEY = "basalt.settings";

export function readInitialLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LANGUAGE;
    const parsed = JSON.parse(raw) as { settings?: { appearance?: { language?: unknown } } };
    const lang = parsed?.settings?.appearance?.language;
    return isLanguage(typeof lang === "string" ? lang : undefined) ? (lang as Language) : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
