// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Database, Layers, Lock, ShieldAlert } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Metric } from "@/components/Metric";
import { Sparkline } from "@/components/Sparkline";
import { StatusPill } from "@/components/StatusPill";
import { useCapacityLevel } from "@/lib/capacity";
import type { RepoThreatLock } from "@/lib/threatLock";
import { formatStorage, usagePercent } from "@/lib/format";
import type { Repository } from "@/types";
import { immutabilityLabel, REPO_STATUS_META, REPO_TYPE_META } from "./repoMeta";
import { RepositoryActionsMenu, type RepositoryActions } from "./RepositoryActionsMenu";

interface RepositoryCardProps {
  repo: Repository;
  restorePointCount: number;
  jobCount: number;
  onOpen: () => void;
  actions: RepositoryActions;
  scanning: boolean;
  /** A full repository validation is in flight from this card's menu. */
  verifying: boolean;
  /** Set when auto-lock-on-threat has sealed this repo (derived, presentational). */
  threatLock?: RepoThreatLock | null;
}

export function RepositoryCard({
  repo,
  restorePointCount,
  jobCount,
  onOpen,
  actions,
  scanning,
  verifying,
  threatLock,
}: RepositoryCardProps) {
  const { t } = useTranslation("repositories");
  const typeMeta = REPO_TYPE_META[repo.type];
  const statusMeta = REPO_STATUS_META[repo.status];
  const TypeIcon = typeMeta.icon;
  // Object storage (S3) has no fixed capacity to report — the backend only
  // ever gives a real "used" figure for it, so the percent bar and free-space
  // caption (which need a ceiling to mean anything) are skipped for it.
  const elastic = repo.capacityGB <= 0;
  // Object Lock is the one repository setting that changes what happens to data
  // after it is written, so it belongs on the card rather than two clicks in.
  const lockLabel = immutabilityLabel(repo);
  const pct = usagePercent(repo.usedGB, repo.capacityGB);
  const freeGB = Math.max(0, repo.capacityGB - repo.usedGB);
  const level = useCapacityLevel(pct);

  const sparkColor =
    level === "critical"
      ? "hsl(var(--danger))"
      : level === "warn"
        ? "hsl(var(--warning))"
        : "hsl(var(--muted-foreground))";

  return (
    <div className="group relative flex flex-col overflow-hidden border border-border bg-card transition-colors duration-250 hover:border-primary/60 hover:shadow-pop">
      {/* Kebab overlay — a real button, sibling to the clickable body so it never
          nests interactive elements inside the card <button>. */}
      <div className="absolute right-3 top-3 z-20">
        <RepositoryActionsMenu
          {...actions}
          scanning={scanning}
          verifying={verifying}
          triggerSize="sm"
          repoName={repo.name}
        />
      </div>

      {/* Clickable body */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("card.openDetails", { name: repo.name })}
        className="flex flex-1 flex-col p-5 text-left"
      >
        {/* Header: icon + name + status (leave room for the kebab) */}
        <div className="flex items-start justify-between gap-3 pr-9">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-muted text-muted-foreground">
              <TypeIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight" title={repo.name}>
                {repo.name}
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{typeMeta.label}</p>
            </div>
          </div>
          <StatusPill meta={{ ...statusMeta, icon: Database }} size="sm" />
        </div>

        {/* Status chips row: immutability / threat-lock / scanning */}
        {(lockLabel || threatLock || scanning || verifying) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {lockLabel && (
              <span className="inline-flex items-center gap-1 bg-immutable-subtle px-2 py-0.5 text-[11px] font-medium text-immutable-text">
                <Lock className="h-3 w-3" />
                {lockLabel}
              </span>
            )}
            {threatLock && (
              <span
                className="inline-flex items-center gap-1 bg-danger-subtle px-2 py-0.5 text-[11px] font-medium text-danger-text"
                title={t("card.threatLockedTitle", { names: threatLock.sourceNames.join(", ") })}
              >
                <ShieldAlert className="h-3 w-3" />
                {t("card.threatLocked")}
              </span>
            )}
            {scanning && (
              <span className="inline-flex items-center gap-1 bg-info-subtle px-2 py-0.5 text-[11px] font-medium text-info-text">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
                {t("card.scanningIntegrity")}
              </span>
            )}
            {verifying && (
              <span className="inline-flex items-center gap-1 bg-info-subtle px-2 py-0.5 text-[11px] font-medium text-info-text">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
                {t("card.verifying")}
              </span>
            )}
          </div>
        )}

        {/* Capacity + usage bar */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="nums text-lg font-semibold">{formatStorage(repo.usedGB, 0)}</span>
            <span className="nums text-xs text-muted-foreground">
              {elastic
                ? t("card.elasticNote")
                : t("card.capacityOfFree", {
                    capacity: formatStorage(repo.capacityGB, 0),
                    free: formatStorage(freeGB, 0),
                  })}
            </span>
          </div>
          {!elastic && (
            <>
              <div className="mt-2 h-2 w-full overflow-hidden bg-muted/70">
                <div
                  className={cn(
                    "h-full transition-[width] duration-250",
                    level === "critical"
                      ? "bg-danger"
                      : level === "warn"
                        ? "bg-warning"
                        : "bg-primary/70",
                  )}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span
                  className={cn(
                    "nums text-[11px] font-medium",
                    level === "critical"
                      ? "text-danger"
                      : level === "warn"
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                >
                  {t("card.percentUsed", { pct: Math.round(pct) })}
                  {level === "critical"
                    ? t("card.criticallyFull")
                    : level === "warn"
                      ? t("card.runningLow")
                      : ""}
                </span>
                {/* Fewer than two daily samples is not a trend — drawing a flat line
                    would invent a usage history the repository never accumulated
                    (a freshly imported repo has none). */}
                {repo.usageTrend.length > 1 && (
                  <Sparkline data={repo.usageTrend} width={72} height={20} color={sparkColor} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Metric chips: restore points · jobs */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
          <Metric
            icon={Database}
            label={t("card.metric.restorePoints")}
            value={restorePointCount.toLocaleString()}
          />
          <Metric icon={Layers} label={t("card.metric.jobsWritingHere")} value={jobCount.toString()} />
        </div>
      </button>
    </div>
  );
}
