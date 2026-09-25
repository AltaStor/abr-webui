// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Database,
  DatabaseBackup,
  Layers,
  Pencil,
  Play,
  Power,
  Server,
  Trash2,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { KpiBand } from "@/components/KpiBand";
import { KpiCard } from "@/components/KpiCard";
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
import { formatDateTime, formatRelative } from "@/lib/format";
import { lastRunMeta, rateTone } from "@/lib/status";
import { apiErrorMessage } from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import { REPO_TYPE_META } from "@/features/repositories/components/repoMeta";
import { fullScheduleLabel, jobTypeMeta, retentionLabel, scheduleLabel } from "./lib";
import { ActiveRunPanel } from "./components/ActiveRunPanel";
import { LastRunSummary } from "./components/LastRunSummary";
import { ThroughputChart } from "./components/ThroughputChart";
import { RunHistoryTable } from "./components/RunHistoryTable";
import { JobObjectsTab } from "./components/JobObjectsTab";
import { JobSettingsTab } from "./components/JobSettingsTab";
import { DeleteJobDialog } from "./components/DeleteJobDialog";

export default function JobDetailPage() {
  const { t } = useTranslation("jobs");
  /* The back-link names the destination the way the sidebar does, so it
   * cannot drift from it — the section has been called "Backup" since the
   * jobs list and the restore points became one page. */
  const { t: tNav } = useTranslation("nav");
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
        <PageHeader title={t("notFound.title")} backTo={{ href: "/jobs", label: tNav("backups") }} />
        <Card>
          <EmptyState
            icon={DatabaseBackup}
            title={t("notFound.heading")}
            description={t("notFound.description")}
            action={
              <Button asChild>
                <Link to="/jobs">{t("notFound.backTo", { section: tNav("backups") })}</Link>
              </Button>
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
  /* Console-owned sentence first, the appliance's own words underneath — they
   * arrive as UI-ready English the console doesn't own, so they are evidence,
   * never the verdict. */
  const failureBody = (body: string, detail?: string | null) => (
    <span className="block">
      {body}
      {detail && <span className="mt-1 block">{detail}</span>}
    </span>
  );

  const handleRun = async (forceFull = false) => {
    const sessionId = await runJob(job.id, undefined, forceFull);
    if (sessionId) {
      toast.success(t("toast.started", { name: job.name }), { description: t("toast.startedBelow") });
      return;
    }
    /* `runJob` reports every failure as a null session — a 409, a 404, a 5xx
     * and a dead network are indistinguishable here (see world.live.ts, which
     * swallows the error). This used to announce "{{name}} is already
     * running", which is a diagnosis the console cannot make and was simply
     * false whenever the appliance was unreachable. Only `disabled` is known
     * locally and true, so only that is claimed. */
    toast.error(t("toast.runRefused", { name: job.name }), {
      description: disabled ? t("toast.runRefusedDisabledDesc") : t("toast.runRefusedDesc"),
    });
  };
  const handleToggle = async () => {
    try {
      await setJobEnabled(job.id, disabled);
      toast.success(disabled ? t("toast.enabled", { name: job.name }) : t("toast.disabled", { name: job.name }));
    } catch (err) {
      toast.error(disabled ? t("toast.enableFailed", { name: job.name }) : t("toast.disableFailed", { name: job.name }), {
        description: failureBody(t("toast.enableDisableFailedDesc"), apiErrorMessage(err)),
      });
    }
  };
  const handleDelete = async () => {
    try {
      await deleteJob(job.id);
      toast.success(t("toast.deleted", { name: job.name }), { description: t("toast.pointsSafe") });
      navigate("/jobs");
    } catch (err) {
      toast.error(t("toast.deleteFailed", { name: job.name }), {
        description: failureBody(t("toast.deleteFailedDesc"), apiErrorMessage(err)),
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        backTo={{ href: "/jobs", label: tNav("backups") }}
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
                  className=""
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
                      className="border-l border-primary-foreground/20 px-2"
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
            <Button asChild variant="outline">
              <Link to={`/jobs/${job.id}/edit`}>
                <Pencil className="h-4 w-4" />
                {t("common:actions.edit")}
              </Link>
            </Button>
            <Button variant="outline" onClick={handleToggle}>
              {/* Power, not Play/Pause: transport belongs to "Run now" / "Stop run".
                  The wire protocol has always called this enable/disable. */}
              <Power className="h-4 w-4" />
              {disabled ? t("common:actions.enable") : t("common:actions.disable")}
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("actions.deleteJob")} className="text-danger hover:text-danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {/* Stat tiles */}
      {/* One framed block divided by hairlines, not six floating cards —
          KpiBand is the console's stats-row treatment everywhere else.
          All three column counts divide six, so no cell is ever left
          empty showing the band's ground. */}
      {/* Six across only from xl. At lg the tiles are ~160px wide, which clipped
          the hint's timestamp and left the repository name and status pill cramped
          for the same reason; three across is the shape this band already had. */}
      <KpiBand className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          density="compact"
          icon={lastRunMeta(job.lastStatus).icon}
          tone={disabled ? "muted" : lastRunMeta(job.lastStatus).tone}
          label={t("detailStats.lastRun")}
          /* The outcome of the last run, and nothing else. It used to answer a
             different question than its label asked: "Queued" on a job that had
             never run, and "Disabled" on a job whose last run had an outcome
             like any other — while the jobs list, reading the same two fields,
             said "Never run" for both. Enablement is the Next run tile's
             business; here it only drains the colour. */
          value={<StatusPill meta={lastRunMeta(job.lastStatus)} size="sm" />}
          // Six tiles across cannot carry both halves without clipping, and the
          // Last run card directly below already says how long ago. So the tile
          // takes the half the page was missing: which run this was.
          hint={job.lastRunAt ? formatDateTime(job.lastRunAt) : undefined}
        />
        <KpiCard
          density="compact"
          icon={CheckCircle2}
          tone={job.lastRunAt ? rateTone(job.successRate) : "muted"}
          label={t("detailStats.successRate")}
          value={<span className="nums">{job.lastRunAt ? `${job.successRate}%` : "—"}</span>}
          hint={t("detailStats.recentRuns")}
        />
        <KpiCard
          density="compact"
          icon={Server}
          tone="neutral"
          label={t("detailStats.objects")}
          value={<span className="nums">{job.vmIds.length}</span>}
          hint={t("detailStats.inScope", { noun: job.vmIds.length === 1 ? "VM" : "VMs" })}
        />
        <KpiCard
          density="compact"
          icon={Database}
          tone={repository ? "neutral" : "muted"}
          label={t("detailStats.repository")}
          value={<span className="truncate text-base font-semibold" title={repository?.name}>{repository?.name ?? t("common:generic.na")}</span>}
          hint={repository ? REPO_TYPE_META[repository.type].short : t("common:generic.na")}
        />
        <KpiCard
          density="compact"
          icon={CalendarClock}
          tone={job.nextRunAt ? "neutral" : "muted"}
          label={t("detailStats.nextRun")}
          value={<span className="nums text-base font-semibold">{job.nextRunAt ? formatRelative(job.nextRunAt) : t("status.disabled")}</span>}
          // The value above is already the countdown; the hint slot is free to
          // say which slot that lands in, instead of the filler word "Scheduled".
          hint={job.nextRunAt ? formatDateTime(job.nextRunAt) : t("detailStats.notScheduled")}
        />
        <KpiCard
          density="compact"
          icon={Layers}
          tone="neutral"
          label={t("detailStats.retention")}
          value={<span className="nums text-base font-semibold">{t("detailStats.daysValue", { count: job.retention.keepDays })}</span>}
          hint={job.retention.gfs ? t("detailStats.gfsLongTerm") : retentionLabel(job.retention)}
        />
      </KpiBand>

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
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                  <Detail label={t("about.schedule")} value={scheduleLabel(job.schedule, disabled)} />
                  {job.type !== "replication" && (
                    <>
                      <Detail label={t("fullSchedule.active")} value={fullScheduleLabel(job.activeFullSchedule)} />
                      <Detail label={t("fullSchedule.synthetic")} value={fullScheduleLabel(job.syntheticFullSchedule)} />
                    </>
                  )}
                  <Detail label={t("about.retention")} value={retentionLabel(job.retention)} />
                  <Detail label={t("about.scope")} value={job.scopeSummary} />
                  <Detail label={t("about.encryption")} value={job.options.encryption ? t("about.aes256") : t("state.off")} />
                  <Detail
                    label={t("about.compression")}
                    value={t("settings.compressionLevel", { level: job.options.compression })}
                  />
                  <Detail label={t("about.created")} value={formatDateTime(job.createdAt)} />
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
