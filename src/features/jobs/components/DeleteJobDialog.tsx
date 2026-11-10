// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { AlertTriangle } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import i18n from "@/i18n";
import type { JobDeleteOutcome } from "@/store/world";
import type { BackupJob } from "@/types";

/** The dialog's `replica` for a replication job; undefined for any other. */
export function replicaOf(job: BackupJob | null | undefined): DeleteJobDialogProps["replica"] {
  const r = job?.replication;
  if (!r) return undefined;
  return { name: r.replica.vmId ? (r.replica.vmName ?? r.replicaName) : null, target: r.targetEnvironment?.name ?? null };
}

/** The line under "Deleted …": what stayed. A replication job deleted with its
 *  replica gets the appliance's own account — what it removed, kept or could
 *  not delete is more than the console can say. */
export function deletedDescription(job: BackupJob, outcome: JobDeleteOutcome): string {
  if (outcome.message) return outcome.message;
  if (job.type !== "replication") return i18n.t("jobs:toast.pointsSafe");
  const name = job.replication?.replica.vmId ? (job.replication.replica.vmName ?? job.replication.replicaName) : null;
  return name
    ? i18n.t("jobs:repl.delete.replicaKept", { name, target: job.replication?.targetEnvironment?.name ?? "" })
    : i18n.t("jobs:repl.delete.noReplica");
}

interface DeleteJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of a single job, or a count summary for bulk. */
  label: string;
  count?: number;
  /** How many of the jobs have a run in flight right now. The confirmation
   *  re-reads it while open, so a run that starts after the dialog opened
   *  still disables Delete. */
  runningCount?: number;
  /** One replication job: its replica VM and target, to offer deleting the
   *  replica with it. The name is null while no run has created one. */
  replica?: { name: string | null; target: string | null };
  /** Bulk: how many of the jobs are replication jobs, whose replicas stay. */
  replicationCount?: number;
  onConfirm: (opts: { deleteReplica: boolean }) => void;
}

/** Confirmation before deleting one or more jobs. Restore points are kept, and
 *  so is a replication job's replica VM unless the operator asks otherwise. */
export function DeleteJobDialog({
  open,
  onOpenChange,
  label,
  count = 1,
  runningCount = 0,
  replica,
  replicationCount = 0,
  onConfirm,
}: DeleteJobDialogProps) {
  const { t } = useTranslation("jobs");
  const plural = count > 1;
  const blocked = runningCount > 0;
  // Off every time the dialog opens: deleting a VM is never carried over.
  const [deleteReplica, setDeleteReplica] = useState(false);
  useEffect(() => {
    if (open) setDeleteReplica(false);
  }, [open]);
  const body = replica
    ? replica.name
      ? t("repl.delete.body", { name: replica.name, target: replica.target ?? t("common:generic.na") })
      : t("repl.delete.bodyNoReplica")
    : t("delete.body");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-danger-subtle text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>
            {plural ? t("delete.titleMany", { count }) : t("delete.titleOne")}
          </DialogTitle>
          <DialogDescription>
            {plural ? (
              <>{t("delete.leadMany", { count })} </>
            ) : (
              <>
                <Trans
                  i18nKey="delete.leadOne"
                  ns="jobs"
                  values={{ name: label }}
                  components={{ 1: <span className="font-medium text-foreground" /> }}
                />{" "}
              </>
            )}
            {body}
            {plural && replicationCount > 0 && ` ${t("repl.delete.bulkKept", { count: replicationCount })}`}
          </DialogDescription>
        </DialogHeader>
        {replica?.name && (
          <label className="flex cursor-pointer items-start gap-2.5 border border-border bg-muted/20 px-3 py-2.5 text-sm">
            <Checkbox
              checked={deleteReplica}
              onCheckedChange={(v) => setDeleteReplica(v === true)}
              className="mt-0.5"
              aria-label={t("repl.delete.alsoReplica", { name: replica.name })}
            />
            <span>
              <span className="block font-medium">{t("repl.delete.alsoReplica", { name: replica.name })}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t("repl.delete.alsoReplicaHint")}</span>
            </span>
          </label>
        )}
        {blocked && (
          <p role="status" className="flex items-start gap-2 border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{plural ? t("delete.runningMany", { count: runningCount }) : t("delete.runningOne")}</span>
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={blocked}
            onClick={() => {
              if (blocked) return;
              onConfirm({ deleteReplica: Boolean(replica?.name) && deleteReplica });
              onOpenChange(false);
            }}
          >
            {plural
              ? t("delete.confirmMany")
              : deleteReplica && replica?.name
                ? t("repl.delete.confirmWithReplica")
                : t("delete.confirmOne")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
