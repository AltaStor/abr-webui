// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Strength rules for an operator-supplied backup encryption key, and a
 * generator for one the console can hand back.
 *
 * Two facts shape this. First, a job that turns encryption on without a key of
 * its own gets a cryptographically strong one minted by the appliance
 * (`secrets.token_urlsafe(32)` in `_validate_task_parameters`) — that path is
 * strong by construction and needs nothing here. A custom key is the only way a
 * weak one enters the product, which is why it is the only thing validated.
 *
 * Second, the appliance's own floor for a custom key is the login password
 * minimum, 8 characters (`_ensure_encryption_key_strength` against
 * `MIN_PASSWORD_LENGTH`), with no complexity check at all. An 8-character
 * passphrase is a poor guard for a repository that will outlive the appliance,
 * so the console asks for more than the API does: it will not submit a key it
 * considers weak, even though the API would take it. Nothing here weakens the
 * server-side check — it only refuses earlier, with a reason.
 *
 * A key is checked AS TYPED. The appliance stores `key.strip()`, so a key with
 * surrounding whitespace is silently not the key the operator entered — and an
 * operator who escrowed what they typed would find it does not open the
 * backup. That is rejected here rather than quietly repaired (the same rule as
 * resource names — see src/lib/resource-name.ts).
 */

/** Longer than the 8-character login password minimum the API enforces. */
export const MIN_ENCRYPTION_KEY_LENGTH = 12;

/** Of lowercase / uppercase / digit / symbol, how many a custom key must mix. */
export const MIN_ENCRYPTION_KEY_CLASSES = 3;

/** Bytes behind a generated key — the same 256 bits the appliance mints. */
const GENERATED_KEY_BYTES = 32;

export type EncryptionKeyProblem =
  /** Nothing typed yet. */
  | "empty"
  /** Starts or ends with whitespace, which the appliance would strip away. */
  | "whitespace"
  /** Shorter than MIN_ENCRYPTION_KEY_LENGTH. */
  | "tooShort"
  /** Long enough, but drawn from too few character classes. */
  | "tooSimple";

function characterClasses(key: string): number {
  let classes = 0;
  if (/[a-z]/.test(key)) classes++;
  if (/[A-Z]/.test(key)) classes++;
  if (/[0-9]/.test(key)) classes++;
  if (/[^a-zA-Z0-9]/.test(key)) classes++;
  return classes;
}

/** The first rule a custom key breaks, or null when it is acceptable. */
export function encryptionKeyProblem(key: string): EncryptionKeyProblem | null {
  if (key === "") return "empty";
  if (key !== key.trim()) return "whitespace";
  if (key.length < MIN_ENCRYPTION_KEY_LENGTH) return "tooShort";
  if (characterClasses(key) < MIN_ENCRYPTION_KEY_CLASSES) return "tooSimple";
  return null;
}

/** i18n key under `jobs:create.opt.encryptionKeyError`, or null when valid. */
export function encryptionKeyErrorKey(problem: EncryptionKeyProblem | null): string | null {
  return problem ? `create.opt.encryptionKeyError.${problem}` : null;
}

/**
 * A 256-bit key, base64url like the appliance's own, generated in the browser.
 *
 * This is the console's answer to the key-escrow problem it can actually
 * solve: a key the appliance generates is never shown to anyone, so the only
 * copy of it lives in the catalog it protects. A key generated HERE is on
 * screen at the moment it is created, which is the one moment an operator can
 * put it somewhere else — a password manager, a sealed envelope, an HSM.
 */
export function generateEncryptionKey(): string {
  const bytes = new Uint8Array(GENERATED_KEY_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
