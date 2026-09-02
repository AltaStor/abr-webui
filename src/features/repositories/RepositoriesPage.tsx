// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { Database, HardDrive, ShieldCheck, Trash2, Wrench } from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { KpiCard } from "@/components/KpiCard";
import { useWorldStore } from "@/store/world";
import { formatStorage, usagePercent } from "@/lib/format";
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

  // Storage-health strip: reclaimable space, repos in maintenance / with issues.
  const health = useMemo(() => {
    const pendingGcGB = repositories.reduce((a, r) => a + (r.pendingGcGB ?? 0), 0);
    const maintenanceCount = repositories.filter((r) => mgmt.isMaintenance(r)).length;
    const issuesCount = repositories.filter((r) => r.integrityStatus === "issues").length;
    return { pendingGcGB, maintenanceCount, issuesCount };
  }, [repositories, mgmt]);

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
    (health.pendingGcGB > 0 || health.maintenanceCount > 0 || health.issuesCount > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Repositories"
        description="Where your backups live."
        actions={<AddRepositoryDialog />}
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Total capacity"
          value={summary.capacityGB}
          format={(n) => formatStorage(n, 0)}
          icon={HardDrive}
          tone="info"
          hint={`Across ${repositories.length} repositories`}
        />
        <KpiCard
          label="Used"
          value={summary.usedGB}
          format={(n) => formatStorage(n, 0)}
          icon={Database}
          tone={summary.usedPct > 85 ? "warning" : "muted"}
          hint={`${Math.round(summary.usedPct)}% of total capacity`}
        />
      </div>

      {/* Storage-health strip */}
      {hasHealthSignals && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border/70 bg-card px-4 py-3 text-sm shadow-card">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Storage health
          </span>
          <HealthChip
            icon={Trash2}
            tone={health.pendingGcGB > 0 ? "muted" : "muted"}
            label="Reclaimable"
            value={formatStorage(health.pendingGcGB, 0)}
            hint="pending garbage collection"
          />
          <HealthChip
            icon={Wrench}
            tone={health.maintenanceCount > 0 ? "warning" : "muted"}
            label="In maintenance"
            value={health.maintenanceCount.toString()}
          />
          <HealthChip
            icon={ShieldCheck}
            tone={health.issuesCount > 0 ? "warning" : "success"}
            label="Integrity issues"
            value={health.issuesCount.toString()}
          />
        </div>
      )}

      {/* Repository grid */}
      {repositories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-card">
          <EmptyState
            icon={HardDrive}
            title="No repositories yet"
            description="Point AltaStor at storage you already own."
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
              maintenance={mgmt.isMaintenance(repo)}
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
        maintenance={selected ? mgmt.isMaintenance(selected) : false}
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
  icon: typeof Wrench;
  tone: "muted" | "warning" | "success";
  label: string;
  value: string;
  hint?: string;
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning-text"
      : tone === "success"
        ? "text-success-text"
        : "text-muted-foreground";
  return (
    <span className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${toneClass}`} />
      <span className={tone === "muted" ? "text-muted-foreground" : toneClass}>{label}</span>
      <span className={`nums font-semibold ${tone === "muted" ? "text-foreground" : toneClass}`}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">· {hint}</span>}
    </span>
  );
}
