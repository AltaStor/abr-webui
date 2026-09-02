// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { StatusPill } from "@/components/StatusPill";
import type { Replica } from "@/types";
import { replicaStateMeta } from "../lib";

interface ReplicaStateBadgeProps {
  replica: Replica;
  size?: "sm" | "md";
  className?: string;
}

/** The lifecycle pill for a replica. Delegates to `replicaStateMeta`, which maps the raw state to a tone/label. */
export function ReplicaStateBadge({ replica, size = "md", className }: ReplicaStateBadgeProps) {
  return <StatusPill meta={replicaStateMeta(replica)} size={size} className={className} />;
}
