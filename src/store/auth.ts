// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Console sign-in session — the operator logging into the AltaStor Web UI
 * itself (distinct from the per-environment vCenter/Hyper-V credentials stored
 * elsewhere). Only meaningful in "live" mode: the demo simulation has no
 * backend to authenticate against, so AppShell's auth gate skips it entirely.
 *
 * The bearer token lives in sessionStorage (cleared when the tab closes) plus
 * an in-memory copy handed to the API layer for the Authorization header —
 * deliberately not localStorage, so a synced/shared browser profile doesn't
 * carry a live session forever. A 401 on any authenticated request
 * (`setUnauthorizedHandler` in api.http.ts) forces this store back to
 * signed-out so stale UI can't keep acting on a session the appliance already
 * dropped.
 */
import { create } from "zustand";
import {
  apiErrorMessage,
  changePassword as changePasswordHttp,
  login as loginHttp,
  logout as logoutHttp,
  setAuthToken,
  setUnauthorizedHandler,
  type AuthUser,
} from "@/services/api.http";
import { refreshWorld, useWorldStore } from "@/store/world";
import { roleRef, usePermissionsStore } from "@/store/permissions";
import { DemoCredentialsError, simLogin } from "@/mock/auth";

const STORAGE_KEY = "basalt.session";

interface StoredSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
  /** What the user's role allowed at sign-in (null: an appliance without
   *  roles). The live driver refreshes it from `/auth/me` before each hydrate. */
  permissions?: string[] | null;
}

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    if (!parsed?.token || !parsed.expiresAt || !parsed.user) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage full / disabled — the session just won't survive a reload */
  }
}

export type AuthStatus = "signed-out" | "signed-in";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Set right after a successful sign-in when the account's password fails
   * policy (the bootstrap admin) — every route but /change-password redirects
   * here until it's cleared. */
  mustChangePassword: boolean;
  pending: boolean;
  error: string | null;
  login: (name: string, password: string, durationSeconds?: number) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  clearError: () => void;
}

const restored = readStoredSession();
if (restored) {
  setAuthToken(restored.token);
  // A session stored by an older console has no permissions: show nothing
  // until the first `/auth/me` says what the role allows.
  usePermissionsStore.getState().setGrants(restored.permissions ?? [], roleRef(restored.user.role));
}

export const useAuthStore = create<AuthState>((set) => ({
  status: restored ? "signed-in" : "signed-out",
  user: restored?.user ?? null,
  mustChangePassword: restored?.user.passwordPolicyExempt ?? false,
  pending: false,
  error: null,

  login: async (name, password, durationSeconds) => {
    set({ pending: true, error: null });
    try {
      /* The demo simulation has no backend to authenticate against, so it
       * answers the form itself — see @/mock/auth. Branching here rather than
       * inside `loginHttp` keeps the HTTP layer a pure client of the appliance,
       * and means the sim exercises the same store, the same session shape and
       * the same failure copy the live path does. */
      const result =
        useWorldStore.getState().mode === "live"
          ? await loginHttp(name.trim(), password, durationSeconds)
          : simLogin(name, password, durationSeconds);
      setAuthToken(result.token);
      usePermissionsStore.getState().setGrants(result.permissions, roleRef(result.user.role));
      writeStoredSession({
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user,
        permissions: result.permissions,
      });
      set({
        status: "signed-in",
        user: result.user,
        mustChangePassword: result.user.passwordPolicyExempt,
        pending: false,
        error: null,
      });
      // The live driver may already be sitting on the empty/unauthenticated
      // world (see world.live.ts) — don't wait for its next poll tick.
      refreshWorld();
      return true;
    } catch (err) {
      /* `apiErrorMessage` only speaks ApiError, so the sim's refusal would
       * otherwise fall through to the unreachable literal and blame the network
       * for a mistyped password. Its message is the sentence the appliance
       * sends, so `classifyLoginError` lands on the same "credentials" copy. */
      const demoRefusal = err instanceof DemoCredentialsError ? err.message : null;
      set({
        pending: false,
        error: apiErrorMessage(err) ?? demoRefusal ?? "Couldn't reach the appliance. Try again.",
      });
      return false;
    }
  },

  logout: async () => {
    try {
      // Nothing to revoke in the demo simulation, and the call would only fail
      // against an appliance that isn't there.
      if (useWorldStore.getState().mode === "live") await logoutHttp();
    } catch {
      /* best-effort — the client-side session is dropped either way */
    }
    setAuthToken(null);
    writeStoredSession(null);
    usePermissionsStore.getState().clear();
    set({ status: "signed-out", user: null, mustChangePassword: false, error: null });
    // Drop whatever the previous session's data was — the live driver
    // re-hydrates into the empty/unauthenticated world (see world.live.ts).
    refreshWorld();
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ pending: true, error: null });
    try {
      const user = await changePasswordHttp(currentPassword, newPassword);
      const stored = readStoredSession();
      if (stored) writeStoredSession({ ...stored, user });
      set({ user, mustChangePassword: false, pending: false, error: null });
      return true;
    } catch (err) {
      set({ pending: false, error: apiErrorMessage(err) ?? "Couldn't change the password. Try again." });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

setUnauthorizedHandler(() => {
  writeStoredSession(null);
  usePermissionsStore.getState().clear();
  useAuthStore.setState({ status: "signed-out", user: null, mustChangePassword: false });
  refreshWorld();
});

/* The live driver refreshes the grants from `/auth/me` before each hydrate;
 * keep the stored session in step, so a reload starts from the current role. */
usePermissionsStore.subscribe((state) => {
  const stored = readStoredSession();
  if (!stored) return;
  const permissions = state.grants === "all" ? null : [...state.grants];
  const user = { ...stored.user, role: state.role?.id ?? stored.user.role };
  writeStoredSession({ ...stored, user, permissions });
  if (useAuthStore.getState().user?.id === user.id) useAuthStore.setState({ user });
});
