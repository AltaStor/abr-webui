// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Database, HardDrive, ShieldCheck, Trash2, type LucideIcon } from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { KpiCard } from "@/components/KpiCard";
import { KpiBand } from "@/components/KpiBand";
import { useWorldStore } from "@/store/world";
import { formatStorage, usagePercent } from "@/lib/format";
import { useCapacityLevel } from "@/lib/capacity";
import { useThreatLockedRepos } from "@/lib/threatLock";
import type { Repository } from "@/types";
import { AddRepositoryDialog } from "./components/AddRepositoryDialog";
import { RepositoryCard } from "./components/RepositoryCard";
import { RepositoryDetailDialog } from "./components/RepositoryDetailDialog";
import { EditRepositoryDialog } from "./components/EditRepositoryDialog";
import { DeleteRepositoryDialog } from "./components/DeleteRepositoryDialog";
import type { RepositoryActions } from "./components/RepositoryActionsMenu";
import { useRepositoryManagement } from "./useRepositoryManagement";

export default function RepositoriesPage() {
  const { t } = useTranslation("repositories");
  const repositories = useWorldStore((s) => s.repositories);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const jobs = useWorldStore((s) => s.jobs);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mgmt = useRepositoryManagement();
  const threatLocks = useThreatLockedRepos();

  // Per-repository live counts.
  const rpByRepo = useMemo(() => {
    const map = new Map<string, number>();
    for (const rp of restorePoints) {
      map.set(rp.repositoryId, (map.get(rp.repositoryId) ?? 0) + 1);
    }
    return map;
  }, [restorePoints]);

  const jobsByRepo = useMemo(() => {
    const map = new Map<string, typeof jobs>();
    for (const job of jobs) {
      const list = map.get(job.repositoryId) ?? [];
      list.push(job);
      map.set(job.repositoryId, list);
    }
    return map;
  }, [jobs]);

  // Summary KPIs.
  const summary = useMemo(() => {
    const capacityGB = repositories.reduce((a, r) => a + r.capacityGB, 0);
    const usedGB = repositories.reduce((a, r) => a + r.usedGB, 0);
    return {
      capacityGB,
      usedGB,
      usedPct: usagePercent(usedGB, capacityGB),
    };
  }, [repositories]);

  const usedLevel = useCapacityLevel(summary.usedPct);

  // Storage-health strip: reclaimable space, repos with integrity issues.
  const health = useMemo(() => {
    const pendingGcGB = repositories.reduce((a, r) => a + (r.pendingGcGB ?? 0), 0);
    const issuesCount = repositories.filter((r) => r.integrityStatus === "issues").length;
    return { pendingGcGB, issuesCount };
  }, [repositories]);

  const selected: Repository | null =
    repositories.find((r) => r.id === selectedId) ?? null;

  // Build the shared action bundle for a given repo.
  const actionsFor = (repo: Repository): RepositoryActions => ({
    onEdit: () => mgmt.openEdit(repo),
    onRescan: () => mgmt.rescan(repo),
    onDelete: () => mgmt.openDelete(repo),
  });

  const dialogRepo: Repository | null =
    mgmt.dialog !== null
      ? (repositories.find((r) => r.id === mgmt.dialog?.repoId) ?? null)
      : null;

  const hasHealthSignals =
    repositories.length > 0 &&
    (health.pendingGcGB > 0 || health.issuesCount > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={<AddRepositoryDialog />}
      />

      {/* Summary KPIs */}
      <KpiBand className="sm:grid-cols-2 xl:grid-cols-2">
        <KpiCard
          label={t("kpi.totalCapacity")}
          value={summary.capacityGB}
          format={(n) => formatStorage(n, 0)}
          icon={HardDrive}
          tone="neutral"
          hint={t("kpi.totalCapacityHint", { count: repositories.length })}
        />
        <KpiCard
          label={t("kpi.used")}
          value={summary.usedGB}
          format={(n) => formatStorage(n, 0)}
          icon={Database}
          tone={usedLevel === "critical" ? "danger" : usedLevel === "warn" ? "warning" : "neutral"}
          hint={t("kpi.usedHint", { pct: Math.round(summary.usedPct) })}
        />
      </KpiBand>

      {/* Storage-health strip */}
      {hasHealthSignals && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-border bg-card px-4 py-3 text-sm ">
          <span className="label-overline">
            {t("health.title")}
          </span>
          <HealthChip
            icon={Trash2}
            tone="neutral"
            label={t("health.reclaimable")}
            value={formatStorage(health.pendingGcGB, 0)}
            hint={t("health.reclaimableHint")}
          />
          <HealthChip
            icon={ShieldCheck}
            tone={health.issuesCount > 0 ? "warning" : "neutral"}
            label={t("health.integrityIssues")}
            value={health.issuesCount.toString()}
          />
        </div>
      )}

      {/* Repository grid */}
      {repositories.length === 0 ? (
        <div className="border border-dashed border-border bg-card">
          <EmptyState
            icon={HardDrive}
            title={t("empty.title")}
            description={t("empty.description")}
            action={<AddRepositoryDialog />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {repositories.map((repo) => (
            <RepositoryCard
              key={repo.id}
              repo={repo}
              restorePointCount={rpByRepo.get(repo.id) ?? 0}
              jobCount={(jobsByRepo.get(repo.id) ?? []).length}
              onOpen={() => setSelectedId(repo.id)}
              actions={actionsFor(repo)}
              scanning={mgmt.isScanning(repo)}
              threatLock={threatLocks.get(repo.id)}
            />
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <RepositoryDetailDialog
        repo={selected}
        jobs={selected ? (jobsByRepo.get(selected.id) ?? []) : []}
        restorePointCount={selected ? (rpByRepo.get(selected.id) ?? 0) : 0}
        onClose={() => setSelectedId(null)}
        actions={selected ? actionsFor(selected) : NO_ACTIONS}
        scanning={selected ? mgmt.isScanning(selected) : false}
        threatLock={selected ? threatLocks.get(selected.id) : null}
      />

      {/* Management dialogs (shared across card + detail) */}
      <EditRepositoryDialog
        repo={dialogRepo}
        open={mgmt.dialog?.kind === "edit"}
        onOpenChange={(open) => !open && mgmt.closeDialog()}
      />
      <DeleteRepositoryDialog
        repo={dialogRepo}
        jobs={jobs}
        open={mgmt.dialog?.kind === "delete"}
        onOpenChange={(open) => !open && mgmt.closeDialog()}
      />
    </div>
  );
}

const NO_ACTIONS: RepositoryActions = {
  onEdit: () => {},
  onRescan: () => {},
  onDelete: () => {},
};

function HealthChip({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  /** `neutral` is the resting state — a chip reporting a fact, not a verdict.
   *  `muted` stays for the case where no verdict is even possible. */
  tone: "neutral" | "muted" | "warning" | "success";
  label: string;
  value: string;
  hint?: string;
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning-text"
      : tone === "success"
        ? "text-success-text"
        : tone === "neutral"
          ? "text-foreground"
          : "text-muted-foreground";
  return (
    <span className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${toneClass}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className={`nums font-display font-semibold ${toneClass}`}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">· {hint}</span>}
    </span>
  );
}
