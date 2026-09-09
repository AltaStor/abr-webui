// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Background update-check poll, backing the "Automatically check" toggle in
 * Settings → Updates. When that preference is ON and the console is talking to
 * a live appliance, this checks for a new release on mount and then on a slow
 * interval, writing each result into the shared updates store so the version
 * banner reflects reality without a manual click.
 *
 * A no-op in sim/demo mode: an update check only means something against the
 * real control plane, so we never poll the mock world. Also a no-op while
 * signed out — `/system/version` is behind the session guard, so the check
 * would only produce a 401 on the sign-in screen.
 */
import { useEffect } from "react";
import { checkForUpdates } from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { useWorldStore } from "@/store/world";
import { useUpdatesStore } from "@/store/updates";

/** Prototype cadence — a shipping appliance would poll less eagerly (or honor
 *  the channel's own release schedule); six hours is plenty for a console. */
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

/** React hook — polls for updates in the background while auto-check is on. */
export function useAutoUpdateCheck(): void {
  // Reads the *saved* preference (not the Settings draft), matching the switch's
  // committed value. mode gates us to live: never poll the sim world.
  const autoCheck = useSettingsStore((s) => s.updates.autoCheck);
  const mode = useWorldStore((s) => s.mode);
  const authStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    if (!autoCheck || mode !== "live" || authStatus !== "signed-in") return;

    let cancelled = false;
    let inFlight = false;
    const setResult = useUpdatesStore.getState().setResult;

    const poll = async () => {
      if (inFlight) return; // never overlap an in-flight check
      inFlight = true;
      try {
        const r = await checkForUpdates();
        if (!cancelled) setResult(r);
      } catch {
        /* appliance unreachable — keep the last result; the manual check surfaces errors */
      } finally {
        inFlight = false;
      }
    };

    void poll(); // check once immediately on mount / when toggled on
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [autoCheck, mode, authStatus]);
}
