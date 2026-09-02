// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Bridges the settings store's browser-local `appearance.language` to i18next
 * and the document. Mirrors `src/app/appearance.ts` (accent/density/motion):
 * `applyLanguage` does the imperative work, `useLanguageEffects` re-applies it
 * whenever the preference changes. Called from `AppShell` beside the other
 * top-level appearance effects.
 */
import { useEffect } from "react";
import { useSettingsStore } from "@/store/settings";
import type { Language } from "@/types";
import i18n from "./index";
import { languageMeta } from "./languages";

export function applyLanguage(lang: Language): void {
  const meta = languageMeta(lang);
  if (i18n.language !== meta.code) void i18n.changeLanguage(meta.code);
  if (typeof document !== "undefined") document.documentElement.lang = meta.code;
}

/** React hook — applies the language now and whenever the preference changes. */
export function useLanguageEffects(): void {
  const language = useSettingsStore((s) => s.appearance.language);
  useEffect(() => {
    applyLanguage(language);
  }, [language]);
}
