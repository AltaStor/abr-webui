// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  History,
  Layers,
  Power,
  Repeat,
  Server,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Metric } from "@/components/Metric";
import { formatDateTime, formatRelative, formatStorage } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform";
import type { Replica } from "@/types";
import { ReplicaStateBadge } from "./ReplicaStateBadge";
import { ReplicaActionsMenu, type ReplicaActions } from "./ReplicaActionsMenu";

interface ReplicaCardProps {
  replica: Replica;
  actions: ReplicaActions;
}

export function ReplicaCard({ replica, actions }: ReplicaCardProps) {
  const { t } = useTranslation("replication");
  const inFailover = replica.state === "failover";
  const crossPlatform = replica.sourcePlatform !== replica.targetPlatform;
  const sourceShort = PLATFORM_META[replica.sourcePlatform].short;
  const targetShort = PLATFORM_META[replica.targetPlatform].short;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden border bg-card transition-colors duration-250 hover:shadow-pop",
        inFailover
          ? "border-warning/40 hover:border-warning/60"
          : "border-border hover:border-border",
      )}
    >
      {/* Failover accent rail — this replica is live and serving */}
      {inFailover && (
        <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-warning" />
      )}

      {/* Kebab overlay */}
      <div className="absolute right-3 top-3 z-20">
        <ReplicaActionsMenu replica={replica} {...actions} />
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Header: replica name + state pill */}
        <div className="flex items-start justify-between gap-3 pr-9">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center",
                inFailover ? "bg-warning-subtle text-warning-text" : "bg-muted text-muted-foreground",
              )}
            >
              {inFailover ? <Power className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight" title={replica.replicaName}>
                {replica.replicaName}
              </h3>
              <p
                className="mt-0.5 truncate text-xs text-muted-foreground"
                title={replica.jobName}
              >
                {t("card.from", { job: replica.jobName })}
              </p>
            </div>
          </div>
          <ReplicaStateBadge replica={replica} size="sm" />
        </div>

        {/* Running indicator when powered on */}
        {replica.poweredOn && (
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 bg-warning-subtle px-2 py-0.5 text-[11px] font-medium text-warning-text">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
              {t("card.poweredOn")}
            </span>
          </div>
        )}

        {/* Source → target topology */}
        <div className="mt-4 flex items-center gap-2 border border-border bg-muted/30 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={replica.sourceVmName}>
              {replica.sourceVmName}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Server className="h-3 w-3 shrink-0" />
              {t("card.source", { platform: sourceShort })}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-medium" title={replica.targetEnvironmentName}>
              {replica.targetEnvironmentName}
            </p>
            <p className="mt-0.5 flex items-center justify-end gap-1 truncate text-[11px] text-muted-foreground">
              <Server className="h-3 w-3 shrink-0" />
              {replica.targetHostName ?? t("card.target", { platform: targetShort })}
            </p>
          </div>
        </div>

        {/* Cross-platform note */}
        {crossPlatform && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-info-text">
            <Repeat className="h-3 w-3 shrink-0" />
            {t("card.crossPlatform", { source: sourceShort, target: targetShort })}
          </div>
        )}

        {/* Metric chips: last sync · recovery points · size */}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Metric
            icon={History}
            label={t("card.lastSync")}
            value={formatRelative(replica.lastSyncAt)}
            sub={replica.lastSyncAt ? formatDateTime(replica.lastSyncAt) : undefined}
          />
          <Metric icon={Layers} label={t("card.recoveryPoints")} value={replica.points.length.toString()} />
          <Metric icon={Server} label={t("card.replicaSize")} value={formatStorage(replica.sizeGB, 0)} />
        </div>

        {/* Primary action */}
        <div className="mt-4 flex items-center gap-2">
          {inFailover ? (
            <>
              <Button variant="outline" size="sm" className="flex-1" onClick={actions.onFailback}>
                <Repeat className="h-4 w-4" />
                {t("card.failBack")}
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={actions.onUndoFailover}>
                <History className="h-4 w-4" />
                {t("card.undo")}
              </Button>
            </>
          ) : (
            <Button
              variant={replica.state === "seeding" ? "outline" : "secondary"}
              size="sm"
              className="flex-1"
              disabled={replica.state === "seeding"}
              onClick={actions.onFailover}
            >
              <Power className="h-4 w-4" />
              {replica.state === "seeding" ? t("card.seeding") : t("card.failOver")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
