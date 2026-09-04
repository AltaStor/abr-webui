// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { motion, useReducedMotionConfig } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { IconBackup } from "@/lib/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/format";
import {
  ChartInspectionLegend,
  ChartTooltip,
  barCursor,
  gridProps,
  inspectionBarShape,
  token,
  xAxisProps,
  yAxisProps,
} from "@/components/charts";
import { DUR, EASE_BRAND } from "@/lib/motion";
import type { ActivityPoint } from "@/types";

interface Props {
  data: ActivityPoint[];
}

type OutcomeKey = "success" | "warning" | "failed";

const OUTCOME_KEYS: OutcomeKey[] = ["success", "warning", "failed"];

const outcomeTextClass: Record<OutcomeKey, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  failed: "text-danger-text",
};

export function ActivityTimeline({ data }: Props) {
  const { t } = useTranslation("dashboard");
  const reduceMotion = useReducedMotionConfig() === true;
  const [hoveredOutcome, setHoveredOutcome] = useState<OutcomeKey | null>(null);
  const [focusedOutcome, setFocusedOutcome] = useState<OutcomeKey | null>(null);
  const [pinnedOutcome, setPinnedOutcome] = useState<OutcomeKey | null>(null);
  const activeOutcome = focusedOutcome ?? hoveredOutcome ?? pinnedOutcome;

  const totalRuns = data.reduce((a, d) => a + d.success + d.warning + d.failed, 0);
  const totalSuccess = data.reduce((a, d) => a + d.success, 0);
  const totalWarning = data.reduce((a, d) => a + d.warning, 0);
  const totalFailed = data.reduce((a, d) => a + d.failed, 0);
  const outcomeCounts: Record<OutcomeKey, number> = {
    success: totalSuccess,
    warning: totalWarning,
    failed: totalFailed,
  };
  const outcomeColors: Record<OutcomeKey, string> = {
    success: token("success"),
    warning: token("warning"),
    failed: token("danger"),
  };
  const outcomeLabels: Record<OutcomeKey, string> = {
    success: t("domain:session.success"),
    warning: t("domain:session.warning"),
    failed: t("domain:session.failed"),
  };
  const outcomeLegend = OUTCOME_KEYS.map((key) => {
    const count = outcomeCounts[key];
    const percent = totalRuns > 0 ? Math.round((count / totalRuns) * 100) : 0;
    return {
      key,
      color: outcomeColors[key],
      label: outcomeLabels[key],
      ariaLabel: `${outcomeLabels[key]}: ${count}, ${percent}%`,
      count,
      percent,
    };
  });
  const activeMetric = activeOutcome
    ? outcomeLegend.find((outcome) => outcome.key === activeOutcome) ?? null
    : null;
  // No runs in the window means there is no success rate — not a 100% one.
  // A "100% success rate" over an empty chart is the most reassuring
  // thing this card could say about an appliance that has protected nothing.
  const rate = totalRuns ? Math.round((totalSuccess / totalRuns) * 100) : null;
  const chartLabel =
    rate === null
      ? t("activity.ariaLabelNoRuns", { days: data.length })
      : t("activity.ariaLabel", { rate, days: data.length, runs: totalRuns, failed: totalFailed });

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconBackup className="h-4 w-4 text-muted-foreground" />
            {t("activity.title")}
          </CardTitle>
          <CardDescription>{t("activity.subtitle", { count: totalRuns })}</CardDescription>
        </div>
        <ChartInspectionLegend
          items={outcomeLegend}
          activeKey={activeOutcome}
          pinnedKey={pinnedOutcome}
          ariaLabel={t("activity.title")}
          onPointerKeyChange={setHoveredOutcome}
          onFocusKeyChange={setFocusedOutcome}
          onToggleKey={(key) => setPinnedOutcome((current) => (current === key ? null : key))}
        />
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        <div className="relative mb-1 min-h-8">
          <motion.div
            aria-hidden={activeMetric ? true : undefined}
            className="absolute inset-0 flex items-baseline gap-2"
            initial={false}
            animate={{
              opacity: activeMetric ? 0 : 1,
              clipPath: activeMetric ? "inset(0 0 18% 0)" : "inset(0 0 0% 0)",
            }}
            transition={{ duration: reduceMotion ? 0 : DUR.color, ease: EASE_BRAND }}
          >
            <span className={cn("nums font-display text-2xl font-semibold", rate === null && "text-muted-foreground")}>
              {rate === null ? "—" : `${rate}%`}
            </span>
            <span className="text-xs text-muted-foreground">
              {rate === null ? t("activity.noRuns") : t("activity.successRate")}
            </span>
          </motion.div>

          {activeMetric && (
            <motion.div
              key={activeMetric.key}
              aria-hidden="true"
              className="absolute inset-0 flex items-baseline gap-2"
              initial={reduceMotion ? false : { opacity: 0, clipPath: "inset(16% 0 0 0)" }}
              animate={{ opacity: 1, clipPath: "inset(0% 0 0 0)" }}
              transition={{ duration: reduceMotion ? 0 : DUR.color, ease: EASE_BRAND }}
            >
              <span className={cn("nums font-display text-2xl font-semibold", outcomeTextClass[activeMetric.key])}>
                {activeMetric.count}
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="text-foreground">{activeMetric.label}</span>
                {` · ${activeMetric.percent}%`}
              </span>
            </motion.div>
          )}
        </div>
        <div role="img" aria-label={chartLabel}>
          <div aria-hidden="true" onPointerLeave={() => setHoveredOutcome(null)}>
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }} barCategoryGap={5}>
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
                {OUTCOME_KEYS.map((outcome) => {
                  const shape = inspectionBarShape({
                    active: activeOutcome === outcome,
                    quiet: activeOutcome !== null && activeOutcome !== outcome,
                    reduceMotion,
                  });

                  return (
                    <Bar
                      key={outcome}
                      dataKey={outcome}
                      name={outcomeLabels[outcome]}
                      stackId="a"
                      fill={outcomeColors[outcome]}
                      maxBarSize={22}
                      shape={shape}
                      activeBar={shape}
                      onMouseEnter={() => setHoveredOutcome(outcome)}
                      onMouseLeave={() => setHoveredOutcome(null)}
                      isAnimationActive={false}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
