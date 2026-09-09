// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Gauge, Layers, Server, Timer } from "@/lib/icons";
import { ProgressBar } from "@/components/ProgressBar";
import { Metric } from "@/components/Metric";
import { LiveThroughput } from "@/components/LiveThroughput";
import { CountUp } from "@/components/CountUp";
import { StatusPill } from "@/components/StatusPill";
import { CancelRunButton } from "@/components/CancelRunButton";
import { SESSION_META } from "@/lib/status";
import { formatDateTime, formatDuration, formatRelative, formatStorage, formatThroughput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorldStore } from "@/store/world";
import type { Session } from "@/types";
import { currentVmName, isRestore, isVerify, runKind, runKindIcon } from "../lib";

/**
 * Prominent "In progress" section. Each running session renders a rich live card
 * that visibly advances every simulation tick. When nothing is running we show a
 * calm row with the soonest scheduled run.
 */
export function InProgress() {
  const { t } = useTranslation("activity");
  const sessions = useWorldStore((s) => s.sessions);
  const jobs = useWorldStore((s) => s.jobs);

  const running = sessions.filter((s) => s.status === "running");
  const nextRunMs = jobs
    .filter((j) => j.nextRunAt)
    .map((j) => new Date(j.nextRunAt as string).getTime())
    .sort((a, b) => a - b)[0];

  const liveStatus =
    running.length === 0
      ? t("inProgress.sr.none")
      : running.length === 1
        ? t("inProgress.sr.one", { job: running[0].jobName })
        : t("inProgress.sr.many", { count: running.length });

  return (
    <section className="space-y-3" aria-label={t("inProgress.heading")}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("inProgress.heading")}</h2>
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
            className="flex items-center gap-3 border border-dashed border-border bg-card/40 px-4 py-4 text-sm text-muted-foreground"
          >
            <CalendarClock className="h-5 w-5 shrink-0" />
            <span>
              {t("inProgress.idle")}
              {nextRunMs && (
                <span className="ml-1 text-foreground/80">
                  {t("inProgress.nextScheduled", {
                    when: formatRelative(new Date(nextRunMs).toISOString()),
                    abs: formatDateTime(new Date(nextRunMs).toISOString()),
                  })}
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
  const { t } = useTranslation("activity");
  const restore = isRestore(s);
  // A verification only re-reads what is already stored: it has no rate and no
  // byte counters behind it, so the card drops the meter and the read/sent
  // tiles rather than animating a flatline and two dashes.
  const verify = isVerify(s);
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
      className="relative overflow-hidden border border-info/30 bg-info/[0.04] p-4 "
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center bg-info/10 text-info"
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
              <span className="text-[11px] font-medium text-muted-foreground">{runKind(s)}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span aria-hidden className="nums text-2xl font-semibold tracking-tight text-info">{Math.round(s.progress)}%</span>
          <CancelRunButton session={s} />
        </div>
      </div>

      <ProgressBar value={s.progress} tone="info" active className="mt-3" label={t("row.progressLabel", { job: s.jobName, kind: runKind(s).toLowerCase() })} />

      {/* Stage line — plus, for runs that actually move data, the live
          throughput monitor that scrolls smoothly between ticks. */}
      <div className="mt-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground" title={s.stageMessage}>
            <Server className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{s.stageMessage ?? t("inProgress.processing", { name: current })}</span>
          </span>
          {!verify && (
            <span className="nums shrink-0 font-semibold text-info">
              <CountUp value={s.throughputMBps} format={(n) => formatThroughput(n)} durationMs={1100} />
            </span>
          )}
        </div>
        {!verify && (
          <div className="mt-1 overflow-hidden bg-info/[0.04]">
            <LiveThroughput value={s.throughputMBps} active height={34} />
          </div>
        )}
      </div>

      <div className={cn("mt-3 grid gap-2 border-t border-info/15 pt-3", verify ? "grid-cols-2" : "grid-cols-4")}>
        {!verify && (
          <>
            <Metric
              icon={Gauge}
              label={t("feed.columns.read")}
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
              label={t("feed.columns.sent")}
              value={
                s.transferredGB > 0 ? (
                  <CountUp value={s.transferredGB} format={(n) => formatStorage(n, 0)} durationMs={1100} />
                ) : (
                  "—"
                )
              }
            />
          </>
        )}
        {/* A "done/total" ratio only says something when the run actually spans
            several objects. The appliance reports one VM per session, so there
            the ratio could only ever read 0/1 — the VM's name is the real
            measurement in that case. */}
        {s.vmCount > 1 ? (
          <Metric icon={Server} label={t("objectNouns.vm.compact")} value={`${doneVms}/${s.vmCount}`} />
        ) : (
          <Metric icon={Server} label={t("objectNouns.vm.singular")} value={current ?? "—"} />
        )}
        <Metric icon={Timer} label={t("inProgress.elapsed")} value={formatDuration(s.durationSec)} />
      </div>
    </motion.div>
  );
}

