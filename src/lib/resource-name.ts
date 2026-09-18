// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Name validation for the resources the API names the same way — jobs,
 * repositories and environments (inventories).
 *
 * This mirrors `_ensure_ascii_name` (abr_v41.py), check for check and in the
 * same order, so the console rejects exactly what the appliance rejects and
 * says why before the round trip:
 *
 *   1. `value == value.strip()` — no leading or trailing whitespace;
 *   2. `len(value) <= MAX_NAME_LENGTH`;
 *   3. `ASCII_NAME_PATTERN.fullmatch(value)`.
 *
 * The value checked is the one the user typed, NOT a trimmed copy of it. The
 * console used to validate `name.trim()` and then send that trimmed string,
 * which quietly turned " Backups" — a name the API refuses — into "Backups",
 * creating a resource under a name nobody asked for. Whitespace is a rejection
 * here, never a silent repair, so pass the raw field value to every function
 * below and send the raw field value on the wire.
 */

/** `MAX_NAME_LENGTH` in abr_v41.py. */
export const RESOURCE_NAME_MAX_LENGTH = 125;

/** `ASCII_NAME_PATTERN` in abr_v41.py. Note it allows an inner space, so a
 *  trailing one passes it — that is what check 1 above is for. */
export const RESOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/** Which rule a name breaks, in the API's own order, or null when it is fine. */
export type ResourceNameProblem = "empty" | "whitespace" | "tooLong" | "charset";

export function resourceNameProblem(value: string): ResourceNameProblem | null {
  if (value === "") return "empty";
  if (value !== value.trim()) return "whitespace";
  if (value.length > RESOURCE_NAME_MAX_LENGTH) return "tooLong";
  if (!RESOURCE_NAME_PATTERN.test(value)) return "charset";
  return null;
}

/** True when the API would accept this name as typed. */
export function isValidResourceName(value: string): boolean {
  return resourceNameProblem(value) === null;
}

/**
 * i18n key under `common:resourceName` for a problem, so every form reports the
 * same rule in the same words. `null` for a valid name, and for "empty", which
 * each form phrases in its own terms ("A name helps you find this job later.").
 */
export function resourceNameErrorKey(problem: ResourceNameProblem | null): string | null {
  switch (problem) {
    case "whitespace":
      return "resourceName.whitespace";
    case "tooLong":
      return "resourceName.tooLong";
    case "charset":
      return "resourceName.charset";
    default:
      return null;
  }
}
