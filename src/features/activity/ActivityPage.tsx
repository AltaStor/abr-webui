// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useWorldStore } from "@/store/world";
import { ActivitySummary } from "./components/ActivitySummary";
import { InProgress } from "./components/InProgress";
import { ActivityFilters } from "./components/ActivityFilters";
import { RunFeed } from "./components/RunFeed";
import { RunDetailDrawer } from "./components/RunDetailDrawer";
import { matchesStatus, runKind, type StatusFilter } from "./lib";

export default function ActivityPage() {
  const { t } = useTranslation("activity");
  // Live, ~1.2s-tick data straight from the store — the running job advances
  // here. This is the newest slice of run history, not all of it: the poll
  // fetches one page (see api.http SESSION_PAGE_SIZE) and `OlderRuns` below
  // reaches further back on request.
  const sessions = useWorldStore((s) => s.sessions);
  const jobs = useWorldStore((s) => s.jobs);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [job, setJob] = useState("all");
  const [search, setSearch] = useState("");
  /* Which run's detail drawer is open, mirrored in the URL as `?session=`.
   * That makes a run addressable: the synthetic-full dialog links straight to
   * the run it started, and an operator can paste a run at a colleague. The
   * param is the source of truth so a pasted link opens the drawer on load,
   * not just on click. */
  const [searchParams, setSearchParams] = useSearchParams();
  const openRunId = searchParams.get("session");
  const setOpenRunId = (sessionId: string | null) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (sessionId) next.set("session", sessionId);
        else next.delete("session");
        return next;
      },
      // Opening and closing a drawer shouldn't build up history the back
      // button has to walk through.
      { replace: true },
    );
  };

  const runningCount = useMemo(() => sessions.filter((s) => s.status === "running").length, [sessions]);

  // Job options for the Select — only jobs that actually have runs.
  const jobOptions = useMemo(
    () =>
      jobs
        .filter((j) => sessions.some((s) => s.jobId === j.id))
        .map((j) => ({ id: j.id, name: j.name })),
    [jobs, sessions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .filter((s) => matchesStatus(s, status))
      .filter((s) => (job === "all" ? true : s.jobId === job))
      .filter((s) => {
        if (!q) return true;
        return (
          s.jobName.toLowerCase().includes(q) ||
          runKind(s).toLowerCase().includes(q) ||
          s.vmResults.some((r) => r.vmName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [sessions, status, job, search]);

  const isFiltered = status !== "all" || job !== "all" || search.trim() !== "";

  const resetFilters = () => {
    setStatus("all");
    setJob("all");
    setSearch("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {t("page.title")}
            {runningCount > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-info-subtle px-2 py-0.5 text-xs font-semibold text-info">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
                </span>
                {t("page.live")}
              </span>
            )}
          </span>
        }
        description={t("page.description")}
      />

      <ActivitySummary />

      <InProgress />

      <div className="space-y-3">
        <ActivityFilters
          status={status}
          onStatus={setStatus}
          job={job}
          onJob={setJob}
          jobOptions={jobOptions}
          search={search}
          onSearch={setSearch}
        />
        <RunFeed sessions={filtered} filtered={isFiltered} onReset={resetFilters} onOpen={setOpenRunId} />
        <OlderRuns />
      </div>

      <RunDetailDrawer sessionId={openRunId} onClose={() => setOpenRunId(null)} />
    </div>
  );
}

/**
 * The seam between what the console is holding and what the appliance has.
 *
 * The run feed above filters client-side over the loaded history, so the honest
 * thing to show at the bottom is how much of the appliance's history that is —
 * and a way to pull in more. Absent entirely when everything is already loaded
 * (and in the simulated world, which has no server to page).
 */
function OlderRuns() {
  const { t } = useTranslation("activity");
  const loaded = useWorldStore((s) => s.sessions.length);
  const total = useWorldStore((s) => s.sessionsTotal);
  const hasMore = useWorldStore((s) => s.sessionsHasMore);
  const loading = useWorldStore((s) => s.sessionsLoadingMore);
  const loadOlder = useWorldStore((s) => s.loadOlderSessions);

  if (!hasMore) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-3">
      <span className="nums text-xs text-muted-foreground">
        {t("older.showing", { loaded, total: Math.max(total, loaded) })}
      </span>
      <Button variant="outline" size="sm" onClick={() => void loadOlder()} disabled={loading}>
        {loading ? t("older.loading") : t("older.load")}
      </Button>
    </div>
  );
}
