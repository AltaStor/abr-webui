// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, Database, History, Info, Search } from "@/lib/icons";
import { toast } from "@/components/ui/sonner";
import { Card } from "@/components/ui/card";
import { KpiBand } from "@/components/KpiBand";
import { KpiCard } from "@/components/KpiCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { formatStorage } from "@/lib/format";
import type { RestorePoint, Session } from "@/types";
import {
  compressionRatioLabel,
  groupRestorePointsByJob,
  type RestorePointJobVmGroup,
} from "@/lib/restore-points";
import { useWorldStore } from "@/store/world";
import { restoreLink } from "@/features/restore/link";
import { BackupJobRow } from "./BackupJobRow";
import {
  DeleteJobVmBackupsDialog,
  type DeleteJobVmBackupsTarget,
} from "./DeleteJobVmBackupsDialog";

type ScopeFilter = "all" | "orphaned";
type SortDir = "asc" | "desc";

/** Groups auto-expand only for a small estate; above this, start collapsed. */
const AUTO_EXPAND_LIMIT = 5;

/**
 * A verification the operator started here, followed until it settles.
 *
 * `verifyBackups` resolves once the runs have STARTED — the appliance verifies
 * on its own thread and reports through the session feed — so the row's state
 * has to be read back off those sessions rather than off the call.
 */
interface VerifyRun {
  vmName: string;
  sessionIds: string[];
  /** ms, for the give-up below. */
  startedAt: number;
}

/** How long to keep waiting for a started run to appear in the session feed
 *  before letting the row go quiet. The runs are real either way — Activity is
 *  where they live — so a feed that never catches up must not leave a spinner
 *  turning for the rest of the session. */
const VERIFY_FEED_GRACE_MS = 60_000;

/**
 * The estate's stored backups, as a tree: job → VM → restore points (full and
 * incremental together). Deletion lives only on a VM-under-job row and
 * removes that VM's entire backup chain for that job — never a single point,
 * never a sibling VM's history. Because every point carries its own name and
 * job, a job group renders even after the job itself is gone: this is the
 * ONLY place to browse or delete points orphaned by a deleted job, which
 * otherwise linger in a repository unreachable.
 *
 * Lives as the "Backups" tab on the Jobs page (formerly its own /backups page).
 */
