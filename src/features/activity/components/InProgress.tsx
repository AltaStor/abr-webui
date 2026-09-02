// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Gauge, Layers, Server, Timer } from "@/lib/icons";
import { ProgressBar } from "@/components/ProgressBar";
import { LiveThroughput } from "@/components/LiveThroughput";
import { CountUp } from "@/components/CountUp";
import { StatusPill } from "@/components/StatusPill";
import { SESSION_META } from "@/lib/status";
import { formatDuration, formatRelative, formatStorage, formatThroughput } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { Session } from "@/types";
import { cn } from "@/lib/utils";
import { currentVmName, isRestore, runKind, runKindIcon, runKindTone } from "../lib";

/**
 * Prominent "In progress" section. Each running session renders a rich live card
 * that visibly advances every simulation tick. When nothing is running we show a
 * calm row with the soonest scheduled run.
 */
export function InProgress() {
  const sessions = useWorldStore((s) => s.sessions);
  const jobs = useWorldStore((s) => s.jobs);

  const running = sessions.filter((s) => s.status === "running");
  const nextRunMs = jobs
    .filter((j) => j.nextRunAt)
    .map((j) => new Date(j.nextRunAt as string).getTime())
    .sort((a, b) => a - b)[0];

  const liveStatus =
    running.length === 0
      ? "No active runs."
      : running.length === 1
        ? `${running[0].jobName} running.`
        : `${running.length} runs in progress.`;

  return (
    <section className="space-y-3" aria-label="In progress">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">In progress</h2>
        {running.length > 0 && (
          <span className="nums bg-info-subtle px-2 py-0.5 text-[11px] font-semibold text-info">
            {running.length}
          </span>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {liveStatus}
      </p>

      <AnimatePresence mode="popLayout" initial={false}>
        {running.length === 0 ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-4 text-sm text-muted-foreground"
          >
            <CalendarClock className="h-5 w-5 shrink-0" />
            <span>
              No active runs right now — everything is up to date.
              {nextRunMs && (
                <span className="ml-1 text-foreground/80">
                  Next scheduled run {formatRelative(new Date(nextRunMs).toISOString())}.
                </span>
              )}
            </span>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {running.map((s) => (
              <RunningCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

function RunningCard({ session: s }: { session: Session }) {
  const restore = isRestore(s);
  const current = currentVmName(s);
  const target = restore ? "/restore" : `/jobs/${s.jobId}`;
  const doneVms = s.vmResults.filter((r) => r.status === "success").length;
  const KindIcon = runKindIcon(s);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      aria-busy
      className="relative overflow-hidden rounded-xl border border-info/30 bg-info/[0.04] p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              runKindTone(s),
            )}
            title={runKind(s)}
          >
            <KindIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Link
              to={target}
              className="block truncate text-sm font-semibold tracking-tight transition-colors hover:text-info"
            >
              {s.jobName}
            </Link>
            <div className="mt-1 flex items-center gap-2">
              <StatusPill meta={SESSION_META.running} size="sm" />
              <span className="text-[11px] font-semibold text-muted-foreground">{runKind(s)}</span>
            </div>
          </div>
        </div>
        <span aria-hidden className="nums shrink-0 text-2xl font-semibold tracking-tight text-info">{Math.round(s.progress)}%</span>
      </div>

      <ProgressBar value={s.progress} tone="info" active className="mt-3" label={`${s.jobName} ${runKind(s).toLowerCase()} progress`} />

      {/* Live throughput monitor — scrolls smoothly between ticks. */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground" title={s.stageMessage}>
            <Server className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{s.stageMessage ?? `Processing ${current}`}</span>
          </span>
          <span className="nums shrink-0 font-semibold text-info">
            <CountUp value={s.throughputMBps} format={(n) => formatThroughput(n)} durationMs={1100} />
          </span>
        </div>
        <div className="overflow-hidden rounded-md bg-info/[0.04]">
          <LiveThroughput value={s.throughputMBps} active height={34} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-info/15 pt-3">
        <Metric
          icon={Gauge}
          label="Read"
          value={
            s.processedGB > 0 ? (
              <CountUp value={s.processedGB} format={(n) => formatStorage(n, 0)} durationMs={1100} />
            ) : (
              "—"
            )
          }
        />
        <Metric
          icon={Layers}
          label="Sent"
          value={
            s.transferredGB > 0 ? (
              <CountUp value={s.transferredGB} format={(n) => formatStorage(n, 0)} durationMs={1100} />
            ) : (
              "—"
            )
          }
        />
        <Metric icon={Server} label="VMs" value={`${doneVms}/${s.vmCount}`} />
        <Metric icon={Timer} label="Elapsed" value={formatDuration(s.durationSec)} />
      </div>
    </motion.div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </div>
      <p className="nums mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
