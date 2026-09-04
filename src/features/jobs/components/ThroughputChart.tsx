// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Gauge } from "@/lib/icons";
import { formatDateTime, formatThroughput } from "@/lib/format";
import {
  ChartTooltip,
  areaCursor,
  gridProps,
  latestDot,
  xAxisProps,
  yAxisProps,
} from "@/components/charts";
import type { AccentKey, Session } from "@/types";
import { accentColor } from "../lib";

interface Point {
  ts: string;
  throughput: number;
}

/** Area chart of throughput across a job's recent completed sessions (oldest → newest). */
export function ThroughputChart({ sessions, accent }: { sessions: Session[]; accent: AccentKey }) {
  const { t } = useTranslation("jobs");
  const color = accentColor(accent);
  const data: Point[] = sessions
    .filter((s) => s.status !== "running" && s.status !== "queued")
    .slice(0, 18)
    .reverse()
    .map((s) => ({ ts: s.startedAt, throughput: s.throughputMBps }));

  const avg = data.length ? Math.round(data.reduce((a, d) => a + d.throughput, 0) / data.length) : 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("throughput.title")}</CardTitle>
        <CardDescription>
          {data.length
            ? t("throughput.subtitle", { count: data.length, avg: formatThroughput(avg) })
            : t("throughput.subtitleEmpty")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        {data.length === 0 ? (
          <EmptyState icon={Gauge} title={t("throughput.emptyTitle")} description={t("throughput.emptyDescription")} compact />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="ts" tickFormatter={(v: string) => formatDateTime(v)} {...xAxisProps({ tick: { fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.7)" } })} />
              <YAxis tickFormatter={(v: number) => `${v}`} {...yAxisProps({ width: 42 })} />
              <Tooltip
                cursor={areaCursor}
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatDateTime(String(l))}
                    valueFormatter={(v) => formatThroughput(v)}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="throughput"
                name={t("throughput.seriesName")}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                fill={color}
                fillOpacity={0.08}
                dot={latestDot(color, data.length - 1)}
                activeDot={{ r: 4, fill: color, stroke: "hsl(var(--card))", strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
