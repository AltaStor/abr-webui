// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { History, Repeat, type LucideIcon } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useWorldStore } from "@/store/world";
import type { Replica } from "@/types";

export type ReplicaConfirmKind = "failback" | "undo";

interface ConfirmReplicaActionDialogProps {
  replica: Replica | null;
  kind: ReplicaConfirmKind | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Copy {
  icon: LucideIcon;
  title: (r: Replica) => string;
  description: (r: Replica) => React.ReactNode;
  confirm: string;
  pending: string;
  toastTitle: (r: Replica) => string;
  toastBody: (r: Replica) => string;
  destructive: boolean;
}

const COPY: Record<ReplicaConfirmKind, Copy> = {
  failback: {
    icon: Repeat,
    title: (r) => `Fail back to ${r.sourceVmName}?`,
    description: (r) => (
      <>
        AltaStor syncs changes made on the replica back to the original source, powers the replica
        down, and returns <span className="font-medium text-foreground">{r.sourceVmName}</span> to
        production. The replica goes back to standby and resumes protecting the source.
      </>
    ),
    confirm: "Fail back",
    pending: "Failing back…",
    toastTitle: (r) => `${r.sourceVmName} is back in production`,
    toastBody: (r) => `Control returned to the source · ${r.replicaName} is on standby again.`,
    destructive: false,
  },
  undo: {
    icon: History,
    title: (r) => `Undo failover of ${r.replicaName}?`,
    description: () => (
      <>
        This <span className="font-medium text-foreground">discards everything the replica wrote</span>{" "}
        while it was serving, powers it down, and puts it back on standby — as if the failover never
        happened. Use this when the source is healthy and you don&apos;t want the replica&apos;s
        changes.
      </>
    ),
    confirm: "Discard & undo",
    pending: "Undoing…",
    toastTitle: (r) => `Failover of ${r.replicaName} undone`,
    toastBody: () => "Failover writes discarded · the replica is back on standby.",
    destructive: true,
  },
};

/**
 * Confirm dialog shared by fail-back (return control to source) and undo-failover
 * (discard the replica's failover writes). Both are only reachable while a replica
 * is in the failover state.
 */
export function ConfirmReplicaActionDialog({
  replica,
  kind,
  open,
  onOpenChange,
}: ConfirmReplicaActionDialogProps) {
  const failbackReplica = useWorldStore((s) => s.failbackReplica);
  const undoFailover = useWorldStore((s) => s.undoFailover);
  const [submitting, setSubmitting] = useState(false);

  if (!replica || !kind) return null;
  const copy = COPY[kind];
  const Icon = copy.icon;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (kind === "failback") await failbackReplica(replica.id);
      else await undoFailover(replica.id);
      toast.success(copy.toastTitle(replica), { description: copy.toastBody(replica) });
      onOpenChange(false);
    } catch {
      toast.error("That didn't complete", {
        description: "Check the target host connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div
            className={cn(
              "mb-1 flex h-10 w-10 items-center justify-center",
              copy.destructive ? "bg-danger-subtle text-danger" : "bg-info-subtle text-info-text",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <DialogTitle>{copy.title(replica)}</DialogTitle>
          <DialogDescription>{copy.description(replica)}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={copy.destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={submitting}
          >
            <Icon className="h-4 w-4" />
            {submitting ? copy.pending : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
