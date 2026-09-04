// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useState } from "react";
import { motion, useReducedMotionConfig } from "framer-motion";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  type SectorProps,
} from "recharts";
import { useTranslation } from "react-i18next";
import { IconProtected } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountUp } from "@/components/CountUp";
import { token } from "@/components/charts";
import { DUR, EASE_BRAND } from "@/lib/motion";
import { PROTECTION_META, toneFg } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { DashboardSummary, ProtectionStatus } from "@/types";

interface Props {
  summary: DashboardSummary;
  onSegment?: (status: ProtectionStatus) => void;
}

interface ProtectionDatum {
  key: ProtectionStatus;
  name: string;
  value: number;
  percent: number;
  color: string;
}

type ProtectionSectorProps = SectorProps & {
  payload?: ProtectionDatum;
};

const STATUS_ORDER: ProtectionStatus[] = [
  "protected",
  "warning",
  "unprotected",
];

/** The original protection donut with linked pointer and keyboard inspection. */
export function ProtectionDonut({ summary, onSegment }: Props) {
  const { t } = useTranslation(["dashboard", "inventory"]);
  const reduceMotion = useReducedMotionConfig() === true;
  const [hoveredStatus, setHoveredStatus] = useState<ProtectionStatus | null>(null);
  const [focusedStatus, setFocusedStatus] = useState<ProtectionStatus | null>(null);
  const activeStatus = focusedStatus ?? hoveredStatus;
  const total = summary.totalVms;
  const counts: Record<ProtectionStatus, number> = {
    protected: summary.protectedVms,
    warning: summary.warningVms,
    unprotected: summary.unprotectedVms,
  };
  const data: ProtectionDatum[] = STATUS_ORDER.map((status) => ({
    key: status,
    name: PROTECTION_META[status].label,
    value: counts[status],
    percent: total > 0 ? (counts[status] / total) * 100 : 0,
    color: token(PROTECTION_META[status].tone),
  }));
  const activeMetric = activeStatus
    ? data.find((datum) => datum.key === activeStatus) ?? null
    : null;
  const nonZeroCount = data.filter((datum) => datum.value > 0).length;
  const chartLabel = total === 0
    ? `${t("dashboard:donut.title")}: ${t("inventory:empty.vmsTitle")}.`
    : t("dashboard:donut.ariaLabel", {
        coverage: Math.round(summary.protectionCoverage),
        total,
        warning: summary.warningVms,
        unprotected: summary.unprotectedVms,
      });

  const renderSector = useCallback(
    (props: ProtectionSectorProps) => {
      const status = props.payload?.key ?? null;
      const active = status !== null && activeStatus === status;
      const quiet = activeStatus !== null && !active;

      return (
        <motion.g
          initial={false}
          animate={{
            opacity: quiet ? 0.28 : 1,
            scale: reduceMotion ? 1 : active ? 1.035 : 1,
          }}
          transition={{
            duration: reduceMotion ? 0 : DUR.color,
            ease: EASE_BRAND,
          }}
          style={{
            cursor: onSegment ? "pointer" : "default",
            transformBox: "view-box",
            transformOrigin: `${props.cx}px ${props.cy}px`,
          }}
        >
          <Sector {...props} />
        </motion.g>
      );
    },
    [activeStatus, onSegment, reduceMotion],
  );

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="pb-0">
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          <IconProtected className="h-4 w-4 text-muted-foreground" />
          {t("dashboard:donut.title")}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col pt-2">
        <div
          className="relative mx-auto h-[184px] w-full shrink-0"
          role="img"
          aria-label={chartLabel}
          onPointerLeave={() => setHoveredStatus(null)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
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
                rootTabIndex={-1}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={63}
                outerRadius={86}
                paddingAngle={nonZeroCount > 1 ? 3 : 0}
                strokeWidth={0}
                startAngle={90}
                endAngle={-270}
                activeIndex={[0, 1, 2]}
                activeShape={renderSector}
                isAnimationActive={false}
                rootTabIndex={-1}
                onMouseEnter={(_entry, index) =>
                  setHoveredStatus(data[index]?.key ?? null)
                }
                onMouseLeave={() => setHoveredStatus(null)}
                onClick={(_entry, index) => {
                  const status = data[index]?.key;
                  if (status) onSegment?.(status);
                }}
              >
                {data.map((datum) => (
                  <Cell
                    key={datum.key}
                    fill={datum.color}
                    className={onSegment ? "cursor-pointer" : "cursor-default"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-center"
          >
            <motion.div
              className="absolute flex flex-col items-center"
              animate={{
                opacity: activeMetric ? 0 : 1,
                clipPath: activeMetric
                  ? "inset(0 0 18% 0)"
                  : "inset(0 0 0% 0)",
              }}
              transition={{
                duration: reduceMotion ? 0 : DUR.color,
                ease: EASE_BRAND,
              }}
            >
              {total === 0 ? (
                <span className="nums font-display text-[2rem] font-semibold leading-none tracking-tight text-muted-foreground">
                  —
                </span>
              ) : reduceMotion ? (
                <span className="nums font-display text-[2rem] font-semibold leading-none tracking-tight">
                  {Math.round(summary.protectionCoverage)}%
                </span>
              ) : (
                <CountUp
                  value={summary.protectionCoverage}
                  format={(value) => `${Math.round(value)}%`}
                  className="nums font-display text-[2rem] font-semibold leading-none tracking-tight"
                />
              )}
              <span className="mt-1.5 nums text-xs text-muted-foreground">
                {t("dashboard:donut.center", {
                  protected: summary.protectedVms,
                  total,
                })}
              </span>
            </motion.div>

            {activeMetric && (
              <motion.div
                key={activeMetric.key}
                className="absolute flex flex-col items-center"
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, clipPath: "inset(16% 0 0 0)" }
                }
                animate={{ opacity: 1, clipPath: "inset(0% 0 0 0)" }}
                transition={{
                  duration: reduceMotion ? 0 : DUR.color,
                  ease: EASE_BRAND,
                }}
              >
                <span
                  className={cn(
                    "nums font-display text-[2rem] font-semibold leading-none tracking-tight",
                    toneFg(PROTECTION_META[activeMetric.key].tone),
                  )}
                >
                  {activeMetric.value}
                </span>
                <span className="mt-1.5 text-xs font-medium text-foreground">
                  {activeMetric.name}
                </span>
                <span className="nums mt-0.5 text-[11px] text-muted-foreground">
                  {Math.round(activeMetric.percent)}%
                </span>
              </motion.div>
            )}
          </div>
        </div>

        <div
          className="mt-3 space-y-0.5"
          role="group"
          aria-label={`${t("inventory:page.title")} · ${t("dashboard:donut.title")}`}
        >
          {data.map((datum) => {
            const active = activeStatus === datum.key;

            return (
              <button
                key={datum.key}
                type="button"
                disabled={!onSegment}
                onPointerEnter={() => setHoveredStatus(datum.key)}
                onPointerLeave={() => setHoveredStatus(null)}
                onFocus={() => setFocusedStatus(datum.key)}
                onBlur={() => setFocusedStatus(null)}
                onClick={() => onSegment?.(datum.key)}
                aria-label={`${datum.name} ${datum.value}, ${Math.round(datum.percent)}%${onSegment ? `. ${t("inventory:page.title")}` : ""}`}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between px-2 py-1.5 text-sm transition-colors duration-250 sm:min-h-0",
                  active
                    ? "bg-muted/55"
                    : onSegment
                      ? "hover:bg-muted/50 focus-visible:bg-muted/50"
                      : "cursor-default",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ backgroundColor: datum.color }}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "text-muted-foreground transition-colors duration-250",
                      active && "text-foreground",
                    )}
                  >
                    {datum.name}
                  </span>
                </span>
                <span className="nums font-display font-medium">
                  {datum.value}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
