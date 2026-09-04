// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "@/lib/icons";
import { useWorldStore } from "@/store/world";

/** How long the console stays quiet about a dropped connection. Long enough
 *  not to fire on an orchestrator restart, short enough to beat a wrong
 *  decision made against a frozen estate. */
const LOUD_AFTER_MS = 15_000;

/**
 * An outage that has stopped being a blip.
 *
 * The top bar's "Reconnecting…" chip covers the ordinary case — the control
 * plane restarts, reconnects in a second or two, and nobody needs to be
 * interrupted. But when the connection stays down, everything on screen is a
 * frozen snapshot: jobs that have since finished still read "running", capacity
 * is whatever it was, and an operator acting on it is acting on the past. Past
 * `LOUD_AFTER_MS` this says so across the full width of the page, and keeps
 * saying it.
 *
 * Renders nothing in the demo world (no appliance to lose) and nothing before
 * the first hydrate (the shell has no estate to be stale about yet).
 */
export function ConnectionLostBanner() {
  const { t } = useTranslation("layout");
  const mode = useWorldStore((s) => s.mode);
  const ready = useWorldStore((s) => s.ready);
  const connected = useWorldStore((s) => s.connected);
  const [stale, setStale] = useState(false);

  const down = mode === "live" && ready && !connected;
  useEffect(() => {
    if (!down) {
      setStale(false);
      return;
    }
    const id = window.setTimeout(() => setStale(true), LOUD_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [down]);

  if (!down || !stale) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-xs text-warning-text sm:px-6 lg:px-8"
    >
      <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
      <p className="min-w-0">
        <span className="font-display font-semibold">{t("offline.title")}</span>{" "}
        <span className="text-warning-text/85">{t("offline.body")}</span>
      </p>
    </div>
  );
}
