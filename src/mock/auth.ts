// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Sign-in for the demo simulation.
 *
 * The sim has no backend, so there is no credential store here and there never
 * should be one — this exists so the login screen can be demonstrated end to
 * end, not to keep anyone out. Any non-empty username is accepted; only the
 * password is checked, and only so that the form's failure state stays
 * reachable in a demo (typing the wrong thing has to do something).
 *
 * Because a demo audience arrives with whatever identity the script calls for,
 * the account is synthesized from what was typed rather than matched against a
 * fixed cast. `henry.morgan@altastor.com` and `admin` both work; both get a
 * session that looks exactly like the appliance's.
 */
import type { AuthUser, LoginResult } from "@/services/api.http";

/** The password every demo account answers to. Shown on the sim login form. */
export const DEMO_PASSWORD = "demo";

/** Mirrors the appliance's error body closely enough that `classifyLoginError`
 *  reaches the same "those credentials were refused" copy. */
export class DemoCredentialsError extends Error {
  constructor() {
    super("Invalid username or password.");
    this.name = "DemoCredentialsError";
  }
}

/** "henry.morgan@altastor.com" → "Henry Morgan"; "admin" → "Admin". Good enough
 *  to put a human-looking name in the topbar without inventing a roster. */
function displayName(raw: string): string {
  const local = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
  const words = local
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(" ") : raw;
}

export function simLogin(name: string, password: string, durationSeconds?: number): LoginResult {
  const trimmed = name.trim();
  if (trimmed === "" || password !== DEMO_PASSWORD) throw new DemoCredentialsError();

  const user: AuthUser = {
    id: `demo-${trimmed.toLowerCase()}`,
    name: trimmed,
    fullName: displayName(trimmed),
    // The demo world has no one to protect anything from: every account is an
    // Administrator and every action is offered.
    role: "administrator",
    enabled: true,
    createdAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    // Never force the demo through /change-password — there is no backend to
    // accept the new one, so it would be a dead end.
    passwordPolicyExempt: false,
  };

  return {
    // Not a credential: nothing verifies it, and the sim driver never sends it.
    token: "demo-session",
    expiresAt: new Date(Date.now() + (durationSeconds ?? 3600) * 1000).toISOString(),
    user,
    permissions: null,
  };
}
