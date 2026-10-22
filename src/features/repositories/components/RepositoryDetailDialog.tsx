// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Database,
  Loader2,
  Lock,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  Network,
  type LucideIcon,
} from "@/lib/icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KpiCard } from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusPill } from "@/components/StatusPill";
import { Sparkline } from "@/components/Sparkline";
import { cn } from "@/lib/utils";
import { useCapacityLevel } from "@/lib/capacity";
import { formatDateTime, formatInt, formatRelative, formatStorage, usagePercent } from "@/lib/format";
import type { RepoThreatLock } from "@/lib/threatLock";
import type { BackupJob, Repository, RepositoryValidationResult } from "@/types";
import { immutabilityLabel, REPO_STATUS_META, REPO_TYPE_META } from "./repoMeta";
import { RepositoryActionsMenu, type RepositoryActions } from "./RepositoryActionsMenu";
import { ValidationResultPanel } from "./ValidationResultPanel";
import { formatUnc } from "./share";

interface RepositoryDetailDialogProps {
  repo: Repository | null;
  jobs: BackupJob[];
  restorePointCount: number;
  onClose: () => void;
  actions: RepositoryActions;
  scanning: boolean;
  /** A full repository validation is in flight. */
  verifying: boolean;
  /** The last validation verdict for this repository, or null if none has been
   *  run in this session. Owned by the page, so it survives closing the panel. */
  verification: RepositoryValidationResult | null;
  /** Set when auto-lock-on-threat has sealed this repo (derived, presentational). */
  threatLock?: RepoThreatLock | null;
}

