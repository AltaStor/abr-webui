// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { usagePercent, formatStorage } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Used / provisioned storage with a thin usage bar — table cell sized. */
export function SizeCell({ usedGB, provisionedGB }: { usedGB: number; provisionedGB: number }) {
  const { t } = useTranslation("inventory");
  const pct = usagePercent(usedGB, provisionedGB);
  return (
    <div className="w-32">
      <div className="flex items-baseline justify-between gap-2">
        <span className="nums text-sm font-medium">{formatStorage(usedGB, 0)}</span>
        <span className="nums text-[11px] text-muted-foreground">/ {formatStorage(provisionedGB, 0)}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("size.storageUsedAria", { pct })}
        className="mt-1 h-1.5 w-full overflow-hidden bg-muted/70"
      >
        <div
          className={cn("h-full", pct > 90 ? "bg-warning" : "bg-primary/70")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
