// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight, Gauge, IconActivity, Radio } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusPill } from "@/components/StatusPill";
import { TimeStamp } from "@/components/TimeStamp";
import { SESSION_META, toneFg } from "@/lib/status";
import { formatDateTime, formatDuration, formatRelative, formatStorage, formatThroughput } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import { runKind } from "@/features/activity/lib";

export function LiveActivityPanel() {
  const { t } = useTranslation("dashboard");
  const sessions = useWorldStore((s) => s.sessions);
  const jobs = useWorldStore((s) => s.jobs);

  const running = sessions.filter((s) => s.status === "running");
  const recent = sessions.filter((s) => s.status !== "running" && s.status !== "queued").slice(0, 5);
  const nextRun = jobs
    .filter((j) => j.nextRunAt)
    .map((j) => new Date(j.nextRunAt as string).getTime())
    .sort((a, b) => a - b)[0];

  const liveStatus =
    running.length === 0
      ? t("live.statusNone")
      : running.length === 1
        ? t("live.statusOne", { name: running[0].jobName })
        : t("live.statusMany", { count: running.length });

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2 w-2">
            {running.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${running.length ? "bg-info" : "bg-muted-foreground/40"}`} />
          </span>
          <IconActivity className="h-4 w-4 text-muted-foreground" />
          {t("live.title")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to="/activity">
            {t("live.allActivity")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        <p className="sr-only" aria-live="polite">
          {liveStatus}
        </p>
        {/* Not mode="popLayout": it lifts an exiting child out of flow and only
            drops it once its exit resolves, and this panel re-renders on every
            progress tick — so a render landing mid-exit stranded the callback
            and left the child mounted, absolutely positioned and sized to its
            content. They accumulated, overflowed the page sideways, and the
            same desync left arriving children frozen at their initial opacity.
            The default mode plus `layout` gives the same settling reflow. */}
        <AnimatePresence initial={false}>
          {running.length === 0 ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 border border-dashed border-border px-4 py-5 text-sm text-muted-foreground"
            >
              <Radio className="h-5 w-5" />
              <span>
                {t("live.emptyNoRuns")}
                {nextRun && (
                  <span className="ml-1">
                    {t("live.emptyNextScheduled", {
                      when: formatRelative(new Date(nextRun).toISOString()),
                      abs: formatDateTime(new Date(nextRun).toISOString()),
                    })}
                  </span>
                )}
              </span>
            </motion.div>
          ) : (
            running.map((s) => {
              const current = s.vmResults.find((r) => r.status === "running")?.vmName ?? s.vmResults[0]?.vmName;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  aria-busy
                  className="border border-info/30 bg-info/[0.04] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusPill meta={SESSION_META.running} size="sm" />
                      <span className="truncate text-sm font-medium">{s.jobName}</span>
                    </div>
                    <span aria-hidden className="nums shrink-0 text-sm font-semibold text-info">{Math.round(s.progress)}%</span>
                  </div>
                  <ProgressBar
                    value={s.progress}
                    tone="info"
                    active
                    className="my-2"
                    label={t("live.progressLabel", {
                      name: s.jobName,
                      kind: runKind(s).toLowerCase(),
                    })}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate" title={s.stageMessage}>
                      {s.stageMessage ?? t("live.processing", { name: current })}
                    </span>
                    <span className="flex shrink-0 items-center gap-3 nums">
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {formatThroughput(s.throughputMBps)}
                      </span>
                      <span>{formatStorage(s.processedGB)}</span>
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>

        <div className="mt-1">
          <p className="label-overline mb-1.5">{t("live.recentCompletions")}</p>
          <div className="space-y-0.5">
            {recent.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("live.recentEmpty")}</p>
            )}
            {recent.map((s) => {
              const meta = SESSION_META[s.status];
              const Icon = meta.icon;
              return (
                <Link
                  key={s.id}
                  to={`/jobs/${s.jobId}`}
                  className="flex items-center gap-3 px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  {/* The tone is the status map's verdict — reading it through
                      `toneFg` keeps a non-verdict status (muted, info) from
                      falling through a chained ternary and painting red. */}
                  <Icon className={`h-4 w-4 shrink-0 ${toneFg(meta.tone)}`} />
                  <span className="min-w-0 flex-1 truncate text-sm">{s.jobName}</span>
                  <span className="nums hidden shrink-0 text-xs text-muted-foreground sm:block">{formatStorage(s.processedGB)}</span>
                  <span className="nums hidden shrink-0 text-xs text-muted-foreground md:block">{formatDuration(s.durationSec)}</span>
                  <TimeStamp value={s.finishedAt} size="xs" align="right" className="shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