export function RepositoryDetailDialog({
  repo,
  jobs,
  restorePointCount,
  onClose,
  actions,
  scanning,
  verifying,
  verification,
  threatLock,
}: RepositoryDetailDialogProps) {
  return (
    <Dialog open={!!repo} onOpenChange={(open) => !open && onClose()}>
      {/* `hideClose`: the floating `right-4 top-4` close landed on top of this
          dialog's own header controls, which sit inside the header's p-6. The
          header renders the close as the last control in that row instead, so
          status / manage / close share one baseline and one button size. */}
      <DialogContent className="max-w-xl p-0" hideClose>
        {repo && (
          <RepositoryDetailBody
            repo={repo}
            jobs={jobs}
            restorePointCount={restorePointCount}
            actions={actions}
            scanning={scanning}
            verifying={verifying}
            verification={verification}
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
  scanning,
  verifying,
  verification,
  threatLock,
}: {
  repo: Repository;
  jobs: BackupJob[];
  restorePointCount: number;
  actions: RepositoryActions;
  scanning: boolean;
  verifying: boolean;
  verification: RepositoryValidationResult | null;
  threatLock?: RepoThreatLock | null;
}) {
  const { t } = useTranslation("repositories");
  const { t: tCommon } = useTranslation("common");
  const typeMeta = REPO_TYPE_META[repo.type];
  const statusMeta = REPO_STATUS_META[repo.status];
  const TypeIcon = typeMeta.icon;
  // Object storage (S3) has no fixed capacity — the backend only ever
  // reports a real "used" figure for it, so the percent bar and free-space
  // caption (which need a ceiling to mean anything) are skipped for it.
  const elastic = repo.capacityGB <= 0;
  const lockLabel = immutabilityLabel(repo);
  const pct = usagePercent(repo.usedGB, repo.capacityGB);
  const freeGB = Math.max(0, repo.capacityGB - repo.usedGB);
  const level = useCapacityLevel(pct);
  const hasUsageTrend = repo.usageTrend.length > 1;

  return (
    <>
      <DialogHeader className="border-b border-border p-6 pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-muted text-muted-foreground">
            <TypeIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{repo.name}</DialogTitle>
            <DialogDescription className="mt-1">{typeMeta.label}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StatusPill
              meta={{ ...statusMeta, icon: Database }}
              size="sm"
              withIcon={false}
              className="mr-1"
            />
            <RepositoryActionsMenu
              {...actions}
              scanning={scanning}
              verifying={verifying}
              repoName={repo.name}
            />
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label={tCommon("actions.close")}>
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </div>

        {threatLock && (
          <div className="mt-3 flex items-start gap-2 border border-danger/25 bg-danger-subtle/60 px-3 py-2.5">
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
          <Field icon={ServerCog} label={repo.type === "smb" ? t("detail.mountPath") : t("detail.storagePath")}>
            <code className="nums bg-muted/60 px-2 py-1 text-xs">{repo.path}</code>
          </Field>

          {repo.share && (
            <Field icon={Network} label={t("detail.hypervShare")}>
              <code className="nums bg-muted/60 px-2 py-1 text-xs">{formatUnc(repo.share)}</code>
              <span className="ml-2 text-xs text-muted-foreground">
                {repo.share.username
                  ? t("detail.hypervShareAccount", { account: repo.share.username })
                  : t("detail.hypervShareInventoryAccount")}
              </span>
            </Field>
          )}

          {/* Object Lock — shown only where the backend has the concept, so a
              local repository isn't told it has immutability "off" when the
              setting does not exist for it at all. */}
          {repo.supportsImmutability && (
            <div className="space-y-2">
              <Field icon={Lock} label={t("detail.immutability")}>
                {lockLabel ? (
                  <span className="inline-flex items-center gap-1.5 bg-immutable-subtle px-2 py-1 text-xs font-medium text-immutable-text">
                    <Lock className="h-3 w-3" />
                    {lockLabel}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("detail.immutabilityOff")}</span>
                )}
              </Field>
              {/* "Configured" and "actually enforced by the bucket" are two
                  different claims, and a badge alone only makes the first. Say
                  which one this is, and point at the check that settles it. */}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {lockLabel
                  ? t("detail.immutabilityConfiguredNote", { count: restorePointCount })
                  : t("detail.immutabilityOffNote")}
              </p>
            </div>
          )}

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
          <KpiCard
            density="compact"
            icon={Database}
            label={t("card.metric.restorePoints")}
            value={formatInt(restorePointCount)}
          />

          {/* Last rescan */}
          <Field icon={RefreshCw} label={t("detail.lastScan")}>
            <span className="nums text-right text-xs text-muted-foreground">
              {formatRelative(repo.lastScanAt ?? null)}
              {repo.lastScanAt && (
                <span className="block text-[11px]">{formatDateTime(repo.lastScanAt)}</span>
              )}
            </span>
          </Field>

          {/* Validation — the appliance's verdict on this repository, kept on
              screen rather than only flashed as a toast: the failing check is
              the part an operator has to act on. */}
          {verification && (
            <div className="space-y-1.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                {t("detail.validationTitle")}
              </span>
              <ValidationResultPanel
                ok={verification.ok}
                message={verification.message}
                checks={verification.checks}
              />
            </div>
          )}

          {/* Jobs writing here */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">{t("detail.jobsWriting")}</span>
              <span className="nums text-xs text-muted-foreground">{jobs.length}</span>
            </div>
            {jobs.length === 0 ? (
              <p className="border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                {t("detail.noJobsTarget")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="group flex items-center justify-between gap-3 border border-border px-3 py-2 transition-colors hover:border-border hover:bg-accent/50"
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

      {/* Actions footer — only what the signed-in role may do. */}
      {(actions.onRescan || actions.onVerify || actions.onEdit || actions.onDelete) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-4">
          {actions.onRescan && (
            <Button variant="outline" size="sm" onClick={actions.onRescan} disabled={scanning}>
              <RefreshCw className={scanning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {scanning ? t("actions.scanning") : t("detail.footer.rescan")}
            </Button>
          )}
          {actions.onVerify && (
            <Button variant="outline" size="sm" onClick={actions.onVerify} disabled={verifying}>
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {verifying ? t("actions.verifying") : t("actions.verify")}
            </Button>
          )}
          {actions.onEdit && (
            <Button variant="outline" size="sm" onClick={actions.onEdit}>
              {t("actions.editSettings")}
            </Button>
          )}
          {actions.onDelete && (
            <Button variant="destructive" size="sm" onClick={actions.onDelete}>
              <Trash2 className="h-4 w-4" />
              {t("common:actions.delete")}
            </Button>
          )}
        </div>
      )}
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

