// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { Trash2 } from "@/lib/icons";
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
import { formatDateTime, formatStorage } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { RestorePointJobVmGroup } from "@/lib/restore-points";

export interface DeleteJobVmBackupsTarget {
  jobName: string;
  vm: RestorePointJobVmGroup;
}

/**
 * Confirmation for removing a VM's entire backup history within one job —
 * every chain (normally just one; more only if the job's target repository
 * changed over the VM's history) and every point on it, full and incremental
 * alike. This is the only delete surface on the Backups tab: there is no
 * per-point or per-full-backup delete here, so a click can never take out
 * more or less than "this VM, from this job".
 */
export function DeleteJobVmBackupsDialog({
  target,
  open,
  onOpenChange,
}: {
  target: DeleteJobVmBackupsTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteRestorePoint = useWorldStore((s) => s.deleteRestorePoint);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) setDeleting(false);
  }, [open, target?.vm.vmId]);

  if (!target) return null;
  const { jobName, vm } = target;

  const oldest = vm.points.reduce((a, p) => (p.createdAt < a.createdAt ? p : a), vm.points[0]);
  const newest = vm.points.reduce((a, p) => (p.createdAt > a.createdAt ? p : a), vm.points[0]);

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const results = await Promise.all(vm.chainIds.map((chainId) => deleteRestorePoint(chainId)));
      const failure = results.find((r) => !r.ok && r.reason === "error");
      if (failure && !failure.ok && failure.reason === "error") {
        toast.error("Couldn't delete backup", { description: failure.message });
        return;
      }
      toast.success("Backup deleted", {
        description: `${vm.points.length} restore point${vm.points.length === 1 ? "" : "s"} removed for ${vm.name}.`,
      });
      onOpenChange(false);
    } catch {
      toast.error("Couldn't delete backup", { description: "Appliance unreachable" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-danger-subtle text-danger">
            <Trash2 className="h-5 w-5" />
          </div>
          <DialogTitle>Delete backup?</DialogTitle>
          <DialogDescription>
            This removes every restore point <span className="font-medium text-foreground">{vm.name}</span>{" "}
            has from <span className="font-medium text-foreground">{jobName}</span> — the full backup and
            every incremental chained onto it.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {vm.points.length} restore point{vm.points.length === 1 ? "" : "s"}
            </span>
            {vm.storedGB > 0 && (
              <span className="nums text-muted-foreground">{formatStorage(vm.storedGB, 1)}</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {oldest.createdAt === newest.createdAt
              ? formatDateTime(newest.createdAt)
              : `${formatDateTime(oldest.createdAt)} – ${formatDateTime(newest.createdAt)}`}
          </p>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          This can't be undone. <span className="font-medium text-foreground">{vm.name}</span> won't be
          recoverable from these points once they're gone.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={() => void handleConfirm()}>
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting…" : "Delete backup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
