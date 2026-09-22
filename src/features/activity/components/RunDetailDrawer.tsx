// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Trash2, ArrowRight, Hand, CalendarClock, RotateCw, Gauge } from "@/lib/icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill, StatusDot } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { LiveThroughput } from "@/components/LiveThroughput";
import { PipelineStages } from "@/components/PipelineStages";
import { CountUp } from "@/components/CountUp";
import { Metric } from "@/components/Metric";
import { LogViewer } from "@/components/LogViewer";
import { CancelRunButton } from "@/components/CancelRunButton";
import { EmptyState } from "@/components/EmptyState";
import { Inbox } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SESSION_META } from "@/lib/status";
import { syntheticFullFailureMessage } from "@/lib/synthetic-full";
import { backupTypeLabel } from "@/lib/run-type";
import { formatDateTime, formatDuration, formatStorage, formatThroughput } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import { getSessionLog } from "@/services/api.http";
import i18n from "@/i18n";
import type { LogLevel, LogLine, Session, VmRunResult } from "@/types";
import { isDelete, isRestore, isVerify, runKind, runKindIcon } from "../lib";

const VM_TONE: Record<VmRunResult["status"], string> = {
  success: "success",
  warning: "warning",
  failed: "danger",
  running: "info",
  pending: "muted",
};

const TRIGGER = {
  schedule: { get label() { return i18n.t("activity:trigger.schedule"); }, icon: CalendarClock },
  manual: { get label() { return i18n.t("activity:trigger.manual"); }, icon: Hand },
  retry: { get label() { return i18n.t("common:actions.retry"); }, icon: RotateCw },
};

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error", "success"]);
const toLevel = (l: string): LogLevel => (LOG_LEVELS.has(l as LogLevel) ? (l as LogLevel) : "info");

interface RunDetailDrawerProps {
  sessionId: string | null;
  onClose: () => void;
}

/**
 * Slide-over that inspects a single run straight from the Activity feed. The run
 * carries its own status, per-VM breakdown and log, so it stays inspectable even
 * when its parent job has since been deleted — where a deep-link to /jobs/:id
 * would dead-end on "Job not found".
 */
