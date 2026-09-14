// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Layers,
  Lock,
  Loader2,
  ServerOff,
  Shield,
} from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgressBar } from "@/components/ProgressBar";
import { CancelRunButton } from "@/components/CancelRunButton";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatDateTime, formatStorage } from "@/lib/format";
import {
  resolveSyntheticFullChain,
  syntheticFullFailureKey,
  syntheticFullJobsForVm,
  syntheticFullRefusalMessage,
  syntheticFullTargetRepositories,
  validateSyntheticFull,
} from "@/lib/synthetic-full";
import { useWorldStore } from "@/store/world";

interface SyntheticFullDialogProps {
  /** The VM whose chain is being merged. Only an id and a display name — the
   *  Backups tab holds a `RestorePointJobVmGroup` rather than a `VM` (its
   *  points outlive the machine), and everything else is resolved from the
   *  store, so asking for the full entity would exclude that caller for
   *  nothing. */
  vm: { id: string; name: string };
  /**
   * Preselect the job whose chain to merge. The Backups tab already knows it —
   * its tree is grouped by job — so passing it stops the dialog guessing at a
   * VM protected by more than one job, and hides the job picker. Omitted (the
   * VM detail page), the dialog resolves it itself.
   */
  jobId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Build a synthetic full from a VM's stored backup chain.
 *
 * A synthetic full merges the newest full backup and the incrementals written
 * on top of it into a single new full point, entirely inside the repository —
 * the source VM is never touched. That is the whole reason to run one, so the
 * dialog leads with what it will merge rather than with a form.
 *
 * Three things it deliberately does NOT pretend to offer:
 *
 *  - Per-run compression/encryption. The merge inherits the JOB's settings
 *    (`_resolve_compression_level` / `_resolve_encryption_settings` read the
 *    job's task parameters), and immutability/retention come from the
 *    destination repository's Object Lock and the job's retention. They are
 *    shown, with a link to the job, instead of rendered as controls that would
 *    silently do nothing.
 *  - A VM-scoped run. The appliance starts a synthetic full per JOB and
 *    resolves every VM the job covers to one (`start_job_record`), so a job
 *    with more VMs says so before the operator commits.
 *  - A guaranteed-valid chain. Two of the appliance's checks — the disks
 *    matching across the chain, and the repository having room — cannot be
 *    made from here. Those surface from the run, translated where we can
 *    recognise them (`syntheticFullFailureKey`).
 */
export function SyntheticFullDialog({
  vm,
  jobId: presetJobId,
  open,
  onOpenChange,
}: SyntheticFullDialogProps) {
  const { t } = useTranslation("inventory");
  const jobs = useWorldStore((s) => s.jobs);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const repositories = useWorldStore((s) => s.repositories);
  const sessions = useWorldStore((s) => s.sessions);
  const runSyntheticFull = useWorldStore((s) => s.runSyntheticFull);

  const [jobId, setJobId] = useState<string | null>(null);
  const [targetRepositoryId, setTargetRepositoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** The run we started, once it exists. Everything about the running phase is
   *  read live from the store by this id — never from a snapshot — so progress,
   *  the stage caption and the outcome are the appliance's, not ours. */
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** A refusal that came back from the appliance rather than from our own
   *  pre-checks: something it knew and we couldn't. */
  const [startError, setStartError] = useState<string | null>(null);

  const world = useMemo(
    () => ({ jobs, restorePoints, repositories, sessions }),
    [jobs, restorePoints, repositories, sessions],
  );

  /* Jobs that have actually written points for this VM — the ones with a chain
   * to merge. Usually exactly one, in which case there is nothing to choose. */
  const candidateJobs = useMemo(
    () => syntheticFullJobsForVm(vm.id, world),
    [vm.id, world],
  );

  /* Caller's choice first, then the operator's, then the newest chain. */
  const selectedJobId = jobId ?? presetJobId ?? candidateJobs[0]?.id ?? null;
  const job = candidateJobs.find((j) => j.id === selectedJobId) ?? null;

  const chain = useMemo(
    () => (selectedJobId ? resolveSyntheticFullChain(vm.id, selectedJobId, world) : null),
    [vm.id, selectedJobId, world],
  );

  const targets = useMemo(
    () => (chain ? syntheticFullTargetRepositories(chain, repositories) : []),
    [chain, repositories],
  );

  const effectiveTargetId = targetRepositoryId ?? chain?.repositoryId ?? null;
  const targetRepository = repositories.find((r) => r.id === effectiveTargetId) ?? null;
  const sourceRepository = repositories.find((r) => r.id === chain?.repositoryId) ?? null;

  const refusal = useMemo(
    () =>
      candidateJobs.length === 0
        ? ({ code: "no-job" } as const)
        : validateSyntheticFull(chain, world, effectiveTargetId ?? undefined),
    [candidateJobs.length, chain, world, effectiveTargetId],
  );

  /* Reset every time the dialog is opened: a previous run's outcome must never
   * be the first thing the next one shows. */
  useEffect(() => {
    if (!open) return;
    setJobId(null);
    setTargetRepositoryId(null);
    setSubmitting(false);
    setSessionId(null);
    setStartError(null);
  }, [open, vm.id, presetJobId]);

  const session = sessionId ? sessions.find((s) => s.id === sessionId) ?? null : null;
  const running = session?.status === "running" || session?.status === "queued";
  const finished = session != null && !running;
  const failed = session?.status === "failed";

  /** The appliance's own words for a failed merge, run through the console's
   *  translations where we recognise the case. */
  const failureMessage = useMemo(() => {
    if (!failed) return null;
    const raw = session?.message ?? "";
    const key = syntheticFullFailureKey(raw);
    return key ? t(`syntheticFull.failure.${key}`) : raw || t("syntheticFull.failure.generic");
  }, [failed, session?.message, t]);

  /* The dialog stops being a form the moment the run starts; from then on it is
   * a view of that run. */
  const phase: "configure" | "running" | "done" = sessionId === null ? "configure" : running ? "running" : "done";

  async function handleStart() {
    if (!job || !chain || refusal || submitting) return;
    setSubmitting(true);
    setStartError(null);
    const result = await runSyntheticFull({
      jobId: job.id,
      vmId: vm.id,
      // Only sent when it differs — the appliance treats an absent target as
      // "the job's own repository", which is exactly the default here.
      targetRepositoryId:
        effectiveTargetId && effectiveTargetId !== chain.repositoryId ? effectiveTargetId : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setStartError(result.message);
      return;
    }
    setSessionId(result.sessionId);
    toast.success(t("syntheticFull.toast.startedTitle"), {
      description: t("syntheticFull.toast.startedDesc", { vm: vm.name }),
    });
  }

  const otherVmCount = job ? Math.max(0, job.vmIds.length - 1) : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-primary/12 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <DialogTitle>{t("syntheticFull.title")}</DialogTitle>
          <DialogDescription>
            {phase === "configure"
              ? t("syntheticFull.desc", { vm: vm.name })
              : t("syntheticFull.descRunning", { vm: vm.name })}
          </DialogDescription>
        </DialogHeader>

        {/* ---------------------------- refusals ---------------------------- */}
        {phase === "configure" && refusal && (
          <div className="flex items-start gap-2.5 border border-warning/30 bg-warning/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">{t("syntheticFull.cannotRun")}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {syntheticFullRefusalMessage(refusal)}
              </p>
            </div>
          </div>
        )}

        {/* --------------------------- what merges -------------------------- */}
        {phase === "configure" && chain && (
          <div className="space-y-3">
            {candidateJobs.length > 1 && presetJobId === undefined && (
              <div className="space-y-1.5">
                <Label htmlFor="synthetic-full-job">{t("syntheticFull.jobLabel")}</Label>
                <Select value={selectedJobId ?? undefined} onValueChange={setJobId}>
                  <SelectTrigger id="synthetic-full-job">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateJobs.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {t("syntheticFull.chainCount", { count: chain.points.length })}
                </span>
                <span className="nums text-muted-foreground">{formatStorage(chain.storedGB, 1)}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {chain.points.map((point) => (
                  <li key={point.id} className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-semibold",
                        point.type === "full"
                          ? "bg-primary/12 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {point.type === "full" ? "F" : "I"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {formatDateTime(point.createdAt)}
                    </span>
                    {point.sizeGB > 0 && (
                      <span className="nums shrink-0 text-muted-foreground/80">
                        {formatStorage(point.sizeGB, 1)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                <ArrowRight className="h-3 w-3 shrink-0" />
                {t("syntheticFull.resultNote")}
              </p>
            </div>

            {/* ------------------------ target repository ------------------- */}
            <div className="space-y-1.5">
              <Label htmlFor="synthetic-full-target">{t("syntheticFull.targetLabel")}</Label>
              <Select
                value={effectiveTargetId ?? undefined}
                onValueChange={(next) => setTargetRepositoryId(next)}
              >
                <SelectTrigger id="synthetic-full-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((repository) => (
                    <SelectItem key={repository.id} value={repository.id}>
                      {repository.name}
                      {repository.id === chain.repositoryId && ` · ${t("syntheticFull.targetCurrent")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {effectiveTargetId === chain.repositoryId
                  ? t("syntheticFull.targetSameHint")
                  : t("syntheticFull.targetOtherHint")}
              </p>
            </div>

            {/* ---------------- properties, and where they come from -------- */}
            {job && (
              <div className="border border-border/70 p-3">
                <p className="text-xs font-medium text-foreground">
                  {t("syntheticFull.inherited.title")}
                </p>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <InheritedRow
                    label={t("syntheticFull.inherited.compression")}
                    value={
                      job.options.compression > 0
                        ? t("syntheticFull.inherited.compressionLevel", { level: job.options.compression })
                        : t("syntheticFull.inherited.compressionOff")
                    }
                  />
                  <InheritedRow
                    label={t("syntheticFull.inherited.encryption")}
                    value={
                      job.options.encryption
                        ? t("syntheticFull.inherited.encryptionOn")
                        : t("syntheticFull.inherited.encryptionOff")
                    }
                    icon={job.options.encryption ? Lock : undefined}
                  />
                  <InheritedRow
                    label={t("syntheticFull.inherited.immutability")}
                    value={
                      targetRepository?.immutability && targetRepository.immutability.mode !== "none"
                        ? t("syntheticFull.inherited.immutabilityOn", {
                            days: targetRepository.immutability.retentionDays,
                          })
                        : t("syntheticFull.inherited.immutabilityOff")
                    }
                    icon={
                      targetRepository?.immutability && targetRepository.immutability.mode !== "none"
                        ? Shield
                        : undefined
                    }
                  />
                  <InheritedRow
                    label={t("syntheticFull.inherited.retention")}
                    value={t("syntheticFull.inherited.retentionDays", { count: job.retention.keepDays })}
                  />
                </dl>
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  <Trans
                    i18nKey="syntheticFull.inherited.note"
                    ns="inventory"
                    values={{ job: job.name }}
                    components={{
                      1: <Link to={`/jobs/${job.id}/edit`} className="font-medium text-primary underline-offset-2 hover:underline" />,
                    }}
                  />
                </p>
              </div>
            )}

            {/* The run is per-job. Saying so here is the difference between an
                operator merging one VM's chain and merging twelve. */}
            {otherVmCount > 0 && (
              <div className="flex items-start gap-2.5 border border-border bg-muted/30 px-3 py-2.5">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("syntheticFull.jobScopeNote", { count: otherVmCount, job: job?.name ?? "" })}
                </p>
              </div>
            )}

            {sourceRepository?.status === "warning" && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ServerOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                {t("syntheticFull.sourceDegraded", { repository: sourceRepository.name })}
              </p>
            )}

            {startError && (
              <div className="flex items-start gap-2.5 border border-danger/30 bg-danger/10 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">{t("syntheticFull.startFailed")}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{startError}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------- running / finished --------------------- */}
        {phase !== "configure" && (
          <div className="space-y-3">
            <div className="border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  {running && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
                  {finished && !failed && (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  )}
                  {failed && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" />}
                  <span className="truncate">
                    {running
                      ? t("syntheticFull.progress.running")
                      : failed
                        ? t("syntheticFull.progress.failed")
                        : t("syntheticFull.progress.done")}
                  </span>
                </span>
                {running && (
                  <span className="nums shrink-0 text-xs text-muted-foreground">
                    {Math.round(session?.progress ?? 0)}%
                  </span>
                )}
              </div>
              {running && (
                <ProgressBar
                  className="mt-2.5"
                  value={session?.progress ?? 0}
                  tone="info"
                  active
                  label={t("syntheticFull.progress.barLabel", { vm: vm.name })}
                />
              )}
              {/* The appliance's own per-stage caption, while it has one. */}
              {running && session?.stageMessage && (
                <p className="mt-2 truncate text-xs text-muted-foreground">{session.stageMessage}</p>
              )}
              {failed && failureMessage && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{failureMessage}</p>
              )}
              {finished && !failed && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t("syntheticFull.progress.doneNote")}
                </p>
              )}
            </div>

            {/* Job history, with the run's own log — the same place every other
                run is accounted for, rather than a private view of this one. */}
            {session && (
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link to={`/activity?session=${session.id}`} onClick={() => onOpenChange(false)}>
                  {t("syntheticFull.viewRun")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "running" && session ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("syntheticFull.runInBackground")}
              </Button>
              <CancelRunButton session={session} variant="outline" />
            </>
          ) : phase === "done" ? (
            <Button onClick={() => onOpenChange(false)}>{t("common:actions.close")}</Button>
          ) : (
            <>
              <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
                {t("common:actions.cancel")}
              </Button>
              <Button
                disabled={submitting || refusal !== null || !chain}
                onClick={() => void handleStart()}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                {submitting ? t("syntheticFull.starting") : t("syntheticFull.start")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One inherited property: what it is, and what it will be for this run. */
function InheritedRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 text-foreground">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        {value}
      </dd>
    </div>
  );
}
