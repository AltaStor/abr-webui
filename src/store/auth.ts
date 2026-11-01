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
 *
 * A web session ends after a stretch of inactivity (Settings → Security), and
 * at the latest a fixed time after sign-in. Polls don't count as activity (see
 * `inBackground`), so `useSessionKeepAlive` renews the session when the user
 * acts, and the store keeps both expiries as the appliance last reported them,
 * for the warning before either one and for the reason /login gives after.
 */
import { create } from "zustand";
import {
  apiErrorMessage,
  changePassword as changePasswordHttp,
  login as loginHttp,
  logout as logoutHttp,
  serverNow,
  setAuthToken,
  setSessionExpiryHandler,
  setUnauthorizedHandler,
  touchSession,
  type AuthUser,
  type SessionExpiry,
} from "@/services/api.http";
import { refreshWorld, useWorldStore } from "@/store/world";
import { roleRef, usePermissionsStore } from "@/store/permissions";
import { DemoCredentialsError, simLogin } from "@/mock/auth";

const STORAGE_KEY = "basalt.session";
const SIGN_OUT_KEY = "basalt.signOut";

interface StoredSession {
  token: string;
  /** When the session ends if it stays idle, as last reported. */
  expiresAt: string;
  /** When it ends whatever the activity; null: no such limit. Absent from a
   *  session stored by an older console. */
  absoluteExpiresAt?: string | null;
  /** The inactivity timeout it was opened (or last changed) with. */
  idleTimeoutSec?: number | null;
  user: AuthUser;
  /** What the user's role allowed at sign-in (null: an appliance without
   *  roles). The live driver refreshes it from `/auth/me` before each hydrate. */
  permissions?: string[] | null;
}

/** Why the console last signed out on its own, for /login to say. Not set by
 *  an explicit sign-out. */
export type SignOutReason =
  /** Idle for longer than the session's inactivity timeout. */
  | "inactivity"
  /** The limit from sign-in passed, active or not. */
  | "lifetime"
  /** The appliance dropped it for another reason (password reset, account
   *  disabled, appliance reinstalled). */
  | "ended";

export interface SignOutNotice {
  reason: SignOutReason;
  idleTimeoutSec: number | null;
}

/** How far the appliance's clock may be ahead of `serverNow()`: its `Date`
 *  header is whole seconds, and the server refreshes it once a second. */
const CLOCK_GRACE_MS = 5000;

/** Which of the two expiries a session ending now has passed. */
function endReason(session: Pick<StoredSession, "expiresAt" | "absoluteExpiresAt">, now: number): SignOutReason {
  const passed = (iso: string | null | undefined) => !!iso && now + CLOCK_GRACE_MS >= Date.parse(iso);
  if (passed(session.absoluteExpiresAt)) return "lifetime";
  if (passed(session.expiresAt)) return "inactivity";
  return "ended";
}

function readSignOutNotice(): SignOutNotice | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SIGN_OUT_KEY) ?? "null") as SignOutNotice | null;
    return parsed?.reason ? parsed : null;
  } catch {
    return null;
  }
}

function writeSignOutNotice(notice: SignOutNotice | null): void {
  if (typeof window === "undefined") return;
  try {
    if (notice) window.sessionStorage.setItem(SIGN_OUT_KEY, JSON.stringify(notice));
    else window.sessionStorage.removeItem(SIGN_OUT_KEY);
  } catch {
    /* the notice is a courtesy; /login works without it */
  }
}

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    if (!parsed?.token || !parsed.expiresAt || !parsed.user) return null;
    const session = parsed as StoredSession;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      // Reopened after it ran out: say why on /login, as a live tab would.
      window.sessionStorage.removeItem(STORAGE_KEY);
      writeSignOutNotice({ reason: endReason(session, Date.now()), idleTimeoutSec: session.idleTimeoutSec ?? null });
      return null;
    }
    return session;
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
  /** The appliance's times (compare with `serverNow()`); null signed out. */
  expiresAt: string | null;
  absoluteExpiresAt: string | null;
  idleTimeoutSec: number | null;
  /** Why the last session ended on its own; cleared by the next sign-in. */
  signOutNotice: SignOutNotice | null;
  /** Set right after a successful sign-in when the account's password fails
   * policy (the bootstrap admin) — every route but /change-password redirects
   * here until it's cleared. */
  mustChangePassword: boolean;
  pending: boolean;
  error: string | null;
  login: (name: string, password: string, durationSeconds?: number) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  /** Takes the signed-in user as the appliance answered it after an edit
   *  elsewhere (Settings → Users renaming them), so the shell shows it. */
  adoptUser: (user: AuthUser) => void;
  /** Renews the session after a user action (POST /auth/session/touch). */
  touch: () => Promise<void>;
  /** Takes the session's expiries as the appliance last reported them; with
   *  `idleTimeoutSec` when its inactivity timeout changed too. */
  noteExpiry: (expiry: SessionExpiry, idleTimeoutSec?: number) => void;
  clearError: () => void;
}

