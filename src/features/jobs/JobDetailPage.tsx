// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Database,
  DatabaseBackup,
  Layers,
  Pause,
  Pencil,
  Play,
  Server,
  Trash2,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { SESSION_META, type Tone, toneChip } from "@/lib/status";
import { apiErrorMessage } from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import { REPO_TYPE_META } from "@/features/repositories/components/repoMeta";
import type { LucideIcon } from "@/lib/icons";
import { jobTypeMeta, retentionLabel, scheduleLabel } from "./lib";
import { ActiveRunPanel } from "./components/ActiveRunPanel";
import { LastRunSummary } from "./components/LastRunSummary";
import { ThroughputChart } from "./components/ThroughputChart";
import { RunHistoryTable } from "./components/RunHistoryTable";
import { JobObjectsTab } from "./components/JobObjectsTab";
import { JobSettingsTab } from "./components/JobSettingsTab";
import { DeleteJobDialog } from "./components/DeleteJobDialog";

export default function JobDetailPage() {
  const { t } = useTranslation("jobs");
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const job = useWorldStore((s) => s.jobs.find((j) => j.id === jobId));
  const sessions = useWorldStore((s) => s.sessions);
  const repositories = useWorldStore((s) => s.repositories);
  const runJob = useWorldStore((s) => s.runJob);
  const setJobEnabled = useWorldStore((s) => s.setJobEnabled);
  const deleteJob = useWorldStore((s) => s.deleteJob);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const jobSessions = useMemo(
    () =>
      job
        ? sessions
            .filter((s) => s.jobId === job.id)
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        : [],
    [sessions, job],
  );
  const activeSession = jobSessions.find((s) => s.status === "running");
  // The newest finished run — shown when nothing is live so the Overview never
  // goes blank the instant a run ends (the live panel used to just disappear).
  const lastFinished = jobSessions.find((s) => s.status !== "running");

  // Keep the big run panel up for a grace window AFTER a run finishes, showing
  // its terminal Success/Failed state — so a run visibly *completes* instead of
  // the panel vanishing the moment status flips. After the window it collapses
  // to the compact LastRunSummary.
  const [justFinishedId, setJustFinishedId] = useState<string | null>(null);
  const prevActiveId = useRef<string | null>(null);
  useEffect(() => {
    const id = activeSession?.id ?? null;
    if (prevActiveId.current && !id) {
      const finishedId = prevActiveId.current;
      setJustFinishedId(finishedId);
      const t = setTimeout(() => {
        setJustFinishedId((cur) => (cur === finishedId ? null : cur));
      }, 25_000);
      prevActiveId.current = id;
      return () => clearTimeout(t);
    }
    prevActiveId.current = id;
  }, [activeSession?.id]);
  const justFinished =
    !activeSession && justFinishedId
      ? jobSessions.find((s) => s.id === justFinishedId && s.status !== "running")
      : undefined;

  if (!job) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("notFound.title")} backTo={{ href: "/jobs", label: "Jobs" }} />
        <Card>
          <EmptyState
            icon={DatabaseBackup}
            title={t("notFound.heading")}
            description={t("notFound.description")}
            action={
              <Button onClick={() => navigate("/jobs")}>{t("notFound.backTo", { section: "Jobs" })}</Button>
            }
          />
        </Card>
      </div>
    );
  }

  const repository = repositories.find((r) => r.id === job.repositoryId);
  const disabled = job.state === "disabled";
  const running = job.state === "running";
  const { icon: TypeIcon, label: typeLabel } = jobTypeMeta(job.type);

  /* ------------------------------- actions ------------------------------- */
  const handleRun = async (forceFull = false) => {
    const sessionId = await runJob(job.id, undefined, forceFull);
    if (sessionId) {
      toast.success(t("toast.started", { name: job.name }), { description: t("toast.startedBelow") });
    } else {
      toast.info(disabled ? t("toast.jobDisabled", { name: job.name }) : t("toast.jobAlreadyRunning", { name: job.name }));
    }
  };
  const handleToggle = async () => {
    try {
      await setJobEnabled(job.id, disabled);
      toast.success(disabled ? t("toast.enabled", { name: job.name }) : t("toast.disabled", { name: job.name }));
    } catch (err) {
      toast.error(disabled ? t("toast.enableFailed", { name: job.name }) : t("toast.disableFailed", { name: job.name }), {
        description: apiErrorMessage(err) ?? t("toast.enableDisableFailedDesc"),
      });
    }
  };
  const handleDelete = async () => {
    try {
      await deleteJob(job.id);
      toast.success(t("toast.deleted", { name: job.name }), { description: t("toast.pointsSafe") });
      navigate("/jobs");
    } catch {
      toast.error(t("toast.deleteFailed", { name: job.name }), { description: t("toast.deleteFailedDesc") });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        backTo={{ href: "/jobs", label: "Jobs" }}
        title={job.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <TypeIcon className="h-3.5 w-3.5" />
              {typeLabel}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>{job.scopeSummary}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{scheduleLabel(job.schedule, disabled)}</span>
          </span>
        }
        actions={
          <>
            {job.type === "backup" ? (
              <div className="flex">
                <Button
                  variant="default"
                  onClick={() => handleRun()}
                  disabled={running}
                  className="rounded-r-none"
                >
                  <Play className="h-4 w-4" />
                  {t("actions.runNow")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      disabled={running}
                      aria-label={t("actions.runOptions")}
                      className="rounded-l-none border-l border-primary-foreground/20 px-2"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => handleRun(true)}>
                      <DatabaseBackup className="h-4 w-4" />
                      {t("actions.runFull")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button variant="default" onClick={() => handleRun()} disabled={running}>
                <Play className="h-4 w-4" />
                {t("actions.runNow")}
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(`/jobs/${job.id}/edit`)}>
              <Pencil className="h-4 w-4" />
              {t("common:actions.edit")}
            </Button>
            <Button variant="outline" onClick={handleToggle}>
              {disabled ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {disabled ? t("common:actions.enable") : t("common:actions.disable")}
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("actions.deleteJob")} className="text-danger hover:text-danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          icon={SESSION_META[job.lastStatus ?? "queued"].icon}
          tone={disabled ? "muted" : SESSION_META[job.lastStatus ?? "queued"].tone}
          label={t("detailStats.lastRun")}
          value={
            disabled ? (
              <StatusPill meta={{ label: t("status.disabled"), tone: "muted", icon: Pause }} size="sm" />
            ) : (
              <StatusPill meta={SESSION_META[job.lastStatus ?? "queued"]} size="sm" />
            )
          }
          hint={formatRelative(job.lastRunAt)}
        />
        <StatTile
          icon={CheckCircle2}
          tone={!job.lastRunAt ? "muted" : job.successRate >= 95 ? "success" : "warning"}
          label={t("detailStats.successRate")}
          value={<span className="nums">{job.lastRunAt ? `${job.successRate}%` : "—"}</span>}
          hint={t("detailStats.recentRuns")}
        />
        <StatTile
          icon={Server}
          tone="info"
          label={t("detailStats.objects")}
          value={<span className="nums">{job.vmIds.length}</span>}
          hint={t("detailStats.inScope", { noun: job.vmIds.length === 1 ? "VM" : "VMs" })}
        />
        <StatTile
          icon={Database}
          tone="muted"
          label={t("detailStats.repository")}
          value={<span className="truncate text-base font-semibold" title={repository?.name}>{repository?.name ?? t("common:generic.na")}</span>}
          hint={repository ? REPO_TYPE_META[repository.type].short : t("common:generic.na")}
        />
        <StatTile
          icon={CalendarClock}
          tone="muted"
          label={t("detailStats.nextRun")}
          value={<span className="nums text-base font-semibold">{job.nextRunAt ? formatRelative(job.nextRunAt) : t("status.disabled")}</span>}
          hint={job.nextRunAt ? t("detailStats.scheduled") : t("detailStats.notScheduled")}
        />
        <StatTile
          icon={Layers}
          tone="muted"
          label={t("detailStats.retention")}
          value={<span className="nums text-base font-semibold">{t("detailStats.daysValue", { count: job.retention.keepDays })}</span>}
          hint={job.retention.gfs ? t("detailStats.gfsLongTerm") : retentionLabel(job.retention)}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("detailTabs.overview")}</TabsTrigger>
          <TabsTrigger value="objects">{t("detailTabs.objects")}</TabsTrigger>
          <TabsTrigger value="history">{t("detailTabs.history")}</TabsTrigger>
          <TabsTrigger value="settings">{t("detailTabs.settings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {activeSession ? (
            <ActiveRunPanel session={activeSession} />
          ) : justFinished ? (
            <ActiveRunPanel session={justFinished} />
          ) : (
            lastFinished && <LastRunSummary session={lastFinished} />
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ThroughputChart sessions={jobSessions} accent={job.accent} />
            </div>
            <div className="lg:col-span-5">
              <Card className="flex h-full flex-col p-5">
                <h3 className="text-sm font-semibold">{t("about.title")}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {job.description?.trim() || t("about.noDescription")}
                </p>
                <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-sm">
                  <Detail label={t("about.schedule")} value={scheduleLabel(job.schedule, disabled)} />
                  <Detail label={t("about.retention")} value={retentionLabel(job.retention)} />
                  <Detail label={t("about.scope")} value={job.scopeSummary} />
                  <Detail label={t("about.encryption")} value={job.options.encryption ? t("about.aes256") : t("state.off")} />
                  <Detail
                    label={t("about.compression")}
                    value={t("settings.compressionLevel", { level: job.options.compression })}
                  />
                  <Detail label={t("about.created")} value={formatRelative(job.createdAt)} />
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="objects">
          <JobObjectsTab job={job} />
        </TabsContent>

        <TabsContent value="history">
          <RunHistoryTable sessions={jobSessions} />
        </TabsContent>

        <TabsContent value="settings">
          <JobSettingsTab job={job} repository={repository} />
        </TabsContent>
      </Tabs>

      <DeleteJobDialog open={deleteOpen} onOpenChange={setDeleteOpen} label={job.name} onConfirm={handleDelete} />
    </div>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  badge,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: React.ReactNode;
  hint: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border/70 bg-card p-3.5 shadow-card">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", toneChip(tone))}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {badge}
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 min-h-[1.75rem] text-lg font-semibold leading-tight">{value}</div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{hint}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
