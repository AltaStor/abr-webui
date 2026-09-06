// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  Activity,
  CalendarClock,
  Layers,
  Loader2,
  Play,
  Power,
  Plus,
  Search,
  Trash2,
  X,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { TimeStamp } from "@/components/TimeStamp";
import { KpiBand } from "@/components/KpiBand";
import { KpiCard } from "@/components/KpiCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatCountdown, formatDateTime, formatDuration, formatFullDateTime, formatRelative } from "@/lib/format";
import { JOB_DISABLED_META, lastRunMeta } from "@/lib/status";
import { JobDisabledMark } from "./components/JobDisabledMark";
import { apiErrorMessage } from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import type { BackupJob, Repository, Session } from "@/types";
import { DatabaseBackup } from "@/lib/icons";
import { accentColor, jobTypeMeta, scheduleLabel } from "./lib";
import { JobActionsMenu } from "./components/JobActionsMenu";
import { DeleteJobDialog } from "./components/DeleteJobDialog";
import { BackupsTab } from "./components/BackupsTab";

type TabValue = "jobs" | "backups";

type StatusFilter = "all" | "running" | "healthy" | "warning" | "disabled";

const STATUS_FILTERS: { value: StatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "filters.status.all" },
  { value: "running", labelKey: "filters.status.running" },
  { value: "healthy", labelKey: "filters.status.healthy" },
  { value: "warning", labelKey: "filters.status.warning" },
  { value: "disabled", labelKey: "filters.status.disabled" },
];

function matchesStatus(job: BackupJob, filter: StatusFilter): boolean {
  switch (filter) {
    case "running":
      return job.state === "running";
    case "disabled":
      return job.state === "disabled";
    case "warning":
      return job.state !== "disabled" && (job.lastStatus === "warning" || job.lastStatus === "failed");
    case "healthy":
      return job.state !== "disabled" && job.lastStatus === "success";
    default:
      return true;
  }
}

