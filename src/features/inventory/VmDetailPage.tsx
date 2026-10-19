// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  ChevronRight,
  Cloud,
  Cluster,
  Cpu,
  HardDrive,
  History,
  MapPin,
  MemoryStick,
  Layers,
  Menu,
  Network,
  Play,
  RotateCcw,
  Server,
  ServerOff,
  Shield,
  Tower,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill, StatusDot } from "@/components/StatusPill";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatStorage, formatDuration } from "@/lib/format";
import { TimeStamp } from "@/components/TimeStamp";
import { selfContainedNote } from "@/lib/restore-points";
import { syntheticFullJobsForVm } from "@/lib/synthetic-full";
import { SESSION_META, toneFg } from "@/lib/status";
import { useWorldStore } from "@/store/world";
import { accentColor, jobTypeMeta, scheduleLabel } from "@/features/jobs/lib";
import { vmLocation } from "./topology";
import { restoreLink } from "@/features/restore/link";
import type { RestorePoint } from "@/types";
import { PowerDot } from "./components/PowerDot";
import { SpecRow } from "./components/SpecRow";
import { HyperVConfigCard } from "./components/HyperVConfigCard";
import { ProtectionSummaryCard } from "./components/ProtectionSummaryCard";
import { DeleteRestorePointDialog } from "./components/DeleteRestorePointDialog";
import { SyntheticFullDialog } from "./components/SyntheticFullDialog";
import { RestorePointItem } from "./components/RestorePointItem";
import { RestorePointCalendar } from "./components/RestorePointCalendar";
import { POWER_META, osFamilyLabel } from "./components/vm-presentation";
import { useCan } from "@/store/permissions";

/** Where the operator came from, carried in react-router's location state.
 *  It travels with the navigation and leaves the URL untouched, so a deep link
 *  or a pasted address still resolves to the plain Inventory breadcrumb. Only
 *  the id is carried: the job's name is read live below, so a renamed job never
 *  shows a stale label and a deleted one degrades instead of lying. */
export interface VmDetailOrigin {
  /** The job whose Objects tab this VM was opened from. */
  fromJobId?: string;
}