export function RunDetailDrawer({ sessionId, onClose }: RunDetailDrawerProps) {
  const { t } = useTranslation("activity");
  const session = useWorldStore((s) => s.sessions.find((x) => x.id === sessionId));
  const jobExists = useWorldStore((s) => (session ? s.jobs.some((j) => j.id === session.jobId) : false));

  return (
    <Sheet open={sessionId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {session ? (
          <RunDetail session={session} jobExists={jobExists} onClose={onClose} />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{t("drawer.unavailableTitle")}</SheetTitle>
              <SheetDescription>{t("drawer.unavailableDescription")}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 px-6 py-4">
              <EmptyState icon={Inbox} title={t("drawer.emptyTitle")} description={t("drawer.emptyDescription")} compact />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RunDetail({ session: s, jobExists, onClose }: { session: Session; jobExists: boolean; onClose: () => void }) {
  const { t } = useTranslation("activity");
  const navigate = useNavigate();
  const mode = useWorldStore((st) => st.mode);
  const buffered = useWorldStore((st) => st.liveLogs[s.id]);

  // Finished runs don't keep logs in the store (only running ones stream) — pull
  // this run's log on demand in live mode. Sim has no backend, so it shows only
  // whatever streamed into the buffer.
  const [fetched, setFetched] = useState<LogLine[] | null>(null);
  useEffect(() => {
    setFetched(null);
    if (buffered && buffered.length) return;
    if (mode !== "live") return;
    let cancelled = false;
    getSessionLog(s.id)
      .then((r) =>
        r.lines.map((l) => ({ id: l.id, ts: l.ts, level: toLevel(l.level), message: l.message, vmName: l.vmName })),
      )
      .then((lines) => !cancelled && setFetched(lines))
      .catch(() => !cancelled && setFetched([]));
    return () => {
      cancelled = true;
    };
  }, [s.id, mode, buffered]);

  const logLines = buffered && buffered.length ? buffered : fetched ?? [];
  const running = s.status === "running";
  const restore = isRestore(s);
  // A verification re-reads a stored chain in place: the appliance reports only
  // percent + a stage message for it, so every byte and rate figure below is
  // hidden rather than printed as a zero the operator has to interpret.
  const verify = isVerify(s);
  // A deletion moves no bytes either — it removes them. Same treatment as a
  // verify for every byte and rate figure below.
  const noByteTelemetry = verify || isDelete(s);
  const KindIcon = runKindIcon(s);
  // Null for a run that writes no restore point (restore / verify / delete):
  // those carry the appliance's default "full" and printing it labelled a
  // deletion as a full backup.
  const typeLabel = backupTypeLabel(s);
  // A merge that failed has a cause the console can usually name outright; a
  // run that succeeded, or failed any other way, keeps the appliance's line.
  const failedSynthetic = Boolean(s.synthetic) && s.status === "failed";
  const resultMessage = failedSynthetic ? syntheticFullFailureMessage(s.message ?? "") : s.message;
  /* The same sentence for the per-VM row. It used to print the appliance's own
   * text while the banner above it printed the console's, so one failed merge
   * explained itself twice, in two different wordings. The log below keeps the
   * appliance's lines verbatim — it is a log. */
  const vmMessage = (message: string | undefined) =>
    failedSynthetic && message ? syntheticFullFailureMessage(message) : message;
  const trigger = TRIGGER[s.triggeredBy];
  const TriggerIcon = trigger.icon;

  // The waveform is driven by throughputMBps — the TRANSFER rate — and never by
  // the guest-read rate, even though that reads like the more natural "source"
  // figure. The mover only prints INTEGER percent (see _PROGRESS_LINE_PATTERN),
  // so guest-read bytes advance one whole percent of the disk at a time — ~1GB
  // steps seconds apart on a large disk, which renders as a flatline that
  // periodically jumps. Transferred bytes are re-measured off the repository
  // every tick, so they move continuously and the meter stays alive.
  //
  // The label names whichever rate the number actually is: the repository's
  // physical write once the pipeline is measuring (agent-backed "storing"
  // phase), the plain transfer rate otherwise. The guest-read figure is a
  // stat below, where a stepped value reads fine.
  const hasPipeline = running && !!s.pipeline;
  const rateLabel = hasPipeline ? t("drawer.rate.repoWrite") : t("drawer.rate.transfer");

  // Per-VM outcomes reuse the console-wide session vocabulary; only "pending"
  // has no counterpart there.
  const resultLabel = (status: VmRunResult["status"]) =>
    status === "pending" ? t("drawer.table.pending") : t(`domain:session.${status}`);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted/60">
            <KindIcon className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{s.jobName}</SheetTitle>
            <SheetDescription className="flex items-center gap-1.5">
              <span>{runKind(s)}</span>
              {typeLabel && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{typeLabel}</span>
                </>
              )}
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1">
                <TriggerIcon className="h-3 w-3" />
                {trigger.label}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="nums">{formatDateTime(s.startedAt)}</span>
            </SheetDescription>
          </div>
          <StatusPill meta={SESSION_META[s.status]} size="sm" />
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
        {running && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ProgressBar value={s.progress} tone="info" active size="sm" className="flex-1" label={t("drawer.progressLabel", { job: s.jobName })} />
              <span className="nums w-9 shrink-0 text-right text-xs font-semibold text-info">{Math.round(s.progress)}%</span>
            </div>
            {s.stageMessage && <p className="truncate text-xs text-muted-foreground">{s.stageMessage}</p>}

            {/* Live throughput waveform — the run's "beautiful graph", now inside
                the detail slide-over instead of a standalone widget over the feed. */}
            {!verify && (
              <div className="border border-info/20 bg-info/[0.04] p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="label-overline flex items-center gap-1.5">
                    <Gauge className="h-3 w-3" /> {rateLabel}
                  </span>
                  <span className="nums text-sm font-semibold text-info">
                    <CountUp value={s.throughputMBps} format={(n) => formatThroughput(n)} durationMs={1100} />
                  </span>
                </div>
                <LiveThroughput value={s.throughputMBps} active height={48} />
              </div>
            )}

            {/* Per-stage pipeline (agent-backed backup): guest read → LAN →
                repository, each a live rate with the inferred bottleneck. */}
            {s.pipeline && <PipelineStages session={s} />}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {typeLabel && (
            <Metric
              label={t("drawer.stat.type")}
              value={
                <Badge variant={s.backupType === "full" ? "info" : "outline"}>{typeLabel}</Badge>
              }
            />
          )}
          <Metric label={t("drawer.stat.duration")} value={running ? "—" : formatDuration(s.durationSec)} />
          <Metric label={t("objectNouns.vm.compact")} value={s.vmCount} />
          {!noByteTelemetry && (
            <>
              <Metric label={t("drawer.stat.read")} value={s.processedGB > 0 ? formatStorage(s.processedGB) : "—"} />
              <Metric
                label={t("drawer.stat.transferred")}
                value={s.transferredGB > 0 ? formatStorage(s.transferredGB) : "—"}
              />
              <Metric
                label={t("drawer.stat.guestRead")}
                value={s.guestReadMBps && s.guestReadMBps > 0 ? formatThroughput(s.guestReadMBps) : "—"}
              />
              <Metric
                label={t("drawer.stat.throughput")}
                value={s.throughputMBps > 0 ? formatThroughput(s.throughputMBps) : "—"}
              />
            </>
          )}
        </div>

        {/* A failed synthetic full gets the console's own explanation of the
            merge failure — the same sentence the manual-run dialog shows, so
            a scheduled merge and a hand-started one read alike. */}
        {resultMessage && (
          <p
            className={cn(
              "border px-3 py-2 text-xs",
              failedSynthetic
                ? "border-danger/30 bg-danger-subtle text-danger-text"
                : "border-border bg-muted/20 text-muted-foreground",
            )}
          >
            {resultMessage}
          </p>
        )}

        {/* Per-VM breakdown */}
        <section>
          <h4 className="label-overline mb-2">
            {t("objectNouns.vm.plural")}
          </h4>
          <div className="overflow-hidden border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 text-left text-[11px] text-muted-foreground">
                  <th className="py-1.5 pl-3 font-medium">{t("objectNouns.vm.singular")}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("drawer.table.result")}</th>
                  {!noByteTelemetry && (
                    <>
                      <th className="hidden py-1.5 pr-3 font-medium sm:table-cell">{t("drawer.table.read")}</th>
                      <th className="hidden py-1.5 pr-3 font-medium sm:table-cell">{t("drawer.table.sent")}</th>
                    </>
                  )}
                  <th className="py-1.5 pr-3 text-right font-medium">{t("drawer.table.duration")}</th>
                </tr>
              </thead>
              <tbody>
                {s.vmResults.map((r) => (
                  <tr key={r.vmId} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 pl-3">
                      <span className="flex items-center gap-2">
                        <StatusDot tone={VM_TONE[r.status]} />
                        <span className="truncate" title={r.vmName}>
                          {r.vmName}
                        </span>
                      </span>
                    </td>
                    {/* The appliance's own per-VM message wins; the status is
                        the fallback, and it needs translating rather than
                        printing the raw enum with a capital letter on it. */}
                    <td className="py-1.5 pr-3 text-muted-foreground">{vmMessage(r.message) ?? resultLabel(r.status)}</td>
                    {!noByteTelemetry && (
                      <>
                        <td className="nums hidden py-1.5 pr-3 text-muted-foreground sm:table-cell">
                          {r.processedGB > 0 ? formatStorage(r.processedGB) : "—"}
                        </td>
                        <td className="nums hidden py-1.5 pr-3 text-muted-foreground sm:table-cell">
                          {r.transferredGB > 0 ? formatStorage(r.transferredGB) : "—"}
                        </td>
                      </>
                    )}
                    <td className="nums py-1.5 pr-3 text-right text-muted-foreground">{formatDuration(r.durationSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Log */}
        <section>
          <h4 className="label-overline mb-2">{t("drawer.log")}</h4>
          <LogViewer lines={logLines} live={running} height={220} />
        </section>
      </div>

      <SheetFooter className="flex items-center justify-between gap-3">
        {restore ? (
          <span className="text-xs text-muted-foreground">{t("drawer.footer.restore")}</span>
        ) : jobExists ? (
          <span className="text-xs text-muted-foreground">{t("drawer.footer.jobLabel", { kind: runKind(s) })}</span>
        ) : s.jobId ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
            {t("drawer.footer.deleted")}
          </span>
        ) : (
          /* A verification and a deletion run against the repository with no job
             behind them, so "Job deleted — history preserved" was mourning a job
             that never existed. No job id, nothing to say about a job. */
          <span className="text-xs text-muted-foreground">{t("drawer.footer.noJob", { kind: runKind(s) })}</span>
        )}
        <div className="flex items-center gap-2">
          {/* Inspecting a live run is exactly when you decide to stop it, so the
              action belongs here and not only on the job page — which a run
              whose job was deleted no longer has. */}
          {running && <CancelRunButton session={s} />}
          {restore ? (
            <Button size="sm" variant="outline" onClick={() => go("/restore")}>
              {t("drawer.footer.openRestore")}
              {/* Same-tab in-app routes: the arrow, not the leaves-the-app glyph. */}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : jobExists ? (
            <Button size="sm" variant="outline" onClick={() => go(`/jobs/${s.jobId}`)}>
              {t("drawer.footer.openJob")}
              {/* Same-tab in-app routes: the arrow, not the leaves-the-app glyph. */}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </SheetFooter>
    </>
  );
}
