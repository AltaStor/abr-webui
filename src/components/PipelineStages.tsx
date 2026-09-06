// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Fragment } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Activity, AlertTriangle, ArrowRight, Database, HardDrive, Network } from "@/lib/icons";
import type { LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatStorage, formatThroughput } from "@/lib/format";
import i18n from "@/i18n";
import type { Session } from "@/types";

type StageKey = "source" | "network" | "target";

const STAGE_META: Record<StageKey, { icon: LucideIcon; get label(): string; get sub(): string }> = {
  source: {
    icon: HardDrive,
    get label() { return i18n.t("components:pipeline.stage.source.label"); },
    get sub() { return i18n.t("components:pipeline.stage.source.sub"); },
  },
  network: {
    icon: Network,
    get label() { return i18n.t("components:pipeline.stage.network.label"); },
    get sub() { return i18n.t("components:pipeline.stage.network.sub"); },
  },
  target: {
    icon: Database,
    get label() { return i18n.t("components:pipeline.stage.target.label"); },
    get sub() { return i18n.t("components:pipeline.stage.target.sub"); },
  },
};

const BOTTLENECK_LABEL: Record<StageKey, { get label(): string }> = {
  source: { get label() { return i18n.t("components:pipeline.bottleneckLabel.source"); } },
  network: { get label() { return i18n.t("components:pipeline.bottleneckLabel.network"); } },
  target: { get label() { return i18n.t("components:pipeline.bottleneckLabel.target"); } },
};

/**
 * Veeam-style pipeline strip: the three real stages a backup moves data
 * through — guest read → LAN → repository — each with its live rate and a
 * proportional bar, plus the inferred bottleneck. Every number is a distinct
 * measurement, so they intentionally differ (a full's wire is compressed; the
 * repo write is the physical footprint). Shown only while an agent-backed run
 * is storing.
 */
export function PipelineStages({ session }: { session: Session }) {
  const { t } = useTranslation("components");
  const p = session.pipeline;
  if (!p) return null;

  const rates: Record<StageKey, number | undefined> = {
    source: p.sourceReadMBps,
    network: p.netMBps,
    target: p.repoWriteMBps,
  };
  // Bars scale to the busiest stage this tick, so the limiter reads near-full
  // and the rest relative to it. Guard the all-idle case.
  const peak = Math.max(1, rates.source ?? 0, rates.network ?? 0, rates.target ?? 0);
  const bottleneck = p.bottleneck ?? null;

  return (
    <div className="border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="label-overline flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> {t("pipeline.title")}
        </span>
        {bottleneck ? (
          <span
            className="flex items-center gap-1 border border-warning/30 bg-warning/[0.08] px-2 py-0.5 text-[11px] font-medium text-warning"
            title={t("pipeline.bottleneckHint")}
          >
            <AlertTriangle className="h-3 w-3" /> {t("pipeline.bottleneck", { label: BOTTLENECK_LABEL[bottleneck].label })}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground" title={t("pipeline.bottleneckHint")}>
            {t("pipeline.bottleneckNone")}
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-1.5">
        {(["source", "network", "target"] as StageKey[]).map((k, i) => (
          <Fragment key={k}>
            {i > 0 && (
              <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/40" aria-hidden />
            )}
            <StageCard
              stageKey={k}
              rate={rates[k]}
              peak={peak}
              isBottleneck={bottleneck === k}
              // An incremental pulls its changed blocks in an up-front burst, so
              // the live source RATE is ~0 during the store — show the honest
              // total pulled instead of a misleading zero.
              fallbackTotal={
                k === "source" && (rates.source ?? 0) < 1 && (p.sourcePulledGB ?? 0) > 0
                  ? p.sourcePulledGB
                  : undefined
              }
              pooled={k === "target" && p.repoWritePooled === true}
            />
          </Fragment>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {p.logicalProcessedMBps !== undefined && p.logicalProcessedMBps > 0 ? (
          session.backupType === "incremental" ? (
            <Trans
              i18nKey="pipeline.caption.incremental"
              ns="components"
              values={{ rate: formatThroughput(p.logicalProcessedMBps) }}
              components={{ 1: <span className="font-medium text-foreground/80" /> }}
            />
          ) : (
            <Trans
              i18nKey="pipeline.caption.processing"
              ns="components"
              values={{ rate: formatThroughput(p.logicalProcessedMBps) }}
              components={{ 1: <span className="font-medium text-foreground/80" /> }}
            />
          )
        ) : (
          t("pipeline.caption.fallback")
        )}
      </p>
    </div>
  );
}

function StageCard({
  stageKey,
  rate,
  peak,
  isBottleneck,
  fallbackTotal,
  pooled,
}: {
  stageKey: StageKey;
  rate: number | undefined;
  peak: number;
  isBottleneck: boolean;
  fallbackTotal?: number;
  pooled: boolean;
}) {
  const { t } = useTranslation("components");
  const { icon: Icon, label, sub } = STAGE_META[stageKey];
  const known = rate !== undefined;
  const fillPct = known ? Math.min(100, Math.round(((rate ?? 0) / peak) * 100)) : 0;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col border px-2.5 py-2",
        isBottleneck ? "border-warning/40 bg-warning/[0.06]" : "border-border bg-card/40",
      )}
    >
      <span className="label-overline flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="nums mt-1 truncate text-sm font-semibold text-foreground">
        {fallbackTotal !== undefined
          ? formatStorage(fallbackTotal)
          : known
            ? formatThroughput(rate ?? 0)
            : "—"}
      </span>
      <span className="truncate text-[10px] text-muted-foreground/60">
        {fallbackTotal !== undefined ? t("pipeline.stage.pulled") : sub}
        {pooled ? ` · ${t("pipeline.stage.pool")}` : ""}
      </span>
      <div className="mt-1.5 h-1 overflow-hidden bg-border/50">
        <div
          className={cn("h-full transition-[width] duration-250", isBottleneck ? "bg-warning" : "bg-info")}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
