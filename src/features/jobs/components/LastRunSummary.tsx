// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertTriangle, XCircle } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { SESSION_META } from "@/lib/status";
import { formatDuration, formatRelative, formatStorage, formatThroughput } from "@/lib/format";
import type { Session } from "@/types";

/**
 * The most recent finished run of a job — shown on the Overview when nothing is
 * live, so the live panel never just vanishes to nothing. It reflects the REAL
 * outcome (for agent-backed VMs the session doesn't reach this state until the
 * bytes are actually in the repository, so "Transferred" is the true stored
 * footprint, not a simulated estimate).
 */
export function LastRunSummary({ session }: { session: Session }) {
  const { t } = useTranslation("jobs");
  const meta = SESSION_META[session.status] ?? SESSION_META.success;
  const Icon =
    session.status === "failed"
      ? XCircle
      : session.status === "warning"
        ? AlertTriangle
        : CheckCircle2;
  const tone =
    session.status === "failed"
      ? "text-danger"
      : session.status === "warning"
        ? "text-warning"
        : "text-success";

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon className={`h-5 w-5 ${tone}`} />
          <div>
            <h3 className="text-sm font-semibold">{t("lastRun.title")}</h3>
            <p className="text-xs text-muted-foreground">
              {session.finishedAt ? formatRelative(session.finishedAt) : t("common:generic.na")}
            </p>
          </div>
        </div>
        <StatusPill meta={meta} size="sm" />
      </div>

      {session.message && (
        <p className="mt-3 text-sm text-muted-foreground">{session.message}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("objects.vms")} value={`${session.vmCount}`} />
        <Metric label={t("metrics.processed")} value={formatStorage(session.processedGB)} />
        <Metric label={t("metrics.transferred")} value={formatStorage(session.transferredGB)} />
        <Metric label={t("metrics.duration")} value={formatDuration(session.durationSec)} />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground/70">
        {t("lastRun.avgPrefix")} {formatThroughput(session.throughputMBps)} ·{" "}
        {session.backupType === "incremental" ? t("runType.incremental") : t("runType.full")} {t("lastRun.kindBackup")}
      </p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="nums mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
