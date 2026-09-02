// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The single source of truth for which languages the console ships. Adding a
 * language is a one-line change here + a matching `locales/<code>/` folder (and,
 * for a new date-fns locale, an import below) — everything else (the switcher,
 * date/number formatting, the i18next resource glob) derives from this list.
 */
import type { Locale } from "date-fns";
import { enUS } from "date-fns/locale";
import type { Language } from "@/types";

export interface LanguageMeta {
  code: Language;
  /** Endonym shown in the language switcher (always in its own language). */
  nativeName: string;
  /** BCP-47 tag for Intl.NumberFormat / Intl.DateTimeFormat. */
  bcp47: string;
  /** date-fns locale object for format() / formatDistanceToNowStrict(). */
  dateFnsLocale: Locale;
}

// English-only for now — the console's language switcher offers a single
// option. The de/fr/es translation files under locales/ stay on disk (ready
// to re-enable) but aren't reachable from the UI while this list is trimmed.
export const LANGUAGES: LanguageMeta[] = [
  { code: "en", nativeName: "English", bcp47: "en-US", dateFnsLocale: enUS },
];

export const DEFAULT_LANGUAGE: Language = "en";
export const SUPPORTED_LANGUAGES: Language[] = LANGUAGES.map((l) => l.code);

/** Resolve a (possibly-unknown) code to its metadata, falling back to English. */
export function languageMeta(code: string | null | undefined): LanguageMeta {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function isLanguage(code: string | null | undefined): code is Language {
  return LANGUAGES.some((l) => l.code === code);
}
