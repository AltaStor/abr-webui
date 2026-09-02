// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Database,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  Trash2,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusPill } from "@/components/StatusPill";
import { Sparkline } from "@/components/Sparkline";
import { cn } from "@/lib/utils";
import { useCapacityLevel } from "@/lib/capacity";
import { formatInt, formatRelative, formatStorage, usagePercent } from "@/lib/format";
import type { RepoThreatLock } from "@/lib/threatLock";
import type { BackupJob, Repository } from "@/types";
import { REPO_STATUS_META, REPO_TYPE_META } from "./repoMeta";
import { RepositoryActionsMenu, type RepositoryActions } from "./RepositoryActionsMenu";

interface RepositoryDetailDialogProps {
  repo: Repository | null;
  jobs: BackupJob[];
  restorePointCount: number;
  onClose: () => void;
  actions: RepositoryActions;
  maintenance: boolean;
  scanning: boolean;
  /** Set when auto-lock-on-threat has sealed this repo (derived, presentational). */
  threatLock?: RepoThreatLock | null;
}

export function RepositoryDetailDialog({
  repo,
  jobs,
  restorePointCount,
  onClose,
  actions,
  maintenance,
  scanning,
  threatLock,
}: RepositoryDetailDialogProps) {
  return (
    <Dialog open={!!repo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0">
        {repo && (
          <RepositoryDetailBody
            repo={repo}
            jobs={jobs}
            restorePointCount={restorePointCount}
            actions={actions}
            maintenance={maintenance}
            scanning={scanning}
            threatLock={threatLock}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RepositoryDetailBody({
  repo,
  jobs,
  restorePointCount,
  actions,
  maintenance,
  scanning,
  threatLock,
}: {
  repo: Repository;
  jobs: BackupJob[];
  restorePointCount: number;
  actions: RepositoryActions;
  maintenance: boolean;
  scanning: boolean;
  threatLock?: RepoThreatLock | null;
}) {
  const { t } = useTranslation("repositories");
  const typeMeta = REPO_TYPE_META[repo.type];
  const statusMeta = REPO_STATUS_META[repo.status];
  const TypeIcon = typeMeta.icon;
  // Object storage (S3) has no fixed capacity — the backend only ever
  // reports a real "used" figure for it, so the percent bar and free-space
  // caption (which need a ceiling to mean anything) are skipped for it.
  const elastic = repo.capacityGB <= 0;
  const pct = usagePercent(repo.usedGB, repo.capacityGB);
  const freeGB = Math.max(0, repo.capacityGB - repo.usedGB);
  const level = useCapacityLevel(pct);
  const hasUsageTrend = repo.usageTrend.length > 1;

  return (
    <>
      <DialogHeader className="border-b border-border/70 p-6 pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <TypeIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{repo.name}</DialogTitle>
            <DialogDescription className="mt-1">{typeMeta.label}</DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill meta={{ ...statusMeta, icon: Database }} size="sm" withIcon={false} />
            <RepositoryActionsMenu {...actions} scanning={scanning} repoName={repo.name} />
          </div>
        </div>

        {maintenance && (
          <div className="mt-3 inline-flex w-fit items-center gap-1.5 bg-warning-subtle px-2.5 py-1 text-xs font-medium text-warning-text">
            <Wrench className="h-3.5 w-3.5" />
            {t("detail.inMaintenance")}
          </div>
        )}

        {threatLock && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-subtle/60 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-danger-text">{t("detail.threatLockedTitle")}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {t("detail.threatLockedBody", { names: threatLock.sourceNames.join(", ") })}
              </p>
            </div>
          </div>
        )}
      </DialogHeader>

      <ScrollArea className="max-h-[62vh]">
        <div className="space-y-5 p-6 pt-5">
          {/* Path */}
          <Field icon={ServerCog} label={t("detail.storagePath")}>
            <code className="nums rounded-md bg-muted/60 px-2 py-1 text-xs">{repo.path}</code>
          </Field>

          {/* Capacity */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-medium">{t("detail.capacity")}</span>
              <span className="nums text-xs text-muted-foreground">
                {elastic
                  ? t("detail.usedElastic", { used: formatStorage(repo.usedGB, 0) })
                  : t("detail.usedOfFree", {
                      used: formatStorage(repo.usedGB, 0),
                      capacity: formatStorage(repo.capacityGB, 0),
                      free: formatStorage(freeGB, 0),
                    })}
              </span>
            </div>
            {elastic ? (
              <p className="text-[11px] text-muted-foreground">{t("detail.elasticNote")}</p>
            ) : (
              <>
                <div className="h-2.5 w-full overflow-hidden bg-muted/70">
                  <div
                    className={cn(
                      "h-full",
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
                    {hasUsageTrend
                      ? t("detail.percentUsedTrend", { pct: Math.round(pct) })
                      : t("detail.percentUsedNoTrend", { pct: Math.round(pct) })}
                  </span>
                  {/* One sample (or none) is not a trend — a flat line would read as
                      14 days of steady usage that were never recorded. */}
                  {hasUsageTrend && (
                    <Sparkline
                      data={repo.usageTrend}
                      width={96}
                      height={22}
                      color="hsl(var(--muted-foreground))"
                    />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Quick stats */}
          <StatTile
            icon={Database}
            label={t("card.metric.restorePoints")}
            value={formatInt(restorePointCount)}
          />

          {/* Last rescan */}
          <Field icon={RefreshCw} label={t("detail.lastScan")}>
            <span className="nums text-xs text-muted-foreground">
              {formatRelative(repo.lastScanAt ?? null)}
            </span>
          </Field>

          {/* Jobs writing here */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">{t("detail.jobsWriting")}</span>
              <span className="nums text-xs text-muted-foreground">{jobs.length}</span>
            </div>
            {jobs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                {t("detail.noJobsTarget")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="group flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 transition-colors hover:border-border hover:bg-accent/50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            job.state === "running"
                              ? "animate-pulse bg-info"
                              : job.state === "disabled"
                                ? "bg-muted-foreground/50"
                                : "bg-success",
                          )}
                        />
                        <span className="truncate text-sm font-medium" title={job.name}>
                          {job.name}
                        </span>
                        <span className="nums shrink-0 text-xs text-muted-foreground">
                          {job.vmIds.length} VMs
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Actions footer */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 p-4">
        <Button variant="outline" size="sm" onClick={actions.onRescan} disabled={scanning}>
          <RefreshCw className={scanning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {scanning ? t("actions.scanning") : t("detail.footer.rescan")}
        </Button>
        <Button variant="outline" size="sm" onClick={actions.onEdit}>
          {t("actions.editSettings")}
        </Button>
        <Button variant="destructive" size="sm" onClick={actions.onDelete}>
          <Trash2 className="h-4 w-4" />
          {t("common:actions.delete")}
        </Button>
      </div>
    </>
  );
}

function Field({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      {children}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="nums mt-1 text-base font-semibold">{value}</div>
      {hint && <div className="nums text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
