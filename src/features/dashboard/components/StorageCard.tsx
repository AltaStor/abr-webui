// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, HardDrive } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { capacityLevel, useCapacityThresholds } from "@/lib/capacity";
import { formatStorage, usagePercent } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { DashboardSummary } from "@/types";

export function StorageCard({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation("dashboard");
  const repositories = useWorldStore((s) => s.repositories);
  const thresholds = useCapacityThresholds();
  const freeGB = summary.capacityGB - summary.usedGB;
  const overallPct = usagePercent(summary.usedGB, summary.capacityGB);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          {t("storage.title")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to="/repositories">
            {t("storage.repositories")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        <div>
          <div className="flex items-end justify-between">
            <span className="nums text-2xl font-semibold">{formatStorage(summary.usedGB, 0)}</span>
            <span className="nums text-xs text-muted-foreground">{t("storage.ofFree", { total: formatStorage(summary.capacityGB, 0), free: formatStorage(freeGB, 0) })}</span>
          </div>
          <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden bg-muted/70">
            {repositories.map((r) => {
              const share = (r.usedGB / summary.capacityGB) * 100;
              return (
                <div
                  key={r.id}
                  className="h-full bg-primary/70"
                  style={{ width: `${share}%` }}
                  title={`${r.name} · ${formatStorage(r.usedGB, 0)}`}
                />
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("storage.usedAcross", { count: repositories.length, percent: Math.round(overallPct) })}
          </p>
        </div>

        {/* Per-repository breakdown — only meaningful with 2+ repos. With one
            repository it renders an identical second bar to the total above. */}
        {repositories.length > 1 && (
          <div className="mt-auto space-y-2">
            {repositories.map((r) => {
              const pct = usagePercent(r.usedGB, r.capacityGB);
              const level = capacityLevel(pct, thresholds);
              return (
                <div key={r.id} className="text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      <span className="truncate" title={r.name}>{r.name}</span>
                    </span>
                    <span className="nums shrink-0 text-muted-foreground">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden bg-muted/70">
                    <div
                      className={cn(
                        "h-full",
                        level === "critical"
                          ? "bg-danger"
                          : level === "warn"
                            ? "bg-warning"
                            : "bg-primary/70",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
