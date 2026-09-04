// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Copy,
  CopyPlus,
  Plus,
  Power,
  ShieldCheck,
  Timer,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { KpiCard } from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";
import { jobTypeMeta } from "@/features/jobs/lib";
import { useWorldStore } from "@/store/world";
import type { Replica } from "@/types";
import { ReplicaCard } from "./components/ReplicaCard";
import { FailoverDialog } from "./components/FailoverDialog";
import {
  ConfirmReplicaActionDialog,
  type ReplicaConfirmKind,
} from "./components/ConfirmReplicaActionDialog";
import { isInSync } from "./lib";

export default function ReplicationPage() {
  const { t } = useTranslation("replication");
  const replicas = useWorldStore((s) => s.replicas);
  const jobs = useWorldStore((s) => s.jobs);

  // Dialog state — one active replica, driven by the card/menu actions.
  const [failoverId, setFailoverId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: ReplicaConfirmKind } | null>(null);

  const failoverReplica = replicas.find((r) => r.id === failoverId) ?? null;
  const confirmReplica = confirm ? (replicas.find((r) => r.id === confirm.id) ?? null) : null;

  const replicationJobs = useMemo(
    () => jobs.filter((j) => j.type === "replication"),
    [jobs],
  );

  const summary = useMemo(() => {
    const total = replicas.length;
    const inSync = replicas.filter(isInSync).length;
    const failedOver = replicas.filter((r) => r.state === "failover").length;
    return { total, inSync, failedOver };
  }, [replicas]);

  const actionsFor = (replica: Replica) => ({
    onFailover: () => setFailoverId(replica.id),
    onFailback: () => setConfirm({ id: replica.id, kind: "failback" }),
    onUndoFailover: () => setConfirm({ id: replica.id, kind: "undo" }),
  });

  const newJobButton = (
    <Button asChild>
      <Link to="/jobs/new/replication">
        <Plus className="h-4 w-4" />
        {t("page.newJob")}
      </Link>
    </Button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={replicas.length > 0 ? newJobButton : undefined}
      />

      {replicas.length === 0 ? (
        <div className="border border-dashed border-border bg-card">
          <EmptyState
            icon={CopyPlus}
            title={t("page.empty.title")}
            description={t("page.empty.description")}
            action={newJobButton}
          />
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label={t("page.kpi.replicas")}
              value={summary.total}
              icon={Copy}
              tone="info"
              hint={t("page.kpi.acrossJobs", { count: replicationJobs.length })}
            />
            <KpiCard
              label={t("page.kpi.inSync")}
              value={summary.inSync}
              icon={ShieldCheck}
              tone="success"
              hint={
                summary.inSync === summary.total
                  ? t("page.kpi.allReady")
                  : t("page.kpi.someSyncing")
              }
            />
            <KpiCard
              label={t("page.kpi.failedOver")}
              value={summary.failedOver}
              icon={Power}
              tone={summary.failedOver > 0 ? "warning" : "muted"}
              hint={summary.failedOver > 0 ? t("page.kpi.servingDr") : t("page.kpi.noActiveFailovers")}
            />
          </div>

          {/* Replica grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {replicas.map((replica) => (
              <ReplicaCard key={replica.id} replica={replica} actions={actionsFor(replica)} />
            ))}
          </div>

          {/* Replication jobs */}
          {replicationJobs.length > 0 && (
            <div className="border border-border bg-card p-5 ">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{t("page.jobsSection.title")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("page.jobsSection.subtitle")}
                  </p>
                </div>
                <span className="nums text-xs text-muted-foreground">{replicationJobs.length}</span>
              </div>
              <ul className="space-y-1.5">
                {replicationJobs.map((job) => {
                  const { icon: TypeIcon } = jobTypeMeta(job.type);
                  const jobReplicas = replicas.filter((r) => r.jobId === job.id);
                  return (
                    <li key={job.id}>
                      <Link
                        to={`/jobs/${job.id}`}
                        className="group flex items-center justify-between gap-3 border border-border px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/50"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center",
                              job.state === "running"
                                ? "bg-info-subtle text-info-text"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <TypeIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{job.name}</span>
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <Timer className="h-3 w-3" />
                              {t("page.jobsSection.replicaCount", { count: jobReplicas.length })}
                              <span className="text-muted-foreground/50">·</span>
                              {t("page.jobsSection.lastRun", { when: formatRelative(job.lastRunAt) })}
                              {job.lastRunAt && (
                                <>
                                  <span className="text-muted-foreground/50">·</span>
                                  <span className="nums">{formatDateTime(job.lastRunAt)}</span>
                                </>
                              )}
                            </span>
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Failover flow */}
      <FailoverDialog
        replica={failoverReplica}
        open={failoverId !== null}
        onOpenChange={(open) => !open && setFailoverId(null)}
      />
      <ConfirmReplicaActionDialog
        replica={confirmReplica}
        kind={confirm?.kind ?? null}
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      />
    </div>
  );
}
