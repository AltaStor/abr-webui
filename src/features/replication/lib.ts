// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import {
  CheckCircle2,
  Loader2,
  Power,
  RotateCw,
  XCircle,
  type LucideIcon,
} from "@/lib/icons";
import type { Replica, ReplicaState } from "@/types";
import type { StatusMeta } from "@/lib/status";

/** Replica lifecycle → status pill. */
export const REPLICA_STATE_META: Record<ReplicaState, StatusMeta> = {
  seeding: { label: "Seeding", tone: "info", icon: Loader2 },
  ready: { label: "In sync", tone: "success", icon: CheckCircle2 },
  syncing: { label: "Syncing", tone: "info", icon: Loader2 },
  failover: { label: "Failover — active", tone: "warning", icon: Power },
  failback: { label: "Failing back", tone: "info", icon: RotateCw },
  error: { label: "Error", tone: "danger", icon: XCircle },
};

/** Resolve the pill meta for a replica's lifecycle state. */
export function replicaStateMeta(replica: Replica): StatusMeta {
  return REPLICA_STATE_META[replica.state];
}

/** A replica is "in sync" once it's finished seeding and reached ready. */
export function isInSync(replica: Replica): boolean {
  return replica.state === "ready";
}

export const FAILOVER_ICON: LucideIcon = Power;
