// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * What sign-in and the forced password change can be told, and which of the
 * console's own sentences explains it.
 *
 * Both screens used to render `useAuthStore().error` as the whole message —
 * the orchestrator's raw English (`Invalid username or password.`,
 * `Too many failed login attempts. Try again later.`) or, when the request
 * never got that far, a hardcoded English fallback inside the store. So the
 * two screens people meet before anything else in the product had no copy of
 * their own, said nothing in the other three shipped languages, and reported
 * a locked-out account and a dead network in the same undifferentiated tone.
 *
 * The store is frozen (it exposes one `error: string | null`, no code, no
 * status), so classification here reads that string. That is a heuristic and
 * it is written to fail SAFE: a phrase this table doesn't recognize falls
 * through to `rejected`, which claims nothing beyond "the appliance refused",
 * and the appliance's own sentence is shown underneath either way. It never
 * invents a diagnosis — and it only says "couldn't reach the appliance" for
 * the two store literals that mean exactly that.
 *
 * Passing the store a structured code instead would remove the heuristic; see
 * the report's deferred item.
 */

export type AuthFailure =
  /** Sign-in: the username/password pair was not accepted. */
  | "credentials"
  /** Password change: the CURRENT password was not accepted. */
  | "currentWrong"
  /** Locked out after repeated failures (the appliance's 429). */
  | "locked"
  /** Sign-in: the account is disabled, or holds no valid role (the appliance's 403). */
  | "disabled"
  /** The new password fails the appliance's length policy. */
  | "policy"
  /** The request never reached the appliance — the only "unreachable" case. */
  | "unreachable"
  /** The appliance answered and refused, for a reason with no bespoke sentence. */
  | "rejected";

export interface ClassifiedAuthFailure {
  failure: AuthFailure;
  /**
   * The appliance's own words. Supporting text only: it arrives as UI-ready
   * English the console does not own, so it never becomes the headline.
   */
  detail: string | null;
}

/**
 * The two literals `store/auth.ts` substitutes when `apiErrorMessage` found no
 * structured body — i.e. the fetch itself failed. They are the console's own
 * hardcoded English, so they are dropped rather than shown as "what the
 * appliance said": the appliance said nothing.
 */
const NO_ANSWER_FALLBACKS = [
  "Couldn't reach the appliance. Try again.",
  "Couldn't change the password. Try again.",
];

/** `auth:failure.<screen>.<failure>.title|desc`. */
export function authFailureKey(
  screen: "login" | "changePassword",
  failure: AuthFailure,
  part: "title" | "desc",
): string {
  return `failure.${screen}.${failure}.${part}`;
}

function classify(error: string | null, screen: "login" | "changePassword"): ClassifiedAuthFailure | null {
  if (!error) return null;
  const text = error.trim();
  if (NO_ANSWER_FALLBACKS.includes(text)) return { failure: "unreachable", detail: null };
  // 429 on either endpoint — the same lockout counter guards both.
  if (/too many/i.test(text)) return { failure: "locked", detail: text };
  if (screen === "login" && /invalid username or password/i.test(text)) {
    return { failure: "credentials", detail: text };
  }
  if (screen === "login" && /account is disabled|account has no valid role/i.test(text)) {
    return { failure: "disabled", detail: text };
  }
  if (screen === "changePassword") {
    if (/current password is incorrect/i.test(text)) return { failure: "currentWrong", detail: text };
    if (/at least \d+ characters/i.test(text)) return { failure: "policy", detail: text };
  }
  return { failure: "rejected", detail: text };
}

export const classifyLoginError = (error: string | null): ClassifiedAuthFailure | null =>
  classify(error, "login");

export const classifyChangePasswordError = (error: string | null): ClassifiedAuthFailure | null =>
  classify(error, "changePassword");
