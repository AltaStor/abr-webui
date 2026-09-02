// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link, useRouteError } from "react-router-dom";
import { AlertTriangle } from "@/lib/icons";
import { Button } from "@/components/ui/button";

export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : "Something went wrong rendering this view.";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-subtle text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-lg font-semibold">This view hit a snag</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      <Button asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
