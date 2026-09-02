// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * i18next bootstrap. Import this once for its side effect (see `src/main.tsx`);
 * everything else uses the `useTranslation` hook (react-i18next) or the default
 * export's `i18n.t(...)` for the handful of call sites outside React.
 *
 * Resources are bundled eagerly from `locales/<lng>/<namespace>.json` via a Vite
 * glob, so adding a language folder or a namespace file is zero-config — no
 * registration step here. Language selection is driven by the settings store
 * (see `src/i18n/apply.ts`), not a browser-detector plugin.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./languages";
import { readInitialLanguage } from "./storage";

const modules = import.meta.glob("./locales/*/*.json", { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

// { en: { common: {...}, nav: {...} }, de: {...}, … }
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const m = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lng, ns] = m;
  (resources[lng] ??= {})[ns] = mod.default;
}

const namespaces = Object.keys(resources[DEFAULT_LANGUAGE] ?? { common: {} });

void i18n.use(initReactI18next).init({
  resources,
  lng: readInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  ns: namespaces,
  defaultNS: "common",
  interpolation: { escapeValue: false }, // React already escapes.
  returnNull: false,
  // Surface untranslated keys during development so verification catches gaps.
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (lngs, ns, key) => console.warn(`[i18n] missing key: ${ns}:${key} (lng=${lngs.join(",")})`)
    : undefined,
});

export default i18n;
