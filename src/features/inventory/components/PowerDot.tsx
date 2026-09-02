// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";
import type { PowerState } from "@/types";
import { POWER_META } from "./vm-presentation";

/** A small colored dot conveying VM power state, with a tooltip label. */
export function PowerDot({ state, className }: { state: PowerState; className?: string }) {
  // Subscribe to language changes so the getter-resolved label re-renders.
  useTranslation("inventory");
  const meta = POWER_META[state];
  return (
    <Hint label={meta.label}>
      <span className={cn("relative flex h-2 w-2", className)} aria-label={meta.label}>
        {state === "running" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", meta.dot)} />
      </span>
    </Hint>
  );
}
