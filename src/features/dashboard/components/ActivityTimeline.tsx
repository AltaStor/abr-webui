// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBackup } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/format";
import {
  BarGradient,
  ChartLegend,
  ChartTooltip,
  barCursor,
  gridProps,
  token,
  xAxisProps,
  yAxisProps,
} from "@/components/charts";
import type { ActivityPoint } from "@/types";

interface Props {
  data: ActivityPoint[];
}

export function ActivityTimeline({ data }: Props) {
  const { t } = useTranslation("dashboard");
  const outcomeLegend = [
    { color: token("success"), label: t("domain:session.success") },
    { color: token("warning"), label: t("domain:session.warning") },
    { color: token("danger"), label: t("domain:session.failed") },
  ];

  const totalRuns = data.reduce((a, d) => a + d.success + d.warning + d.failed, 0);
  const totalSuccess = data.reduce((a, d) => a + d.success, 0);
  const totalFailed = data.reduce((a, d) => a + d.failed, 0);
  // No runs in the window means there is no success rate — not a 100% one.
  // A green "100% success rate" over an empty chart is the most reassuring
  // thing this card could say about an appliance that has protected nothing.
  const rate = totalRuns ? Math.round((totalSuccess / totalRuns) * 100) : null;
  const chartLabel =
    rate === null
      ? t("activity.ariaLabelNoRuns", { days: data.length })
      : t("activity.ariaLabel", { rate, days: data.length, runs: totalRuns, failed: totalFailed });

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconBackup className="h-4 w-4 text-muted-foreground" />
            {t("activity.title")}
          </CardTitle>
          <CardDescription>{t("activity.subtitle", { count: totalRuns })}</CardDescription>
        </div>
        <ChartLegend items={outcomeLegend} />
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        <div className="mb-1 flex items-baseline gap-2">
          <span className={cn("nums text-2xl font-semibold", rate === null && "text-muted-foreground")}>
            {rate === null ? "—" : `${rate}%`}
          </span>
          <span className="text-xs text-muted-foreground">
            {rate === null ? t("activity.noRuns") : t("activity.successRate")}
          </span>
        </div>
        <div role="img" aria-label={chartLabel}>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }} barCategoryGap={5}>
                <defs>
                  <BarGradient id="act-success" color={token("success")} />
                  <BarGradient id="act-warning" color={token("warning")} />
                  <BarGradient id="act-danger" color={token("danger")} />
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" tickFormatter={(v: string) => formatDay(v)} {...xAxisProps({ interval: 1, minTickGap: 8 })} />
                <YAxis allowDecimals={false} {...yAxisProps({ width: 32 })} />
                <Tooltip
                  cursor={barCursor}
                  content={
                    <ChartTooltip
                      labelFormatter={(l) => formatDay(String(l))}
                      footer={(rows) => ({
                        label: t("activity.totalRuns"),
                        value: rows.reduce((a, p) => a + (p.value ?? 0), 0),
                      })}
                    />
                  }
                />
                <Bar dataKey="success" name="success" stackId="a" fill="url(#act-success)" maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="warning" name="warning" stackId="a" fill="url(#act-warning)" maxBarSize={22} isAnimationActive={false} />
                <Bar dataKey="failed" name="failed" stackId="a" fill="url(#act-danger)" maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
