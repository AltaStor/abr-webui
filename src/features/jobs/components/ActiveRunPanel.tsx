// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useRef, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { motion } from "framer-motion";
import { Gauge, Radio, Timer } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ProgressBar";
import { LiveThroughput } from "@/components/LiveThroughput";
import { CountUp } from "@/components/CountUp";
import { StatusPill, StatusDot } from "@/components/StatusPill";
import { LogViewer } from "@/components/LogViewer";
import { Metric } from "@/components/Metric";
import { SESSION_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import { formatDuration, formatStorage, formatThroughput } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { Session, VmRunResult } from "@/types";
import { PipelineStages } from "@/components/PipelineStages";
import i18n from "@/i18n";

const VM_TONE: Record<VmRunResult["status"], string> = {
  success: "success",
  warning: "warning",
  failed: "danger",
  running: "info",
  pending: "muted",
};

/** Per-VM run-status labels, resolved through i18next at access time so
 *  VmRunRow (re-rendered by its parent's `useTranslation`) tracks the language. */
const VM_LABEL: Record<VmRunResult["status"], () => string> = {
  success: () => i18n.t("jobs:vmStatus.done"),
  warning: () => i18n.t("jobs:vmStatus.warning"),
  failed: () => i18n.t("jobs:vmStatus.failed"),
  running: () => i18n.t("jobs:vmStatus.running"),
  pending: () => i18n.t("jobs:vmStatus.queued"),
};

/**
 * Run trigger → the same words the Activity list shows. The footer used to
 * interpolate `session.triggeredBy` straight into the sentence, so the wire
 * enum ("schedule", "manual", "retry") surfaced untranslated in every language.
 * The enum values themselves are the backend's and are untouched.
 */
const TRIGGER_LABEL: Record<Session["triggeredBy"], () => string> = {
  schedule: () => i18n.t("activity:trigger.schedule"),
  manual: () => i18n.t("activity:trigger.manual"),
  retry: () => i18n.t("common:actions.retry"),
};

/** Static class strings per tone — Tailwind can't see dynamically built class
 * names, so the run panel's status colours are looked up here as literals. */
const TONE_CLASS: Record<
  "info" | "success" | "warning" | "danger",
  { border: string; borderSoft: string; bgSoft: string; text: string; dot: string; rail: string }
> = {
  info: { border: "border-info/30", borderSoft: "border-info/20", bgSoft: "bg-info/[0.04]", text: "text-info", dot: "bg-info", rail: "bg-info" },
  success: { border: "border-success/30", borderSoft: "border-success/20", bgSoft: "bg-success/[0.04]", text: "text-success", dot: "bg-success", rail: "bg-success" },
  warning: { border: "border-warning/30", borderSoft: "border-warning/20", bgSoft: "bg-warning/[0.04]", text: "text-warning", dot: "bg-warning", rail: "bg-warning" },
  danger: { border: "border-danger/30", borderSoft: "border-danger/20", bgSoft: "bg-danger/[0.04]", text: "text-danger", dot: "bg-danger", rail: "bg-danger" },
};

/** Prominent panel for a job's latest run: live progress while running, and a
 * clear terminal Success/Warning/Failed state once it finishes (shown for a
 * grace window by the parent) so the run visibly *completes* rather than the
 * panel just vanishing. */
export function ActiveRunPanel({ session }: { session: Session }) {
  const { t } = useTranslation("jobs");
  const liveLogs = useWorldStore((s) => s.liveLogs[session.id] ?? []);
  const current = session.vmResults.find((r) => r.status === "running")?.vmName ?? session.vmResults[0]?.vmName;

  const doneCount = session.vmResults.filter((r) => r.status === "success").length;

  const objectsShort = t("objects.vms");
  const objectsHeading = t("objects.virtualMachines");
  const objectNoun = t("objects.vmNoun");

  // Terminal states — the run has finished; show a completion banner, not a
  // live meter.
  const terminal = session.status !== "running";
  // "storing": the guest read is done and real bytes are streaming into the
  // repository (agent-backed VMs) — a distinct, honest phase so the run
  // isn't reported "done" while gigabytes are still moving to disk.
  const storing = session.phase === "storing" && !terminal;
  // A live per-stage pipeline is present whenever the backend is measuring a real
  // agent transfer — which now happens during the READ phase too (real bytes
  // stream in parallel with the fictional sim read), not only during storing.
  const hasPipeline = !terminal && !!session.pipeline;
  // "preparing": an agent-backed run whose real guest read hasn't started yet
  // (the agent is taking a VSS snapshot) — no pipeline and no rate. Once real
  // bytes move, hasPipeline lights up and we show the live graph instead.
  const preparing = !terminal && !storing && !hasPipeline && (session.throughputMBps ?? 0) === 0;

  const tone = terminal
    ? session.status === "success"
      ? "success"
      : session.status === "warning"
        ? "warning"
        : "danger"
    : "info";
  const headline = terminal
    ? session.status === "success"
      ? t("run.headline.backupCompleted")
      : session.status === "warning"
        ? t("run.headline.completedWithWarnings")
        : t("run.headline.backupFailed")
    : storing
      ? t("run.headline.streamingToRepository")
      : t("run.headline.inProgress");

  // Throughput label = what the meter's number MEANS in this phase. In storing
  // it's the repository's PHYSICAL write rate (real bytes after dedup, from the
  // datad stats delta) — the honest "written to repo" number, not the localhost
  // reconstruction rate. The per-stage breakdown lives in PipelineStages.
  const rateLabel = terminal
    ? t("run.rate.averageTransfer")
    : hasPipeline
      ? t("run.rate.repositoryWrite")
      : t("run.rate.guestRead");
  const tc = TONE_CLASS[tone];

  return (
    <Card className={cn("overflow-hidden", tc.border)} aria-busy={!terminal}>
      <div className={cn("h-0.5 w-full", tc.rail)} />

      <p className="sr-only" aria-live="polite">
        {t("run.sr.status", {
          job: session.jobName,
          state: terminal || storing ? headline.toLowerCase() : t("run.sr.running"),
          done: doneCount,
          total: session.vmCount,
          objects: objectsShort,
          processing: current && !storing && !terminal ? t("run.sr.processing", { name: current }) : "",
        })}
      </p>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5">
            {!terminal && (
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", tc.dot)} />
            )}
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", tc.dot)} />
          </span>
          {headline}
        </CardTitle>
        <StatusPill meta={SESSION_META[session.status]} size="sm" />
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Progress + headline metrics */}
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <span
              className="min-w-0 truncate text-sm text-muted-foreground"
              title={terminal ? session.message : session.stageMessage}
            >
              {terminal ? (
                session.message ?? <>{t("run.protected", { done: doneCount, total: session.vmCount, noun: objectNoun })}</>
              ) : session.stageMessage ? (
                session.stageMessage
              ) : storing ? (
                <Trans i18nKey="run.storingBackup" ns="jobs" components={{ 1: <span className="font-medium text-foreground" /> }} />
              ) : (
                <Trans i18nKey="run.reading" ns="jobs" values={{ name: current }} components={{ 1: <span className="font-medium text-foreground" /> }} />
              )}
            </span>
            <span className={cn("nums shrink-0 text-2xl font-semibold", tc.text)}>{Math.round(session.progress)}%</span>
          </div>
          <ProgressBar value={session.progress} tone={tone} active={!terminal} label={t("run.progressLabelBackup", { job: session.jobName })} />
        </div>

        {/* Live pipeline (agent-backed): guest read → LAN → repository, each a
            real rate, with the inferred bottleneck. Shown whenever a real
            transfer is being measured — during the read phase as well as
            storing — so the graph isn't dark while gigabytes stream. */}
        {hasPipeline && <PipelineStages session={session} />}

        {preparing ? (
          /* Agent-backed run before the real read starts — no honest rate yet. */
          <div className="flex items-center gap-2 border border-info/20 bg-info/[0.04] px-3 py-2.5 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
            </span>
            {t("run.preparing")}
          </div>
        ) : (
          /* Rate meter — phase-labeled. In storing it tracks the repository's
             real physical write rate (the waveform the operator watches). */
          <div className={cn("border p-3", tc.borderSoft, tc.bgSoft)}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label-overline flex items-center gap-1.5">
                <Gauge className="h-3 w-3" /> {rateLabel}
              </span>
              <span className={cn("nums text-sm font-semibold", tc.text)}>
                <CountUp value={session.throughputMBps} format={(n) => formatThroughput(n)} durationMs={1100} />
              </span>
            </div>
            <LiveThroughput value={session.throughputMBps} active={!terminal} height={56} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric className="bg-muted/30 px-3 py-2" icon={Radio} label={t("run.metrics.objectsDone", { objects: objectsShort })} value={`${doneCount}/${session.vmCount}`} />
          <Metric className="bg-muted/30 px-3 py-2" icon={Timer} label={t("run.metrics.elapsed")} value={formatDuration(session.durationSec)} />
          <Metric className="bg-muted/30 px-3 py-2" label={t("run.metrics.readGuest")} value={<CountUp value={session.processedGB} format={(n) => formatStorage(n)} durationMs={1100} />} />
          <Metric className="bg-muted/30 px-3 py-2" label={t("run.metrics.storedRepo")} value={<CountUp value={session.transferredGB} format={(n) => formatStorage(n)} durationMs={1100} />} />
        </div>

        {/* Per-VM list — each machine ripples as it completes. */}
        <div className="border border-border">
          <div className="label-overline border-b border-border px-3 py-1.5">
            {objectsHeading}
          </div>
          <div className="max-h-44 divide-y divide-border/50 overflow-y-auto">
            {session.vmResults.map((r) => (
              <VmRunRow key={r.vmId} r={r} />
            ))}
          </div>
        </div>

        {/* Streaming log */}
        <LogViewer lines={liveLogs} live height={240} />

        <p className="text-xs text-muted-foreground">
          {/* Elapsed already has its own metric tile above — this footer only adds trigger context. */}
          {t("run.triggered", { by: TRIGGER_LABEL[session.triggeredBy]() })}
        </p>
      </CardContent>
    </Card>
  );
}

const TERMINAL = new Set(["success", "warning", "failed"]);

/** A per-VM row that ripples — a tone-flash + label pop — the moment it completes. */
function VmRunRow({ r }: { r: VmRunResult }) {
  const prev = useRef(r.status);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const wasActive = !TERMINAL.has(prev.current);
    if (wasActive && TERMINAL.has(r.status)) {
      setFlash(VM_TONE[r.status]);
      const t = setTimeout(() => setFlash(null), 750);
      prev.current = r.status;
      return () => clearTimeout(t);
    }
    prev.current = r.status;
  }, [r.status]);

  return (
    <motion.div layout className="relative flex items-center gap-2 overflow-hidden px-3 py-1.5">
      {flash && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: "easeOut" }}
          style={{ backgroundColor: `hsl(var(--${flash}) / 0.2)` }}
        />
      )}
      <StatusDot tone={VM_TONE[r.status]} pulse={r.status === "running"} />
      <span className={cn("min-w-0 flex-1 truncate text-sm", r.status === "pending" && "text-muted-foreground")}>
        {r.vmName}
      </span>
      <span className="nums hidden shrink-0 text-xs text-muted-foreground sm:block">
        {r.processedGB > 0 ? formatStorage(r.processedGB) : "—"}
      </span>
      <motion.span
        key={r.status}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "shrink-0 text-xs font-medium",
          r.status === "success" && "text-success",
          r.status === "running" && "text-info",
          r.status === "warning" && "text-warning",
          r.status === "failed" && "text-danger",
          r.status === "pending" && "text-muted-foreground",
        )}
      >
        {VM_LABEL[r.status]()}
      </motion.span>
    </motion.div>
  );
}
