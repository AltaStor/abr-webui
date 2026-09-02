// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { History, MoreHorizontal, Power, RotateCw } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Replica } from "@/types";

export interface ReplicaActions {
  onFailover: () => void;
  onFailback: () => void;
  onUndoFailover: () => void;
}

interface ReplicaActionsMenuProps extends ReplicaActions {
  replica: Replica;
  triggerSize?: "sm" | "default";
}

/**
 * Kebab of DR actions for a replica. Which actions are live depends on the
 * lifecycle: a standing replica can fail over; a replica already in failover
 * can fail back (return to source) or undo (discard failover writes). Seeding
 * replicas can't fail over yet.
 */
export function ReplicaActionsMenu({
  onFailover,
  onFailback,
  onUndoFailover,
  replica,
  triggerSize = "sm",
}: ReplicaActionsMenuProps) {
  const inFailover = replica.state === "failover";
  const canFailover = replica.state !== "failover" && replica.state !== "seeding";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={triggerSize === "sm" ? "icon-sm" : "icon"}
          aria-label={`Manage ${replica.replicaName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="min-w-[13rem]">
        {inFailover ? (
          <>
            <DropdownMenuItem onSelect={onFailback}>
              <RotateCw className="h-4 w-4" />
              Fail back to source
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onUndoFailover}>
              <History className="h-4 w-4" />
              Undo failover
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={onFailover} disabled={!canFailover}>
            <Power className="h-4 w-4" />
            {canFailover ? "Fail over…" : "Seeding — can't fail over"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
