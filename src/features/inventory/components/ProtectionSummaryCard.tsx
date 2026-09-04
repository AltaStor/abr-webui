// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Clock } from "@/lib/icons";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { Metric } from "@/components/Metric";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";
import { PROTECTION_META, toneChip, toneFg } from "@/lib/status";
import type { VM } from "@/types";

/** A reassuring at-a-glance protection summary for a single VM. */
export function ProtectionSummaryCard({
  vm,
  unreachableCount = 0,
}: {
  vm: VM;
  /** Restore points on offline storage — surfaced so the summary doesn't claim
   *  "healthy" while the points list shows them unreachable. */
  unreachableCount?: number;
}) {
  const { t } = useTranslation("inventory");
  const meta = PROTECTION_META[vm.protection];
  const Icon = meta.icon;

  const headline =
    vm.protection === "protected"
      ? t("summary.headlineProtected", { noun: t("summary.nounVm") })
      : vm.protection === "warning"
        ? t("summary.headlineWarning")
        : t("summary.headlineUnprotected", { noun: t("summary.nounVm") });

  const subline =
    unreachableCount > 0
      ? t("summary.sublineUnreachable", { count: unreachableCount })
      : vm.protection === "protected"
        ? t("summary.sublineHealthy")
        : vm.protectionNote ?? t("summary.sublineProtect");

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center",
              toneChip(meta.tone),
            )}
          >
            <Icon className={cn("h-6 w-6", toneFg(meta.tone))} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{headline}</h2>
              <StatusPill meta={meta} size="sm" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{subline}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          <Metric
            label={t("summary.lastBackup")}
            value={formatRelative(vm.lastBackupAt)}
            sub={vm.lastBackupAt ? formatDateTime(vm.lastBackupAt) : undefined}
            icon={Clock}
            tone={vm.protection === "warning" ? "warning" : undefined}
            surface="inset"
          />
          <Metric
            label={t("summary.restorePoints")}
            value={vm.restorePointCount}
            surface="inset"
          />
        </div>
      </CardContent>
    </Card>
  );
}
