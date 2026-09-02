// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

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
import { formatRelative, formatStorage } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform";
import type { Replica } from "@/types";
import { ReplicaStateBadge } from "./ReplicaStateBadge";
import { ReplicaActionsMenu, type ReplicaActions } from "./ReplicaActionsMenu";

interface ReplicaCardProps {
  replica: Replica;
  actions: ReplicaActions;
}

export function ReplicaCard({ replica, actions }: ReplicaCardProps) {
  const inFailover = replica.state === "failover";
  const crossPlatform = replica.sourcePlatform !== replica.targetPlatform;
  const sourceShort = PLATFORM_META[replica.sourcePlatform].short;
  const targetShort = PLATFORM_META[replica.targetPlatform].short;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-card transition-all hover:shadow-pop",
        inFailover
          ? "border-warning/40 hover:border-warning/60"
          : "border-border/70 hover:border-border",
      )}
    >
      {/* Failover accent rail — this replica is live and serving */}
      {inFailover && (
        <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-gradient-to-r from-warning/0 via-warning to-warning/0" />
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
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
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
                from {replica.jobName}
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
              Powered on · serving traffic
            </span>
          </div>
        )}

        {/* Source → target topology */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={replica.sourceVmName}>
              {replica.sourceVmName}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Server className="h-3 w-3 shrink-0" />
              {sourceShort} source
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-medium" title={replica.targetEnvironmentName}>
              {replica.targetEnvironmentName}
            </p>
            <p className="mt-0.5 flex items-center justify-end gap-1 truncate text-[11px] text-muted-foreground">
              <Server className="h-3 w-3 shrink-0" />
              {replica.targetHostName ?? `${targetShort} target`}
            </p>
          </div>
        </div>

        {/* Cross-platform note */}
        {crossPlatform && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-info-text">
            <Repeat className="h-3 w-3 shrink-0" />
            Cross-platform · {sourceShort} → {targetShort} (converted on failover)
          </div>
        )}

        {/* Metric chips: last sync · recovery points · size */}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
          <Metric icon={History} label="Last sync" value={formatRelative(replica.lastSyncAt)} />
          <Metric icon={Layers} label="Recovery points" value={replica.points.length.toString()} />
          <Metric icon={Server} label="Replica size" value={formatStorage(replica.sizeGB, 0)} />
        </div>

        {/* Primary action */}
        <div className="mt-4 flex items-center gap-2">
          {inFailover ? (
            <>
              <Button variant="outline" size="sm" className="flex-1" onClick={actions.onFailback}>
                <Repeat className="h-4 w-4" />
                Fail back
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={actions.onUndoFailover}>
                <History className="h-4 w-4" />
                Undo
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
              {replica.state === "seeding" ? "Seeding…" : "Fail over"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof History;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate nums font-semibold" title={value}>
        {value}
      </div>
    </div>
  );
}
