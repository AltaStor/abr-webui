// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { DesktopSidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Skeleton } from "@/components/ui/skeleton";
import { isSetupSkipped } from "@/features/setup/skip";
import { getProvisioning } from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { useWorldStore } from "@/store/world";
import { hydrateSettingsFromServer, useSettingsStore } from "@/store/settings";
import { useAppearanceEffects } from "@/app/appearance";
import { useLanguageEffects } from "@/i18n/apply";
import { useSidebarAutoCollapse } from "@/app/useSidebarAutoCollapse";
import { useAutoUpdateCheck } from "@/app/useAutoUpdateCheck";

function PageFallback() {
  /* Shape-agnostic placeholder: a title bar (every page has one) plus a single
   * neutral block. Deliberately not a card-grid — most routes (tables, detail
   * panes, tabbed viewers) aren't grids, and a committed shape would flash a
   * mismatched layout when the real page swaps in. */
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-[28rem] w-full" />
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const mode = useWorldStore((s) => s.mode);
  const ready = useWorldStore((s) => s.ready);
  const reduceMotion = useSettingsStore((s) => s.appearance.reduceMotion);
  const authStatus = useAuthStore((s) => s.status);
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);

  // Apply accent / density / reduce-motion prefs to the document root.
  useAppearanceEffects();
  // Keep i18next + <html lang> in sync with the language preference.
  useLanguageEffects();
  // Auto-collapse the sidebar on narrower desktop windows when the pref is on.
  useSidebarAutoCollapse();
  // Poll the live appliance for new releases when "Automatically check" is on.
  useAutoUpdateCheck();

  /* In live mode, the appliance owns the settings — pull them on connect so the
   * store reflects server truth (and other clients' changes) while keeping the
   * browser-local appearance. A failure is recorded as `syncStatus:
   * "unreachable"`, which is what makes the Settings page say so instead of
   * presenting the shipped defaults as this appliance's configuration.
   *
   * Leaving live mode clears it: the demo world has no appliance to be out of
   * sync with, and a stale "unreachable" would keep its Save bars disabled. */
  useEffect(() => {
    if (mode === "live" && ready) void hydrateSettingsFromServer();
    else if (mode !== "live") useSettingsStore.setState({ syncStatus: "local" });
  }, [mode, ready]);

  /* Auth gate — live appliances only. The demo simulation has no backend to
   * authenticate against, so it never needs a session. Deliberately NOT
   * gated on `ready`: the auth store resolves synchronously from
   * sessionStorage at module load, well before the world finishes (or even
   * starts) hydrating, so waiting on `ready` here would flash protected
   * content first. A signed-out visitor is sent to /login (which itself
   * redirects an already-signed-in session away, so the two guards can't
   * fight); a session flagged `mustChangePassword` (bootstrap admin's
   * default password) is confined to /change-password until it clears. */
  useEffect(() => {
    if (mode !== "live") return;
    if (authStatus !== "signed-in") {
      // Preserve the page the visitor actually asked for. `mode` starts out
      // optimistically "live" before the world has confirmed the appliance
      // is reachable (see store/world.ts); if it turns out to be unreachable
      // and falls back to the demo simulation, LoginPage sends the visitor
      // back to this same location instead of always to "/" — otherwise a
      // direct hit on e.g. /logs would always bounce to the dashboard.
      navigate("/login", { replace: true, state: { from: `${location.pathname}${location.search}` } });
    } else if (mustChangePassword) navigate("/change-password", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, authStatus, mustChangePassword, navigate]);

  /* First-boot gate — live appliances only. An unconfigured appliance has no
   * world worth showing, so hand the session to the setup wizard. Never in
   * sim mode (the demo world is always "configured"), and honor the wizard's
   * explicit "skip" for this session. */
  useEffect(() => {
    if (mode !== "live" || !ready || authStatus !== "signed-in" || mustChangePassword || isSetupSkipped()) return;
    let cancelled = false;
    getProvisioning()
      .then((p) => {
        if (!cancelled && p.stage === "unconfigured") navigate("/setup", { replace: true });
      })
      .catch(() => {
        /* appliance unreachable — the world driver surfaces that itself */
      });
    return () => {
      cancelled = true;
    };
  }, [mode, ready, authStatus, mustChangePassword, navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto scroll-smooth">
          <div className="mx-auto w-full max-w-[1760px] px-4 py-6 sm:px-6 lg:px-8">
            <Suspense fallback={<PageFallback />}>
              {/* One gentle, consistent page settle on every route — opacity + a small
                  rise on a smooth ease-out. Keyed by pathname so it plays per navigation
                  (not on query-only changes or live store updates). Also keyed by language
                  so switching it remounts the page, refreshing any non-hook readers of the
                  `*_META` getter maps. */}
              <motion.div
                key={`${location.pathname}::${i18n.language}`}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
                <Outlet />
              </motion.div>
            </Suspense>
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
