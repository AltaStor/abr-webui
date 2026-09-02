// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Trans, useTranslation } from "react-i18next";
import { ShieldCheck } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { CoverageBar } from "@/components/CoverageBar";
import { cn } from "@/lib/utils";
import { toneChip, toneFg } from "@/lib/status";
import type { ProtectionStatus } from "@/types";

interface Props {
  counts: Record<ProtectionStatus, number>;
  total: number;
  running: number;
}

/**
 * One compact line that carries the protection *proportion* — the single fact
 * the status chips below (counts) and the dashboard donut (posture headline)
 * don't show. Replaces the old four-KPI grid that restated the dashboard.
 */
export function ProtectionCoverageStrip({ counts, total, running }: Props) {
  const { t } = useTranslation("inventory");
  const coverage = total ? Math.round((counts.protected / total) * 100) : 0;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneChip("success"))}>
          <ShieldCheck className={cn("h-5 w-5", toneFg("success"))} />
        </span>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="nums text-2xl font-semibold tracking-tight">{coverage}%</span>
            <span className="text-sm text-muted-foreground">{t("coverage.protected")}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            <Trans
              i18nKey="coverage.summary"
              ns="inventory"
              values={{ protected: counts.protected, total, noun: t("coverage.vms"), running, runningLabel: t("coverage.running") }}
              components={{
                b: <span className="nums font-medium text-foreground" />,
                n: <span className="nums" />,
              }}
            />
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <CoverageBar
          protectedCount={counts.protected}
          warning={counts.warning}
          unprotected={counts.unprotected}
          height="h-2"
        />
      </div>
    </Card>
  );
}
