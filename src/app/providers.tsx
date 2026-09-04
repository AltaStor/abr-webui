// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { AlertTriangle } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query";
import { startWorld, useWorldStore } from "@/store/world";

/**
 * Standing, unmissable banner for an incompatible console/appliance API
 * version — mounted above everything (including /login, which has no
 * AppShell of its own) since this isn't a per-page condition: nothing in the
 * console can safely talk to the appliance until one side is reloaded/
 * upgraded, so a dismissible toast that scrolls away isn't enough here.
 */
function ApiVersionBanner() {
  const { t } = useTranslation("layout");
  const apiVersionError = useWorldStore((s) => s.apiVersionError);
  if (!apiVersionError) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-col gap-3 border-b border-danger/30 bg-danger-subtle px-4 py-3 sm:flex-row sm:items-center"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm font-semibold text-danger-text">
          {t("apiVersionBanner.title")}
        </div>
        {/* The console's own explanation leads. `apiVersionError` is the
            version-comparison sentence api.http.ts synthesizes — raw English
            with the two version numbers in it, which is the useful part but
            not something a French or German operator should be told first. */}
        <p className="text-xs text-danger-text/80">{t("apiVersionBanner.fallback")}</p>
        {apiVersionError && (
          <p className="mt-0.5 text-xs text-danger-text/70">{apiVersionError}</p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => window.location.reload()}
      >
        {t("apiVersionBanner.reload")}
      </Button>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // When the world makes a structural change (run completes, job created,
    // threat dismissed…) — via the appliance's SSE stream in live mode or the
    // demo simulation's tick — refresh the query-driven views. High-frequency
    // progress updates do NOT bump `revision`; those read live from the store.
    // Subscribe BEFORE starting the world: on a fast LAN the live hydrate can
    // land before this effect otherwise, and its revision bump would be missed.
    let last = useWorldStore.getState().revision;
    const unsub = useWorldStore.subscribe((state) => {
      if (state.revision !== last) {
        last = state.revision;
        queryClient.invalidateQueries();
      }
    });
    startWorld();
    return unsub;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Respect prefers-reduced-motion across every Framer Motion animation. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200} skipDelayDuration={300}>
          <ApiVersionBanner />
          {children}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