export default function JobsPage() {
  const { t } = useTranslation("jobs");
  const navigate = useNavigate();
  const allJobs = useWorldStore((s) => s.jobs);
  // This page is the home for BACKUP jobs; replication jobs live on the
  // Replication page (which lists and links them). Keep the two apart.
  const jobs = useMemo(() => allJobs.filter((j) => j.type !== "replication"), [allJobs]);
  const repositories = useWorldStore((s) => s.repositories);
  const environments = useWorldStore((s) => s.environments);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const sessions = useWorldStore((s) => s.sessions);
  const runJob = useWorldStore((s) => s.runJob);
  const setJobEnabled = useWorldStore((s) => s.setJobEnabled);
  const deleteJob = useWorldStore((s) => s.deleteJob);

  // Two views on one page: the schedules ("Backup jobs") and the stored restore
  // points independent of any job ("Backups", formerly its own /backups page).
  // The tab lives in the URL so it survives reloads and is deep-linkable.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabValue = searchParams.get("tab") === "backups" ? "backups" : "jobs";
  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "jobs") next.delete("tab");
    else next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [deleteTarget, setDeleteTarget] = useState<BackupJob | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const repoById = useMemo(() => {
    const map = new Map<string, Repository>();
    for (const r of repositories) map.set(r.id, r);
    return map;
  }, [repositories]);

  // A backup job needs somewhere to read from and somewhere to write to —
  // gate the create action rather than let the wizard open onto a dead end
  // (no VMs to select, no repository to store into).
  const noEnvironments = environments.length === 0;
  const noRepositories = repositories.length === 0;
  const addJobBlockedReason =
    noEnvironments && noRepositories
      ? t("page.addJobNeedsBoth")
      : noEnvironments
        ? t("page.addJobNeedsEnv")
        : noRepositories
          ? t("page.addJobNeedsRepo")
          : null;

  /* The "Last run" column shows an absolute start → end, but `job.lastRunAt` is
   * `finishedAt ?? startedAt` of the NEWEST session — so it is the run's end only
   * while nothing is in flight. With a run in flight it is that run's START, and
   * the newest *finished* session belongs to the run before it. Pairing the two
   * would print one run's start next to another run's start under
   * "Started/Finished", so the two are indexed separately and the cell picks one
   * or the other, never both. One map each, built once — never a per-row filter
   * over the whole list. */
  const lastRunByJob = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of sessions) {
      if (!s.finishedAt) continue;
      const prev = map.get(s.jobId);
      if (!prev || s.startedAt.localeCompare(prev.startedAt) > 0) map.set(s.jobId, s);
    }
    return map;
  }, [sessions]);

  /* Unfinished sessions — the run that is happening right now. */
  const runningByJob = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of sessions) {
      if (s.finishedAt) continue;
      const prev = map.get(s.jobId);
      if (!prev || s.startedAt.localeCompare(prev.startedAt) > 0) map.set(s.jobId, s);
    }
    return map;
  }, [sessions]);

  const filtered = useMemo(() => jobs.filter((j) => matchesStatus(j, statusFilter)), [jobs, statusFilter]);

  /* ----------------------------- summary strip ---------------------------- */
  const runningCount = jobs.filter((j) => j.state === "running").length;
  const activeJobs = jobs.filter((j) => j.state !== "disabled");
  const nextRunAt = jobs
    .filter((j) => j.nextRunAt)
    .map((j) => new Date(j.nextRunAt as string).getTime())
    .sort((a, b) => a - b)[0];

  /* ------------------------------- actions ------------------------------- */
  const handleRun = async (job: BackupJob, forceFull = false) => {
    const sessionId = await runJob(job.id, undefined, forceFull);
    if (sessionId) {
      toast.success(t("toast.started", { name: job.name }), {
        description: forceFull ? t("toast.startedFullDesc") : t("toast.startedDesc"),
        action: { label: t("toast.watch"), onClick: () => navigate(`/jobs/${job.id}`) },
      });
    } else {
      toast.info(
        job.state === "disabled" ? t("toast.jobDisabled", { name: job.name }) : t("toast.jobAlreadyRunning", { name: job.name }),
        { description: job.state === "disabled" ? t("toast.enableToRun") : t("toast.letFinish") },
      );
    }
  };

  const handleToggle = async (job: BackupJob, enabled: boolean) => {
    try {
      await setJobEnabled(job.id, enabled);
      toast.success(enabled ? t("toast.enabled", { name: job.name }) : t("toast.disabled", { name: job.name }), {
        description: enabled ? t("toast.enabledDesc") : t("toast.disabledDesc"),
      });
    } catch (err) {
      toast.error(enabled ? t("toast.enableFailed", { name: job.name }) : t("toast.disableFailed", { name: job.name }), {
        description: apiErrorMessage(err) ?? t("toast.enableDisableFailedDesc"),
      });
    }
  };

  const handleDelete = async (job: BackupJob) => {
    try {
      await deleteJob(job.id);
      toast.success(t("toast.deleted", { name: job.name }), { description: t("toast.pointsSafe") });
    } catch {
      toast.error(t("toast.deleteFailed", { name: job.name }), { description: t("toast.deleteFailedDesc") });
    }
  };

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const selectedJobs = jobs.filter((j) => selectedIds.includes(j.id));

  const bulkRun = async () => {
    let started = 0;
    for (const job of selectedJobs) if (await runJob(job.id)) started += 1;
    toast.success(t("toast.bulkStarted", { count: started }), {
      description: started < selectedJobs.length ? t("toast.bulkStartedSome") : t("toast.bulkStartedAll"),
    });
    setRowSelection({});
  };
  // Disable acts on the selection as a whole or not at all: an already-disabled
  // job in the selection blocks the action (the bulk bar greys it out and names
  // the reason) rather than being silently skipped, so the toast can never
  // report a count that doesn't match what the user selected.
  const alreadyDisabled = selectedJobs.filter((j) => j.state === "disabled");
  const disableBlocked = alreadyDisabled.length > 0;
  const bulkDisable = async () => {
    if (disableBlocked || selectedJobs.length === 0) return;
    const results = await Promise.allSettled(selectedJobs.map((job) => setJobEnabled(job.id, false)));
    const disabled = results.filter((r) => r.status === "fulfilled").length;
    if (disabled === selectedJobs.length) {
      toast.success(t("toast.bulkDisabled", { count: disabled }));
    } else {
      toast.warning(t("toast.bulkDisabledPartial", { disabled, total: selectedJobs.length }), {
        description: t("toast.bulkDisabledPartialDesc"),
      });
    }
    setRowSelection({});
  };
  const bulkDelete = async () => {
    const results = await Promise.allSettled(selectedJobs.map((job) => deleteJob(job.id)));
    const deleted = results.filter((r) => r.status === "fulfilled").length;
    if (deleted === selectedJobs.length) {
      toast.success(t("toast.bulkDeleted", { count: deleted }), {
        description: t("toast.pointsSafe"),
      });
    } else {
      toast.warning(t("toast.bulkDeletedPartial", { deleted, total: selectedJobs.length }), {
        description: t("toast.bulkDeletedPartialDesc"),
      });
    }
    setRowSelection({});
  };

  /* ------------------------------- columns ------------------------------- */
  const columns = useMemo<ColumnDef<BackupJob, unknown>[]>(() => {
    const cols: ColumnDef<BackupJob, unknown>[] = [
      {
        id: "select",
        size: 36,
        enableSorting: false,
        header: ({ table }) => (
          <span onClick={(e) => e.stopPropagation()} className="flex">
            <Checkbox
              checked={
                table.getIsAllRowsSelected()
                  ? true
                  : table.getIsSomeRowsSelected()
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
              aria-label={t("table.selectAll")}
            />
          </span>
        ),
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()} className="flex">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(!!v)}
              aria-label={t("table.selectRow", { name: row.original.name })}
            />
          </span>
        ),
      },
      {
        id: "name",
        header: t("table.job"),
        meta: { tooltip: t("table.jobHint") },
        /* The chip has to be searchable too, or filtering the table hides the very
         * rows the reader was looking for. */
        accessorFn: (j) => `${j.name} ${j.scopeSummary}${j.state === "disabled" ? ` ${JOB_DISABLED_META.label}` : ""}`,
        cell: ({ row }) => {
          const job = row.original;
          const { icon: TypeIcon, label } = jobTypeMeta(job.type);
          /* Enablement rides with the job's identity, not with its last result —
             that column is about the run, and only the run. It reads as the whole
             row going quiet (see `rowClassName`), so the accent drops out here
             too; the mark beside the name is what survives greyscale. */
          const off = job.state === "disabled";
          return (
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center bg-muted/60"
                title={label}
              >
                <TypeIcon
                  className={cn("h-3.5 w-3.5", off && "text-muted-foreground")}
                  style={off ? undefined : { color: accentColor(job.accent) }}
                  aria-label={label}
                />
              </span>
              <div className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{job.name}</span>
                  {/* Icon alone: the Schedule column already prints the word for these rows. */}
                  {off && <JobDisabledMark showLabel={false} />}
                </span>
                <p className="truncate text-xs text-muted-foreground">{job.scopeSummary}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        header: t("table.lastRunStatus"),
        meta: { tooltip: t("table.lastRunStatusHint") },
        /* Outcome only — disabling a job must not rewrite the history of its runs,
         * for the sort key any more than for the pill. */
        accessorFn: (j) => j.lastStatus ?? "",
        cell: ({ row }) => <StatusPill meta={lastRunMeta(row.original.lastStatus)} size="sm" />,
      },
      {
        id: "schedule",
        header: t("table.schedule"),
        meta: { tooltip: t("table.scheduleHint") },
        accessorFn: (j) => scheduleLabel(j.schedule, j.state === "disabled"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {scheduleLabel(row.original.schedule, row.original.state === "disabled")}
          </span>
        ),
      },
      {
        id: "lastRun",
        header: t("table.lastRun"),
        meta: { tooltip: t("table.lastRunHint") },
        accessorFn: (j) => (j.lastRunAt ? new Date(j.lastRunAt).getTime() : 0),
        cell: ({ row }) => {
          const job = row.original;
          if (!job.lastRunAt) {
            return <span className="nums text-sm text-muted-foreground">{formatRelative(null)}</span>;
          }
          // A run in flight has no finish time, and `job.lastRunAt` is then its
          // own start — so there is no honest pair to print. Say when it started
          // and leave it at that; its progress is already on the status pill.
          const running = runningByJob.get(job.id);
          if (running || job.lastStatus === "running") {
            const startedAt = running?.startedAt ?? job.lastRunAt;
            return (
              <div className="min-w-0">
                <span className="nums block text-sm text-muted-foreground">{formatRelative(startedAt)}</span>
                <Hint
                  label={
                    <span className="block space-y-0.5">
                      <span className="block">{t("table.lastRunStarted", { value: formatFullDateTime(startedAt) })}</span>
                      <span className="block">{t("table.lastRunInProgress")}</span>
                    </span>
                  }
                >
                  <span
                    tabIndex={0}
                    className="nums block whitespace-nowrap text-[11px] text-muted-foreground"
                  >
                    {t("table.lastRunRunningSince", { value: formatDateTime(startedAt) })}
                  </span>
                </Hint>
              </div>
            );
          }
          // A job can have `lastRunAt` without a session in the store — the
          // appliance caps its session history — so the start falls back to the
          // dash `formatDateTime` already renders for a missing timestamp.
          const session = lastRunByJob.get(job.id);
          return (
            <div className="min-w-0">
              <span className="nums block text-sm text-muted-foreground">{formatRelative(job.lastRunAt)}</span>
              <Hint
                label={
                  <span className="block space-y-0.5">
                    <span className="block">{t("table.lastRunStarted", { value: formatFullDateTime(session?.startedAt) })}</span>
                    <span className="block">{t("table.lastRunFinished", { value: formatFullDateTime(job.lastRunAt) })}</span>
                    {session && (
                      <span className="block">{t("table.lastRunDuration", { value: formatDuration(session.durationSec) })}</span>
                    )}
                  </span>
                }
              >
                <span
                  tabIndex={0}
                  className="nums block whitespace-nowrap text-[11px] text-muted-foreground"
                >
                  {formatDateTime(session?.startedAt)} → {formatDateTime(job.lastRunAt)}
                </span>
              </Hint>
            </div>
          );
        },
      },
      {
        id: "nextRun",
        header: t("table.nextRun"),
        meta: { tooltip: t("table.nextRunHint") },
        accessorFn: (j) => (j.nextRunAt ? new Date(j.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER),
        // Relative answers "how soon"; the absolute answers "which slot" — the
        // pair the Last run column already prints, so a schedule reads the same
        // way in both directions.
        cell: ({ row }) => (
          <TimeStamp value={row.original.nextRunAt} fallback={t("common:generic.na")} />
        ),
      },
      {
        id: "objects",
        header: t("table.objects"),
        meta: { tooltip: t("table.objectsHint") },
        accessorFn: (j) => j.vmIds.length,
        cell: ({ row }) => (
          <span className="nums text-sm tabular-nums">{row.original.vmIds.length}</span>
        ),
      },
      {
        id: "repository",
        header: t("table.repository"),
        meta: { tooltip: t("table.repositoryHint") },
        enableSorting: false,
        accessorFn: (j) => repoById.get(j.repositoryId)?.name ?? "—",
        cell: ({ row }) => {
          const repo = repoById.get(row.original.repositoryId);
          return (
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm text-muted-foreground">{repo?.name ?? t("common:generic.na")}</span>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        size: 44,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <JobActionsMenu
              job={row.original}
              onRun={() => handleRun(row.original)}
              onRunFull={() => handleRun(row.original, true)}
              onEdit={() => navigate(`/jobs/${row.original.id}/edit`)}
              onToggleEnabled={(enabled) => handleToggle(row.original, enabled)}
              onDelete={() => setDeleteTarget(row.original)}
            />
          </div>
        ),
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoById, lastRunByJob, runningByJob, t]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          tab === "jobs" ? (
            <AddJobButton blockedReason={addJobBlockedReason} onClick={() => navigate("/jobs/new/backup")} />
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="jobs">
            {t("tabs.jobs")}
            <TabCount value={jobs.length} active={tab === "jobs"} />
          </TabsTrigger>
          <TabsTrigger value="backups">
            {t("tabs.backups")}
            <TabCount value={restorePoints.length} active={tab === "backups"} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
      {/* Summary strip */}
      <KpiBand className="sm:grid-cols-3 xl:grid-cols-3">
        <KpiCard
          icon={Layers}
          tone="neutral"
          label={t("stats.totalJobs")}
          value={jobs.length}
          hint={t("stats.activeCount", { count: activeJobs.length })}
        />
        <KpiCard
          icon={runningCount ? Loader2 : Activity}
          iconSpin={runningCount > 0}
          tone={runningCount ? "info" : "muted"}
          label={t("stats.runningNow")}
          value={runningCount}
          hint={runningCount ? t("stats.streamingLive") : t("stats.idle")}
        />
        <KpiCard
          icon={CalendarClock}
          tone={nextRunAt ? "neutral" : "muted"}
          label={t("stats.nextRun")}
          value={nextRunAt ? formatCountdown(new Date(nextRunAt).toISOString()) : t("common:generic.na")}
          hint={
            nextRunAt
              ? t("stats.scheduled", { abs: formatDateTime(new Date(nextRunAt).toISOString()) })
              : t("stats.nothingQueued")
          }
        />
      </KpiBand>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("toolbar.searchPlaceholder")}
            className="pl-9"
            aria-label={t("toolbar.searchLabel")}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t("toolbar.filterByStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {t(f.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 border border-primary/30 bg-primary/[0.06] px-3 py-2"
        >
          <span className="text-sm font-medium">
            {t("bulk.selected", { count: selectedIds.length })}
          </span>
          <span className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={bulkRun}>
            <Play className="h-3.5 w-3.5" />
            {t("bulk.run")}
          </Button>
          <BulkDisableButton
            blockedCount={alreadyDisabled.length}
            selectedCount={selectedIds.length}
            onClick={bulkDisable}
          />
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("common:actions.delete")}
          </Button>
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={t("bulk.clearSelection")} onClick={() => setRowSelection({})}>
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(j) => j.id}
        onRowClick={(j) => navigate(`/jobs/${j.id}`)}
        /* A switched-off job goes quiet across the whole row rather than wearing
           a chip in the name cell. Muted ink, not opacity: the row still has to
           clear AA, and its last run's outcome stays in full colour — disabling
           a job does not rewrite the history of its runs. */
        rowClassName={(j) => (j.state === "disabled" ? "text-muted-foreground" : undefined)}
        globalFilter={search}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        initialSorting={[{ id: "status", desc: false }]}
        pageSize={12}
        // `search` already resets the page through `globalFilter`; the status
        // chips filter `data` before the table sees it, so they need this.
        resetPageKey={statusFilter}
        emptyState={
          jobs.length === 0 ? (
            <EmptyState
              icon={DatabaseBackup}
              title={t("empty.noJobs.title")}
              description={t("empty.noJobs.description")}
              action={
                <AddJobButton
                  blockedReason={addJobBlockedReason}
                  onClick={() => navigate("/jobs/new/backup")}
                  label={t("empty.noJobs.action")}
                />
              }
            />
          ) : (
            <EmptyState
              icon={Search}
              title={t("empty.noMatch.title")}
              description={t("empty.noMatch.description")}
              compact
            />
          )
        }
      />
        </TabsContent>

        <TabsContent value="backups">
          <BackupsTab />
        </TabsContent>
      </Tabs>

      <DeleteJobDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        label={deleteTarget?.name ?? ""}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
      <DeleteJobDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        label=""
        count={selectedIds.length}
        onConfirm={bulkDelete}
      />
    </div>
  );
}

/* --------------------------- add job button ------------------------------ */
/** Gated behind having somewhere to read from (an environment) and write to
 *  (a repository) — otherwise the wizard opens onto a dead end. */
/* --------------------------- bulk disable -------------------------------- */
/** Disable is an all-or-nothing action on the selection: one already-disabled
 *  job in it greys the button out, because "Disable" would otherwise report a
 *  count covering jobs it never touched. The tooltip names the reason -- the
 *  whole selection already disabled, or only part of it -- so the way out
 *  (deselect those rows) is obvious. */
function BulkDisableButton({
  blockedCount,
  selectedCount,
  onClick,
}: {
  blockedCount: number;
  selectedCount: number;
  onClick: () => void;
}) {
  const { t } = useTranslation("jobs");
  const blocked = blockedCount > 0;
  const button = (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={blocked}>
      {/* Power, not Pause: Play/Pause is the transport pair, and bulkRun
          sits right beside this with Play. */}
      <Power className="h-3.5 w-3.5" />
      {t("common:actions.disable")}
    </Button>
  );

  // A disabled <button> has pointer-events: none, so the tooltip trigger goes
  // on a wrapping span — the same treatment AddJobButton below uses.
  if (!blocked) return button;
  const reason =
    blockedCount === selectedCount
      ? t("bulk.disableAllAlreadyDisabled", { count: selectedCount })
      : t("bulk.disableSomeAlreadyDisabled", { count: blockedCount, total: selectedCount });
  return (
    <Hint label={reason}>
      <span tabIndex={0} className="inline-flex cursor-not-allowed">
        {button}
      </span>
    </Hint>
  );
}

function AddJobButton({
  blockedReason,
  onClick,
  label,
}: {
  blockedReason: string | null;
  onClick: () => void;
  label?: string;
}) {
  const { t } = useTranslation("jobs");
  const button = (
    <Button onClick={onClick} disabled={!!blockedReason}>
      <Plus className="h-4 w-4" />
      {label ?? t("page.addJob")}
    </Button>
  );
  if (!blockedReason) return button;
  // A disabled <button> has pointer-events: none (see button.tsx), so it never
  // fires the hover/focus events the tooltip trigger listens for. Put the
  // trigger on a wrapping span instead — pointer/focus events over the button
  // pass through to it — so hovering a disabled Add job button still explains why.
  return (
    <Hint label={blockedReason}>
      <span tabIndex={0} className="inline-flex cursor-not-allowed">
        {button}
      </span>
    </Hint>
  );
}

/* ------------------------------ stat tile ------------------------------- */

/* --------------------------- tab count badge ---------------------------- */
function TabCount({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={cn(
        "nums ml-0.5 min-w-[1.25rem] px-1 py-0.5 text-[11px] font-semibold tabular-nums",
        active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}
