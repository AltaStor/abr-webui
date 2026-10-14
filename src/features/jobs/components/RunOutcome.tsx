// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, XCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { JobLastRun, JobRunResult, Session } from "@/types";

type RunProblem = Extract<JobRunResult, "failed" | "stopped" | "warning">;

const PROBLEMS: RunProblem[] = ["failed", "stopped", "warning"];

function useRunSummary(run: JobLastRun | null | undefined): string | null {
  const { t } = useTranslation("jobs");
  if (!run) return null;
  if (run.result === "running") {
    return t("runResult.running", { done: run.vmCount - run.running, total: run.vmCount });
  }
  const worst = PROBLEMS.find((result) => run[result] > 0);
  return worst ? t(`runResult.${worst}`, { count: run[worst], total: run.vmCount }) : null;
}

export function LastRunCounts({ run }: { run?: JobLastRun | null }) {
  const summary = useRunSummary(run);
  if (!summary || !run) return null;
  return (
    <span
      className={cn(
        "mt-0.5 block text-[11px]",
        run.result === "failed" || run.result === "stopped" ? "text-danger-text" : "text-muted-foreground",
      )}
    >
      {summary}
    </span>
  );
}

export function LastRunProblems({ run }: { run?: JobLastRun | null }) {
  const { t } = useTranslation("jobs");
  const summary = useRunSummary(run);
  const problems = (run?.vms ?? []).filter((vm) => (PROBLEMS as JobRunResult[]).includes(vm.result));
  if (!run || !summary || !problems.length) return null;
  const severe = run.failed > 0 || run.stopped > 0;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 border px-3 py-2.5",
        severe ? "border-danger/30 bg-danger/10" : "border-warning/30 bg-warning/10",
      )}
    >
      {severe ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      )}
      <div className="min-w-0 space-y-1 text-xs text-foreground">
        <p className={cn("font-medium", severe ? "text-danger-text" : "text-warning-text")}>
          {t("runResult.title", { summary })}
        </p>
        <ul className="space-y-1">
          {problems.map((vm) => (
            <li key={vm.vmId ?? vm.vmName} className="break-words">
              <span className="font-medium">{vm.vmName}</span>
              {" — "}
              {t(`runResult.vmResult.${vm.result}`)}
              {vm.message ? `: ${vm.message}` : null}
              {vm.sessionIds.length ? (
                <>
                  {" "}
                  <Link
                    to={`/activity?session=${vm.sessionIds[vm.sessionIds.length - 1]}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {t("runResult.openSession")}
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


/** The last run as one session for the Overview card: all of its VMs, the run's
 *  own result, and its sessions' bytes added up. Null while it is still going or
 *  when its sessions are not loaded. */
export function lastRunAsSession(run: JobLastRun | null | undefined, sessions: Session[]): Session | null {
  if (!run || run.result === "running") return null;
  const ids = new Set(run.vms.flatMap((vm) => vm.sessionIds));
  const mine = sessions.filter((session) => ids.has(session.id));
  if (!mine.length) return null;
  const time = (value: string | null) => (value ? new Date(value).getTime() : 0);
  const started = Math.min(...mine.map((session) => time(session.startedAt)));
  const finished = Math.max(...mine.map((session) => time(session.finishedAt)));
  const newest = mine.reduce((a, b) => (time(b.finishedAt) > time(a.finishedAt) ? b : a));
  const durationSec = finished > started ? Math.round((finished - started) / 1000) : newest.durationSec;
  const transferredGB = mine.reduce((sum, session) => sum + session.transferredGB, 0);
  const problem = run.vms.find((vm) => PROBLEMS.includes(vm.result as RunProblem) && vm.message);
  return {
    ...newest,
    status: run.result === "stopped" ? "failed" : run.result,
    vmCount: run.vmCount,
    startedAt: new Date(started).toISOString(),
    finishedAt: finished ? new Date(finished).toISOString() : newest.finishedAt,
    durationSec,
    processedGB: mine.reduce((sum, session) => sum + session.processedGB, 0),
    transferredGB,
    throughputMBps: durationSec ? (transferredGB * 1024) / durationSec : 0,
    message: problem ? `${problem.vmName}: ${problem.message}` : undefined,
  };
}
