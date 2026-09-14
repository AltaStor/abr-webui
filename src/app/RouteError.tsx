// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link, useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { isModuleLoadError } from "./lazyRoute";

export function RouteError() {
  const { t } = useTranslation("common");
  const error = useRouteError();
  /* Whatever the runtime threw. It is a developer-facing string (often the
   * bundler's "Failed to fetch dynamically imported module"), so it stays
   * beneath the console's own sentence instead of standing in for it. */
  const detail = error instanceof Error ? error.message : null;

  /* A page whose chunk could not be fetched. `lazyRoute` already retried it and
   * spent its one recovery reload, so reaching this screen means the assets
   * really are unavailable — most often a console left open across an appliance
   * upgrade, in a browser holding the previous build's file names. That has a
   * specific remedy (reload, which fetches the current index.html and with it
   * the current asset names), so it gets its own copy and its own button rather
   * than the generic "back to dashboard" that would just fail again. */
  const staleBuild = isModuleLoadError(error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center bg-danger-subtle text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <h1 className="font-display text-lg font-semibold">
          {staleBuild ? t("routeError.staleBuild.title") : t("routeError.title")}
        </h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {staleBuild ? t("routeError.staleBuild.description") : t("routeError.fallback")}
        </p>
        {detail && <p className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {staleBuild && (
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            {t("routeError.staleBuild.reload")}
          </Button>
        )}
        <Button asChild variant={staleBuild ? "outline" : "default"}>
          <Link to="/">{t("routeError.back")}</Link>
        </Button>
      </div>
    </div>
  );
}
