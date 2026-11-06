// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import i18n from "@/i18n";

/** Nouns with a count phrase in `common:count`. */
export type CountNoun =
  | "environment"
  | "host"
  | "vm"
  | "virtualMachine"
  | "restorePoint"
  | "run"
  | "job"
  | "backup"
  | "day"
  | "core";

/**
 * A number with its noun in the current language, the noun agreeing with the
 * number: "1 environment", "6 environments". Pass the result into a sentence
 * instead of writing "{{n}} environments" there, which reads "1 environments".
 */
export function countOf(noun: CountNoun, count: number): string {
  return i18n.t(`common:count.${noun}`, { count });
}