export function BackupsTab() {
  const { t } = useTranslation("jobs");
  const navigate = useNavigate();
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const repositories = useWorldStore((s) => s.repositories);
  const jobs = useWorldStore((s) => s.jobs);
  const vms = useWorldStore((s) => s.vms);

  const [search, setSearch] = useState("");
  const [repoFilter, setRepoFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deleteTarget, setDeleteTarget] = useState<DeleteJobVmBackupsTarget | null>(null);
  const [verifyRuns, setVerifyRuns] = useState<Record<string, VerifyRun>>({});

  const verifyBackups = useWorldStore((s) => s.verifyBackups);
  const sessions = useWorldStore((s) => s.sessions);

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const offlineRepoIds = useMemo(
    () => new Set(repositories.filter((r) => r.status === "offline").map((r) => r.id)),
    [repositories],
  );

  const groups = useMemo(
    () => groupRestorePointsByJob(restorePoints, { vms, jobs }),
    [restorePoints, vms, jobs],
  );

  const orphanCount = groups.filter((g) => g.orphaned).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .map((g) => {
        if (scopeFilter === "orphaned" && !g.orphaned) return null;
        const matchingVms = g.vms.filter((v) => {
          if (repoFilter !== "all" && !v.repositoryIds.includes(repoFilter)) return false;
          if (q && !`${g.jobName} ${v.name}`.toLowerCase().includes(q)) return false;
          return true;
        });
        if (matchingVms.length === 0) return null;
        return { ...g, vms: matchingVms };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);
  }, [groups, search, scopeFilter, repoFilter]);

  // Expand automatically for a small estate, otherwise let the user open groups
  // one at a time. The store hydrates by polling, so groups start empty and fill
  // in later — seed once on the first non-empty set rather than on first render,
  // and key off the unfiltered groups so toggling filters doesn't thrash what's open.
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(() => new Set());
  const [expandedVms, setExpandedVms] = useState<Set<string>>(() => new Set());
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || groups.length === 0) return;
    seeded.current = true;
    if (groups.length <= AUTO_EXPAND_LIMIT) {
      setExpandedJobs(new Set(groups.map((g) => g.jobId)));
    }
  }, [groups]);

  const toggleJob = (id: string) =>
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // VM rows are scoped within a job, but ids are tracked with a composite key
  // (jobId:vmId) since the same VM can appear under more than one job.
  const vmKey = (jobId: string, vmId: string) => `${jobId}:${vmId}`;
  const toggleVm = (jobId: string, vmId: string) =>
    setExpandedVms((prev) => {
      const key = vmKey(jobId, vmId);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /* --------------------------- verification --------------------------- */
  const handleVerifyVm = async (jobId: string, vm: RestorePointJobVmGroup) => {
    const key = vmKey(jobId, vm.vmId);
    if (verifyRuns[key]) return;
    const result = await verifyBackups(vm.chainIds);
    if (!result.ok) {
      toast.error(t("backupsTab.verify.toast.failedToStart"), { description: result.message });
      return;
    }
    toast.info(t("backupsTab.verify.toast.started", { vm: vm.name }), {
      description: t("backupsTab.verify.toast.startedDesc", { count: vm.points.length }),
    });
    setVerifyRuns((prev) => ({
      ...prev,
      [key]: { vmName: vm.name, sessionIds: result.sessionIds, startedAt: Date.now() },
    }));
  };

  /* Follow the runs started above through the session feed and report each one
   * once it settles. Reading the outcome off the sessions rather than off the
   * start call is the only honest option: the appliance verifies asynchronously,
   * so the call itself knows nothing about what the check found. */
  useEffect(() => {
    const keys = Object.keys(verifyRuns);
    if (keys.length === 0) return;
    const settled: string[] = [];
    for (const key of keys) {
      const run = verifyRuns[key];
      const found = run.sessionIds
        .map((id) => sessions.find((s) => s.id === id))
        .filter((s): s is Session => s !== undefined);
      const visible = found.length === run.sessionIds.length;
      if (!visible || found.some((s) => s.status === "running" || s.status === "queued")) {
        // Give up quietly once the feed has clearly not caught up: the runs are
        // still real and still in Activity, this row just stops claiming to
        // know about them.
        if (Date.now() - run.startedAt > VERIFY_FEED_GRACE_MS) settled.push(key);
        continue;
      }
      settled.push(key);
      const failed = found.filter((s) => s.status === "failed").length;
      const warned = found.filter((s) => s.status === "warning").length;
      if (failed > 0) {
        toast.error(t("backupsTab.verify.toast.invalid", { vm: run.vmName }), {
          description: found.find((s) => s.status === "failed")?.message,
        });
      } else if (warned > 0) {
        toast.warning(t("backupsTab.verify.toast.warnings", { vm: run.vmName }), {
          description: found.find((s) => s.status === "warning")?.message,
        });
      } else {
        toast.success(t("backupsTab.verify.toast.valid", { vm: run.vmName }));
      }
    }
    if (settled.length === 0) return;
    setVerifyRuns((prev) => {
      const next = { ...prev };
      for (const key of settled) delete next[key];
      return next;
    });
  }, [sessions, verifyRuns, t]);

  /** VM ids under a given job with a verification in flight. */
  const verifyingVmIdsFor = (jobId: string) =>
    new Set(
      Object.keys(verifyRuns)
        .filter((key) => key.startsWith(`${jobId}:`))
        .map((key) => key.slice(jobId.length + 1)),
    );

  const totalPoints = groups.reduce((a, g) => a + g.points.length, 0);
  const totalStored = groups.reduce((a, g) => a + g.storedGB, 0);
  // Only the points whose real size the appliance knows contribute here, so
  // the pair below always compares like with like.
  const measuredPoints = groups.flatMap((g) => g.points).filter((p) => p.logicalGB != null);
  const totalLogical = measuredPoints.reduce((a, p) => a + (p.logicalGB as number), 0);
  const totalLogicalStored = measuredPoints.reduce((a, p) => a + p.sizeGB, 0);
  const totalRatio = compressionRatioLabel(
    totalLogical > 0 ? totalLogicalStored / totalLogical : null,
  );
  const totalVms = groups.reduce((a, g) => a + g.vms.length, 0);

  const handleRestoreVm = (vm: RestorePointJobVmGroup) => navigate(restoreLink(vm.vmId));

  /* Opens the wizard on the point the operator actually clicked instead of
   * substituting the newest one. */
  const handleRestorePoint = (vm: RestorePointJobVmGroup, point: RestorePoint) =>
    navigate(restoreLink(vm.vmId, point.id));

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={History}
          title={t("backupsTab.emptyTitle")}
          description={t("backupsTab.emptyDescription")}
          compact
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary KPIs — the same band the sibling "Backup jobs" tab uses, so the
          two tabs share one top-of-page structure instead of two shapes. */}
      <KpiBand className="sm:grid-cols-3 xl:grid-cols-3">
        <KpiCard
          icon={History}
          label={t("backupsTab.kpi.points")}
          value={totalPoints}
          hint={t("backupsTab.kpi.acrossObjects", { jobs: groups.length, vms: totalVms })}
        />
        {/* Sizes come from the catalog, which has none until a backup has run. A
            hard 0 B would read as "these backups are empty" rather than "not
            measured", so the card says so and stays toneless. The headline is
            what the points OCCUPY; the real data behind it rides the hint. */}
        <KpiCard
          icon={Database}
          label={t("backupsTab.kpi.stored")}
          value={totalStored > 0 ? totalStored : t("common:generic.na")}
          format={(n) => formatStorage(n)}
          tone={totalStored > 0 ? "neutral" : "muted"}
          hint={
            totalLogical > 0
              ? totalRatio
                ? t("backupsTab.kpi.fromLogical", {
                    size: formatStorage(totalLogical),
                    ratio: totalRatio,
                  })
                : t("backupsTab.kpi.fromLogicalNoRatio", { size: formatStorage(totalLogical) })
              : t("backupsTab.kpi.sizeUnrecorded")
          }
        />
        <KpiCard
          icon={AlertTriangle}
          tone={orphanCount > 0 ? "warning" : "neutral"}
          label={t("backupsTab.orphaned")}
          value={orphanCount}
          hint={t("backupsTab.noActiveJob")}
        />
      </KpiBand>

      <Card>
        {orphanCount > 0 && (
          <p className="flex items-start gap-2 border-t border-border px-4 py-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>
              <Trans
                i18nKey="backupsTab.orphanedNote"
                ns="jobs"
                components={{ 1: <span className="font-medium text-foreground" /> }}
              />
            </span>
          </p>
        )}
      </Card>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("backupsTab.searchPlaceholder")}
            className="pl-9"
            aria-label={t("backupsTab.searchLabel")}
          />
        </div>
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as ScopeFilter)}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t("backupsTab.filterByJobStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("backupsTab.allBackups")}</SelectItem>
            <SelectItem value="orphaned">
              {t("backupsTab.orphaned")}
              {orphanCount > 0 ? ` (${orphanCount})` : ""}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={repoFilter} onValueChange={setRepoFilter}>
          <SelectTrigger className="w-full sm:w-52" aria-label={t("backupsTab.filterByRepository")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("backupsTab.allRepositories")}</SelectItem>
            {repositories.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t("backupsTab.sortLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">
              <span className="flex items-center gap-2">
                <ArrowDown className="h-3.5 w-3.5" />
                {t("backupsTab.newestFirst")}
              </span>
            </SelectItem>
            <SelectItem value="asc">
              <span className="flex items-center gap-2">
                <ArrowUp className="h-3.5 w-3.5" />
                {t("backupsTab.oldestFirst")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title={t("backupsTab.noMatchTitle")}
            description={t("backupsTab.noMatchDescription")}
            compact
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => (
            <BackupJobRow
              key={group.jobId}
              group={group}
              job={jobById.get(group.jobId)}
              isOpen={expandedJobs.has(group.jobId)}
              onToggle={() => toggleJob(group.jobId)}
              openVmIds={
                new Set(
                  [...expandedVms]
                    .filter((k) => k.startsWith(`${group.jobId}:`))
                    .map((k) => k.slice(group.jobId.length + 1)),
                )
              }
              onToggleVm={(vmId) => toggleVm(group.jobId, vmId)}
              sortDir={sortDir}
              offlineRepoIds={offlineRepoIds}
              verifyingVmIds={verifyingVmIdsFor(group.jobId)}
              onVerifyVm={(vm) => void handleVerifyVm(group.jobId, vm)}
              onRestoreVm={handleRestoreVm}
              onRestorePoint={handleRestorePoint}
              onDeleteVm={(vm) => setDeleteTarget({ jobName: group.jobName, vm })}
            />
          ))}
        </div>
      )}

      <DeleteJobVmBackupsDialog
        target={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      />
    </div>
  );
}
