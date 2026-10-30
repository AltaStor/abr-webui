// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Keeps a live console session signed in while the user is working.
 *
 * The appliance ends a web session after its inactivity timeout (Settings →
 * Security) and renews it on each request the user causes. Most of what a user
 * does sends none: switching views reads the world store, which the live driver
 * fills with background polls that deliberately do not renew anything (see
 * `inBackground`). So the console reports activity itself, with
 * `POST /auth/session/touch`:
 *
 * - activity is a click, a key press, a scroll wheel turn, a touch, or a route
 *   change (the browser's own back/forward buttons send no event to the page);
 *   a pointer that only moves does not count;
 * - at most one touch per `TOUCH_EVERY_MS`, plus one at the end of that window
 *   when there was activity inside it, so the last action is never more than
 *   `TOUCH_EVERY_MS` from reaching the appliance;
 * - once the warning before the end is up (`SessionExpiryWarning`), the first
 *   action touches at once.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { serverNow } from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { useWorldStore } from "@/store/world";

export const TOUCH_EVERY_MS = 30_000;
/** How long before an idle session ends the warning comes up. */
export const IDLE_WARNING_MS = 60_000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function useSessionKeepAlive(): void {
  const { pathname } = useLocation();
  const live = useWorldStore((s) => s.mode === "live");
  const signedIn = useAuthStore((s) => s.status === "signed-in");
  const onActivity = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!live || !signedIn) return;
    // Sign-in, or the reload that restored the session, has just renewed it.
    let lastTouchAt = Date.now();
    let trailing: number | null = null;

    const touch = () => {
      lastTouchAt = Date.now();
      if (trailing !== null) {
        window.clearTimeout(trailing);
        trailing = null;
      }
      void useAuthStore.getState().touch();
    };

    onActivity.current = () => {
      const { expiresAt } = useAuthStore.getState();
      const warning = expiresAt !== null && Date.parse(expiresAt) - serverNow() <= IDLE_WARNING_MS;
      const wait = lastTouchAt + TOUCH_EVERY_MS - Date.now();
      if (warning || wait <= 0) touch();
      else trailing ??= window.setTimeout(touch, wait);
    };
    const listener = () => onActivity.current();
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, listener, { capture: true, passive: true });
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, listener, { capture: true });
      if (trailing !== null) window.clearTimeout(trailing);
      onActivity.current = () => undefined;
    };
  }, [live, signedIn]);

  const lastPathname = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    onActivity.current();
  }, [pathname]);
}
