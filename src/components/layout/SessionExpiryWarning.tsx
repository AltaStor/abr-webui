// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { IDLE_WARNING_MS } from "@/app/useSessionKeepAlive";
import { formatTime } from "@/lib/time";
import { sessionDurationLabel } from "@/lib/session";
import { inBackground, serverNow, whoami } from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { useWorldStore } from "@/store/world";

/** The limit from sign-in can't be pushed back, so it is announced earlier,
 *  with time to finish what is open. */
const LIFETIME_WARNING_MS = 5 * 60_000;

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The warning before a live session ends, over whatever page is open.
 *
 * - Idle: a minute before the inactivity timeout, "Stay signed in" (or any
 *   click or key press, see useSessionKeepAlive) renews the session.
 *
 * A panel in the corner, not a modal: the first click after the warning came
 * up is usually meant for the page, and a modal would swallow it.
 * - Limit from sign-in: five minutes before, once; nothing renews it, so the
 *   choice is to keep working until then or to sign in again now.
 *
 * At zero it asks the appliance (`/auth/me`, flagged so it renews nothing):
 * a 401 signs out with the reason on /login, and a session another tab kept
 * alive just carries on with the expiry the answer reports.
 */
export function SessionExpiryWarning() {
  const { t } = useTranslation("layout");
  const live = useWorldStore((s) => s.mode === "live");
  const signedIn = useAuthStore((s) => s.status === "signed-in");
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const absoluteExpiresAt = useAuthStore((s) => s.absoluteExpiresAt);
  const idleTimeoutSec = useAuthStore((s) => s.idleTimeoutSec);
  const touch = useAuthStore((s) => s.touch);
  const logout = useAuthStore((s) => s.logout);
  const [now, setNow] = useState(serverNow);
  const [dismissedLimit, setDismissedLimit] = useState<string | null>(null);
  const checkedAt = useRef<string | null>(null);

  const watching = live && signedIn;
  useEffect(() => {
    if (!watching) return;
    const id = window.setInterval(() => setNow(serverNow()), 1000);
    return () => window.clearInterval(id);
  }, [watching]);

  const idleLeft = expiresAt ? Date.parse(expiresAt) - now : Infinity;
  const limitLeft = absoluteExpiresAt ? Date.parse(absoluteExpiresAt) - now : Infinity;
  const limitFirst = limitLeft <= idleLeft;
  const left = Math.min(idleLeft, limitLeft);

  useEffect(() => {
    if (!watching || left > 0) return;
    const ending = limitFirst ? absoluteExpiresAt : expiresAt;
    if (checkedAt.current === ending) return;
    checkedAt.current = ending;
    inBackground(whoami).catch(() => undefined);
  }, [watching, left, limitFirst, expiresAt, absoluteExpiresAt]);

  if (!watching) return null;

  // The idle warning when it is due (it can be answered); otherwise the limit
  // from sign-in once it is near, until dismissed.
  const idleOpen = !limitFirst && idleLeft <= IDLE_WARNING_MS;
  const limitOpen = !idleOpen && limitLeft <= LIFETIME_WARNING_MS && dismissedLimit !== absoluteExpiresAt;
  if (!limitOpen && !idleOpen) return null;

  const close = limitOpen ? () => setDismissedLimit(absoluteExpiresAt) : () => void touch();
  return (
    // Not modal: a click meant for the page must reach it. Any click or key
    // press renews the session anyway (useSessionKeepAlive), and the panel
    // goes once the appliance reports the new expiry.
    <section
      role="alertdialog"
      aria-labelledby="session-warning-title"
      aria-describedby="session-warning-body"
      data-testid={limitOpen ? "session-limit-warning" : "session-idle-warning"}
      className="fixed bottom-4 right-4 z-[60] w-[min(26rem,calc(100vw-2rem))] border border-warning/40 bg-popover p-4 text-popover-foreground shadow-pop"
    >
      <div className="flex items-start gap-3">
        <Timer className="mt-0.5 h-5 w-5 shrink-0 text-warning-text" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 id="session-warning-title" className="font-display text-sm font-semibold">
            {limitOpen ? t("session.limit.title", { countdown: countdown(limitLeft) }) : t("session.idle.title")}
          </h2>
          {/* The live region is the sentence that does not tick, so it is read
              once when the panel appears rather than every second. */}
          <p id="session-warning-body" role="alert" className="text-xs leading-relaxed text-muted-foreground">
            {limitOpen
              ? t("session.limit.body", { time: formatTime(absoluteExpiresAt) })
              : idleTimeoutSec
                ? t("session.idle.body", { duration: sessionDurationLabel(idleTimeoutSec) })
                : t("session.idle.bodyNoDuration")}
          </p>
          {!limitOpen && (
            <p className="nums font-display text-2xl font-semibold">
              <span className="sr-only">{t("session.idle.countdownLabel")} </span>
              {countdown(idleLeft)}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => void logout()}>
              {limitOpen ? t("session.limit.signInAgain") : t("session.idle.signOut")}
            </Button>
            <Button size="sm" onClick={close}>
              {limitOpen ? t("session.limit.keepWorking") : t("session.idle.stay")}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t("common:actions.dismiss")}
          className="-mr-1 -mt-1 p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