export default function VmDetailPage() {
  const { t } = useTranslation("inventory");
  const { vmId } = useParams();
  const navigate = useNavigate();
  const origin = useLocation().state as VmDetailOrigin | null;
  const [pointToDelete, setPointToDelete] = useState<RestorePoint | null>(null);
  const [rpView, setRpView] = useState<"list" | "calendar">("list");
  const [syntheticFullOpen, setSyntheticFullOpen] = useState(false);

  const vm = useWorldStore((s) => s.vms.find((v) => v.id === vmId));
  const environments = useWorldStore((s) => s.environments);
  const hosts = useWorldStore((s) => s.hosts);
  const jobs = useWorldStore((s) => s.jobs);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const repositories = useWorldStore((s) => s.repositories);
  const sessions = useWorldStore((s) => s.sessions);
  const runJob = useWorldStore((s) => s.runJob);
  const canRestore = useCan("restore.start");
  const canStartJob = useCan("job.start");
  const canCreateJob = useCan("job.create");

  /** Repositories whose backing storage is currently unreachable — their restore
   *  points still exist but can't be read (or safely deleted) until they return. */
  const offlineRepoIds = useMemo(
    () => new Set(repositories.filter((r) => r.status === "offline").map((r) => r.id)),
    [repositories],
  );

  const coveringJobs = useMemo(
    () => (vm ? jobs.filter((j) => j.vmIds.includes(vm.id)) : []),
    [jobs, vm],
  );

  const points = useMemo(
    () =>
      vm
        ? restorePoints
            .filter((rp) => rp.vmId === vm.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [restorePoints, vm],
  );

  const recentSessions = useMemo(() => {
    if (!vm) return [];
    return sessions
      .filter((s) => s.vmResults.some((r) => r.vmId === vm.id))
      .slice(0, 6);
  }, [sessions, vm]);

  /* A synthetic full needs a stored chain to merge, so the action only appears
   * once this VM actually has one — offering it on a VM with nothing to merge
   * would be a button whose only outcome is a refusal. Whether that chain can
   * be merged *today* is the dialog's job to say, with the reason.
   * Above the `!vm` bail-out with the other memos: hooks have to run in the
   * same order on every render, including the one where the VM is gone. */
  const canOfferSyntheticFull = useMemo(
    () => (vm ? syntheticFullJobsForVm(vm.id, { jobs, restorePoints, repositories, sessions }).length > 0 : false),
    [vm, jobs, restorePoints, repositories, sessions],
  );

  if (!vm) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Server}
          title={t("vmDetail.notFoundTitle")}
          description={t("vmDetail.notFoundDesc")}
          action={
            <Button variant="outline" asChild>
              <Link to="/inventory">{t("detail.backToInventory")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const env = environments.find((e) => e.id === vm.environmentId);
  const host = hosts.find((h) => h.id === vm.hostId);
  const location = vmLocation(vm, hosts, environments);
  const powerMeta = POWER_META[vm.powerState];
  const primaryJob = coveringJobs[0];
  const isRunning = primaryJob?.state === "running";
  // Arriving from a job's Objects tab is a one-way trip unless the header says
  // so: the URL is the same /inventory/:vmId either way, so the origin job is
  // resolved from navigation state and named live. Gone job, no state, or a
  // reloaded deep link all fall back to the Inventory breadcrumb.
  const originJob = origin?.fromJobId ? jobs.find((j) => j.id === origin.fromJobId) : undefined;
  const unreachableCount = points.filter((p) => offlineRepoIds.has(p.repositoryId)).length;


  const onBackUpNow = async () => {
    if (!primaryJob) {
      navigate(`/jobs/new/backup?vm=${vm.id}`);
      return;
    }
    const id = await runJob(primaryJob.id);
    if (id) {
      toast.success(t("vmDetail.backupToast", { name: vm.name }), {
        description: t("vmDetail.backupToastDesc", { job: primaryJob.name }),
      });
    } else {
      toast.info(t("vmDetail.alreadyRunning", { job: primaryJob.name }), {
        description: t("vmDetail.alreadyRunningDesc"),
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        backTo={
          originJob
            ? {
                href: `/jobs/${originJob.id}`,
                label: t("jobs:notFound.backTo", { section: originJob.name }),
              }
            : { href: "/inventory", label: t("page.title") }
        }
        title={
          <span className="flex items-center gap-2.5">
            <PowerDot state={vm.powerState} />
            {vm.name}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-1.5">
            {vm.guestOs}
            <span className="text-muted-foreground/40">·</span>
            {env?.name ?? vm.environmentId}
            <span className="text-muted-foreground/40">·</span>
            {host?.name ?? vm.hostId}
          </span>
        }
        actions={
          <>
            {vm.protection !== "unprotected" && canRestore && (
              <Button variant="outline" asChild>
                <Link to={restoreLink(vm.id)}>
                  <RotateCcw className="h-4 w-4" />
                  {t("actions.restore")}
                </Link>
              </Button>
            )}
            {primaryJob ? (
              canStartJob && (
                <Button onClick={onBackUpNow} disabled={isRunning}>
                  <Play className="h-4 w-4" />
                  {isRunning ? t("actions.running") : t("actions.backUpNow")}
                </Button>
              )
            ) : (
              canCreateJob && (
                <Button asChild>
                  <Link to={`/jobs/new/backup?vm=${vm.id}`}>
                    <Shield className="h-4 w-4" />
                    {t("actions.protect")}
                  </Link>
                </Button>
              )
            )}
          </>
        }
      />

      {/* Where this VM lives — platform › datacenter › cluster › host */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border border-border bg-card px-3 py-2 ">
        <span className="label-overline mr-1">
          {t("vmDetail.location")}
        </span>
        {[
          { icon: Cloud, label: location.platform },
          { icon: MapPin, label: location.datacenter },
          { icon: Cluster, label: location.cluster },
          { icon: Tower, label: location.host, strong: true },
        ].map((seg, i) => {
          const Icon = seg.icon;
          return (
            <Fragment key={seg.label + i}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs",
                  seg.strong ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {seg.label}
              </span>
            </Fragment>
          );
        })}
        {/* Inventory has no Topology tab any more — the estate navigator on the
            Inventory page is where this location breadcrumb continues, so the
            link names that instead of a view that no longer exists. */}
        <Link
          to="/inventory"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {t("vmDetail.topology")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ProtectionSummaryCard vm={vm} unreachableCount={unreachableCount} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          {/* Specs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4 text-muted-foreground" />
                {t("vmDetail.specs")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y divide-border/60">
                <SpecRow label={t("vmDetail.powerState")}>
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={powerMeta.tone === "muted" ? "muted-foreground" : powerMeta.tone} />
                    {powerMeta.label}
                  </span>
                </SpecRow>
                <SpecRow label={t("vmDetail.vcpus")}>
                  <span className="inline-flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="nums">{vm.vcpus}</span>
                  </span>
                </SpecRow>
                <SpecRow label={t("vmDetail.memory")}>
                  <span className="inline-flex items-center gap-1.5">
                    <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="nums">{vm.memoryGB} GB</span>
                  </span>
                </SpecRow>
                <SpecRow label={t("vmDetail.provisioned")}>
                  <span className="nums">{formatStorage(vm.provisionedGB, 0)}</span>
                </SpecRow>
                <SpecRow label={t("vmDetail.used")}>
                  <span className="inline-flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="nums">{formatStorage(vm.usedGB, 0)}</span>
                  </span>
                </SpecRow>
                <SpecRow label={t("vmDetail.ipAddress")}>
                  <span className="inline-flex items-center gap-1.5">
                    <Network className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="nums">{vm.ipAddress}</span>
                  </span>
                </SpecRow>
                <SpecRow label={t("vmDetail.guestOs")}>{osFamilyLabel(vm.osFamily)}</SpecRow>
              </div>
            </CardContent>
          </Card>
          {vm.hyperv && <HyperVConfigCard details={vm.hyperv} />}
        </div>

        {/* Jobs + restore points */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          {/* Jobs covering this VM */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-muted-foreground" />
                {t("vmDetail.jobsCovering")}
              </CardTitle>
              <Badge variant="outline" className="font-normal">
                {coveringJobs.length}
              </Badge>
            </CardHeader>
            <CardContent className="pt-0">
              {coveringJobs.length === 0 ? (
                <div className="flex flex-col items-start gap-3 border border-dashed border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t("vmDetail.noJob")}
                  </p>
                  {canCreateJob && (
                    <Button size="sm" asChild>
                      <Link to={`/jobs/new/backup?vm=${vm.id}`}>
                        <Shield className="h-3.5 w-3.5" />
                        {t("actions.protect")}
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {coveringJobs.map((job) => {
                    const meta = job.lastStatus ? SESSION_META[job.lastStatus] : null;
                    const { icon: TypeIcon, label: typeLabel } = jobTypeMeta(job.type);
                    return (
                      <Link
                        key={job.id}
                        to={`/jobs/${job.id}`}
                        className="group flex items-center gap-3 border border-border p-3 transition-colors hover:border-border hover:bg-muted/40"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted"
                          style={{ color: accentColor(job.accent) }}
                        >
                          <TypeIcon className="h-4 w-4" aria-label={typeLabel} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{job.name}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {scheduleLabel(job.schedule)}
                            <span className="text-muted-foreground/40">·</span>
                            {job.scopeSummary}
                          </p>
                        </div>
                        {meta && <StatusPill meta={meta} size="sm" />}
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Restore points */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-muted-foreground" />
                {t("vmDetail.restorePoints")}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {points.length}
                </Badge>
                {points.length > 0 && <RpViewToggle view={rpView} onChange={setRpView} />}
                {/* Merging a chain belongs beside the chain it merges, not on
                    the Jobs page: this is where an operator is looking at the
                    incrementals that have piled up on a full. */}
                {canOfferSyntheticFull && canStartJob && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setSyntheticFullOpen(true)}
                    title={t("syntheticFull.actionTip")}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {t("syntheticFull.action")}
                  </Button>
                )}
                {vm.protection !== "unprotected" && canRestore && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={restoreLink(vm.id)}>
                      {t("actions.restore")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {points.length === 0 ? (
                <EmptyState
                  icon={History}
                  title={t("detail.noPointsTitle")}
                  description={t("vmDetail.noPointsDesc")}
                  compact
                />
              ) : (
                <>
                  {unreachableCount > 0 && (
                    <div className="mb-2.5 flex items-start gap-2.5 border border-warning/30 bg-warning/10 px-3 py-2.5">
                      <ServerOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div className="min-w-0 text-xs leading-relaxed">
                        <p className="font-medium text-foreground">
                          {t("detail.unreachableTitle", { unreachable: unreachableCount, count: points.length })}
                        </p>
                        <p className="text-muted-foreground">
                          {t("detail.unreachableBody")}
                        </p>
                      </div>
                    </div>
                  )}
                  {rpView === "calendar" ? (
                    <RestorePointCalendar
                      points={points}
                      offlineRepoIds={offlineRepoIds}
                      onRestore={(rp) => navigate(restoreLink(vm.id, rp.id))}
                      onDelete={(rp) => setPointToDelete(rp)}
                    />
                  ) : (
                    <>
                      <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
                        {selfContainedNote()}
                      </p>
                      <ul className="divide-y divide-border/60">
                        {points.map((rp) => (
                          <RestorePointItem
                            key={rp.id}
                            point={rp}
                            unavailable={offlineRepoIds.has(rp.repositoryId)}
                            onRestore={() => navigate(restoreLink(vm.id, rp.id))}
                            onDelete={() => setPointToDelete(rp)}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <DeleteRestorePointDialog
            point={pointToDelete}
            open={pointToDelete !== null}
            onOpenChange={(o) => !o && setPointToDelete(null)}
          />

          <SyntheticFullDialog vm={vm} open={syntheticFullOpen} onOpenChange={setSyntheticFullOpen} />

          {/* Recent activity */}
          {recentSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-muted-foreground" />
                  {t("vmDetail.recentActivity")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-0.5">
                  {recentSessions.map((s) => {
                    const meta = SESSION_META[s.status];
                    const Icon = meta.icon;
                    return (
                      <Link
                        key={s.id}
                        to={`/jobs/${s.jobId}`}
                        className="flex items-center gap-3 px-2 py-2 transition-colors hover:bg-muted/50"
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            toneFg(meta.tone),
                            meta.tone === "info" && "animate-spin",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{s.jobName}</span>
                        <span className="nums hidden shrink-0 text-xs text-muted-foreground sm:block">
                          {formatDuration(s.durationSec)}
                        </span>
                        <TimeStamp
                          value={s.finishedAt ?? s.startedAt}
                          size="xs"
                          align="right"
                          className="shrink-0"
                        />
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** Segmented List / Calendar switch for the restore-points card. */
function RpViewToggle({
  view,
  onChange,
}: {
  view: "list" | "calendar";
  onChange: (v: "list" | "calendar") => void;
}) {
  const { t } = useTranslation("inventory");
  const options: { value: "list" | "calendar"; label: string; icon: typeof Menu }[] = [
    { value: "list", label: t("rpToggle.list"), icon: Menu },
    { value: "calendar", label: t("rpToggle.calendar"), icon: CalendarDays },
  ];
  return (
    <div className="inline-flex items-center bg-muted/60 p-0.5" role="group" aria-label={t("rpToggle.aria")}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = view === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium transition-colors duration-250",
              active ? "border-border bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
