// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Clock } from "@/lib/icons";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
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
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label={t("summary.lastBackup")} tone={vm.protection === "warning" ? "warning" : "default"}>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              {formatRelative(vm.lastBackupAt)}
            </span>
          </Stat>
          <Stat label={t("summary.restorePoints")}>
            <span className="nums">{vm.restorePointCount}</span>
          </Stat>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <div className={cn("mt-1 text-sm font-medium", tone === "warning" && "text-warning")}>
        {children}
      </div>
    </div>
  );
}
