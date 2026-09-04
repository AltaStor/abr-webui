// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link, useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "@/lib/icons";
import { Button } from "@/components/ui/button";

export function RouteError() {
  const { t } = useTranslation("common");
  const error = useRouteError();
  /* Whatever the runtime threw. It is a developer-facing string (often the
   * bundler's "Failed to fetch dynamically imported module"), so it stays
   * beneath the console's own sentence instead of standing in for it. */
  const detail = error instanceof Error ? error.message : null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center bg-danger-subtle text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <h1 className="font-display text-lg font-semibold">{t("routeError.title")}</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("routeError.fallback")}</p>
        {detail && <p className="mt-1 max-w-md text-xs text-muted-foreground">{detail}</p>}
      </div>
      <Button asChild>
        <Link to="/">{t("routeError.back")}</Link>
      </Button>
    </div>
  );
}
