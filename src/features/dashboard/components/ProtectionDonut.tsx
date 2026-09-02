// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconProtected } from "@/lib/icons";
import { CountUp } from "@/components/CountUp";
import { token } from "@/components/charts";
import type { DashboardSummary, ProtectionStatus } from "@/types";

interface Props {
  summary: DashboardSummary;
  onSegment?: (status: ProtectionStatus) => void;
}

export function ProtectionDonut({ summary, onSegment }: Props) {
  const { t } = useTranslation("dashboard");
  const data = [
    { key: "protected" as const, name: t("domain:protection.protected"), value: summary.protectedVms, color: token("success") },
    { key: "warning" as const, name: t("domain:protection.warning"), value: summary.warningVms, color: token("warning") },
    { key: "unprotected" as const, name: t("domain:protection.unprotected"), value: summary.unprotectedVms, color: token("danger") },
  ];

  const chartLabel = t("donut.ariaLabel", {
    coverage: Math.round(summary.protectionCoverage),
    total: summary.totalVms,
    warning: summary.warningVms,
    unprotected: summary.unprotectedVms,
  });

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconProtected className="h-4 w-4 text-muted-foreground" />
          {t("donut.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-2">
        <div className="relative mx-auto h-[184px] w-full" role="img" aria-label={chartLabel}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((d) => (
                  <linearGradient key={d.key} id={`donut-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                    <stop offset="100%" stopColor={d.color} stopOpacity={0.72} />
                  </linearGradient>
                ))}
              </defs>
              {/* Faint full-circle track — the segmented ring sits on it, so the
                  gaps read as intentional rather than as holes to the card. */}
              <Pie
                data={[{ value: 1 }]}
                dataKey="value"
                innerRadius={63}
                outerRadius={86}
                startAngle={90}
                endAngle={-270}
                fill="hsl(var(--foreground) / 0.05)"
                stroke="none"
                isAnimationActive={false}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={63}
                outerRadius={86}
                paddingAngle={3}
                strokeWidth={0}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell
                    key={d.key}
                    fill={`url(#donut-${d.key})`}
                    className={onSegment ? "cursor-pointer outline-none transition-opacity hover:opacity-80" : ""}
                    onClick={() => onSegment?.(d.key)}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <CountUp
              value={summary.protectionCoverage}
              format={(n) => `${Math.round(n)}%`}
              className="nums text-[2rem] font-semibold leading-none tracking-tight"
            />
            <span className="mt-1.5 nums text-xs text-muted-foreground">
              {t("donut.center", { protected: summary.protectedVms, total: summary.totalVms })}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-0.5">
          {data.map((d) => (
            <button
              key={d.key}
              disabled={!onSegment}
              onClick={() => onSegment?.(d.key)}
              className={cn(
                "flex w-full items-center justify-between px-2 py-1.5 text-sm transition-colors",
                onSegment ? "cursor-pointer hover:bg-muted/50" : "cursor-default",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground">{d.name}</span>
              </span>
              <span className="nums font-medium">{d.value}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