const restored = readStoredSession();
if (restored) {
  setAuthToken(restored.token);
  // A session stored by an older console has no permissions: show nothing
  // until the first `/auth/me` says what the role allows.
  usePermissionsStore.getState().setGrants(restored.permissions ?? [], roleRef(restored.user.role));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: restored ? "signed-in" : "signed-out",
  user: restored?.user ?? null,
  expiresAt: restored?.expiresAt ?? null,
  absoluteExpiresAt: restored?.absoluteExpiresAt ?? null,
  idleTimeoutSec: restored?.idleTimeoutSec ?? null,
  signOutNotice: restored ? null : readSignOutNotice(),
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
      const idleTimeoutSec = durationSeconds ?? null;
      writeStoredSession({
        token: result.token,
        expiresAt: result.expiresAt,
        absoluteExpiresAt: result.absoluteExpiresAt,
        idleTimeoutSec,
        user: result.user,
        permissions: result.permissions,
      });
      writeSignOutNotice(null);
      set({
        status: "signed-in",
        user: result.user,
        expiresAt: result.expiresAt,
        absoluteExpiresAt: result.absoluteExpiresAt,
        idleTimeoutSec,
        signOutNotice: null,
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
    writeSignOutNotice(null);
    usePermissionsStore.getState().clear();
    set({ ...SIGNED_OUT, signOutNotice: null, error: null });
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

  adoptUser: (user) => {
    const stored = readStoredSession();
    if (stored?.user.id !== user.id) return;
    writeStoredSession({ ...stored, user });
    set({ user });
  },

  touch: async () => {
    if (get().status !== "signed-in" || useWorldStore.getState().mode !== "live") return;
    try {
      get().noteExpiry(await touchSession());
    } catch {
      /* a 401 signs out through the handler below; anything else is retried
       * on the next action */
    }
  },

  noteExpiry: (expiry, idleTimeoutSec) => {
    if (get().status !== "signed-in" || !expiry.expiresAt) return;
    const timeout = idleTimeoutSec ?? get().idleTimeoutSec;
    const stored = readStoredSession();
    if (stored) {
      writeStoredSession({
        ...stored,
        expiresAt: expiry.expiresAt,
        absoluteExpiresAt: expiry.absoluteExpiresAt,
        idleTimeoutSec: timeout,
      });
    }
    set({ expiresAt: expiry.expiresAt, absoluteExpiresAt: expiry.absoluteExpiresAt, idleTimeoutSec: timeout });
  },

  clearError: () => set({ error: null }),
}));

const SIGNED_OUT = {
  status: "signed-out",
  user: null,
  mustChangePassword: false,
  expiresAt: null,
  absoluteExpiresAt: null,
  idleTimeoutSec: null,
} as const;

setUnauthorizedHandler(() => {
  const { status, expiresAt, absoluteExpiresAt, idleTimeoutSec } = useAuthStore.getState();
  // `serverNow` already reads the 401's own Date header.
  const notice: SignOutNotice | null =
    status === "signed-in" && expiresAt
      ? { reason: endReason({ expiresAt, absoluteExpiresAt }, serverNow()), idleTimeoutSec }
      : null;
  writeStoredSession(null);
  writeSignOutNotice(notice);
  usePermissionsStore.getState().clear();
  useAuthStore.setState({ ...SIGNED_OUT, signOutNotice: notice });
  refreshWorld();
});

/* A poll's `/auth/me` may have left before a touch and answer after it, with
 * the older expiry; only a later one is news. (Only the duration change can
 * bring it forward, and that answers for itself.) */
setSessionExpiryHandler((expiry) => {
  const { expiresAt, absoluteExpiresAt, noteExpiry } = useAuthStore.getState();
  const later = !expiresAt || Date.parse(expiry.expiresAt) > Date.parse(expiresAt);
  // A session restored from an older console's storage has no limit on file.
  const limitNews = absoluteExpiresAt === null && expiry.absoluteExpiresAt !== null;
  if (later || limitNews) noteExpiry(later ? expiry : { expiresAt: expiresAt!, absoluteExpiresAt: expiry.absoluteExpiresAt });
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
