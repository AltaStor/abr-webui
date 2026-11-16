// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * "Sign out after inactivity", remembered per account on this browser.
 *
 * The appliance keeps it per session only (`duration_seconds` on
 * `POST /auth/login`, `PUT /auth/session/duration`), so the console remembers
 * each account's choice and sends it when that account signs in again. It was
 * once one value per browser, sent with whichever account signed in next: one
 * user's 5 minutes became the next user's too (ABR-542). An account that never
 * chose sends nothing and gets the appliance's default.
 */

const STORAGE_KEY = "abr.idleTimeout";

/** The appliance's own bounds (`ABR_WEB_SESSION_MIN/MAX_SECONDS`). */
export const IDLE_TIMEOUT_MIN_SECONDS = 300;
export const IDLE_TIMEOUT_MAX_SECONDS = 7200;
/** The appliance's shipped default (`ABR_WEB_SESSION_TTL_SECONDS`), for when
 *  nothing better is known. */
export const IDLE_TIMEOUT_DEFAULT_SECONDS = 1800;

/** The appliance matches user names without regard to case. */
const accountKey = (name: string) => name.trim().toLowerCase();

const inBounds = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= IDLE_TIMEOUT_MIN_SECONDS &&
  value <= IDLE_TIMEOUT_MAX_SECONDS;

function readAll(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The timeout this account chose on this browser, if it chose one. */
export function savedIdleTimeout(name: string): number | undefined {
  const value = readAll()[accountKey(name)];
  return inBounds(value) ? value : undefined;
}

export function saveIdleTimeout(name: string, seconds: number): void {
  if (!accountKey(name) || !inBounds(seconds)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [accountKey(name)]: seconds }));
  } catch {
    /* private window or blocked storage: it still applies to this session */
  }
}

/**
 * The inactivity timeout a sign-in got without asking for one, read off its
 * expiry: right after signing in, that is now plus the timeout. Null when the
 * limit from sign-in comes first, which then is all the expiry says.
 */
export function idleTimeoutFromExpiry(
  expiry: { expiresAt: string; absoluteExpiresAt: string | null },
  now: number,
): number | null {
  const expires = Date.parse(expiry.expiresAt);
  if (!Number.isFinite(expires)) return null;
  if (expiry.absoluteExpiresAt && Date.parse(expiry.absoluteExpiresAt) <= expires) return null;
  const seconds = Math.round((expires - now) / 60_000) * 60;
  return seconds > 0 ? seconds : null;
}
