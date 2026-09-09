// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ShieldAlert, Trash2 } from "@/lib/icons";
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
  const { t } = useTranslation("jobs");
  const deleteRestorePoint = useWorldStore((s) => s.deleteRestorePoint);
  const [deleting, setDeleting] = useState(false);
  const [gfsRefused, setGfsRefused] = useState(false);

  useEffect(() => {
    if (open) {
      setDeleting(false);
      setGfsRefused(false);
    }
  }, [open, target?.vm.vmId]);

  if (!target) return null;
  const { jobName, vm } = target;

  const protectedCount = vm.points.filter((p) => p.gfsProtected).length;
  const overridingGfs = protectedCount > 0 || gfsRefused;

  const oldest = vm.points.reduce((a, p) => (p.createdAt < a.createdAt ? p : a), vm.points[0]);
  const newest = vm.points.reduce((a, p) => (p.createdAt > a.createdAt ? p : a), vm.points[0]);

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const results = await Promise.all(
        vm.chainIds.map((chainId) => deleteRestorePoint(chainId, undefined, overridingGfs)),
      );
      if (results.some((r) => !r.ok && r.reason === "gfs-protected")) {
        setGfsRefused(true);
        return;
      }
      const failure = results.find((r) => !r.ok && r.reason === "error");
      if (failure && !failure.ok && failure.reason === "error") {
        toast.error(t("deleteBackup.errorTitle"), { description: failure.message });
        return;
      }
      toast.success(t("deleteBackup.successTitle"), {
        description: t("deleteBackup.successDesc", {
          count: vm.points.length,
          name: vm.name,
        }),
      });
      onOpenChange(false);
    } catch {
      toast.error(t("deleteBackup.errorTitle"), {
        description: t("deleteBackup.errorUnreachable"),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-danger-subtle text-danger">
            <Trash2 className="h-5 w-5" />
          </div>
          <DialogTitle>{t("deleteBackup.title")}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="deleteBackup.description"
              ns="jobs"
              values={{ vm: vm.name, job: jobName }}
              components={{
                1: <span className="font-medium text-foreground" />,
                2: <span className="font-medium text-foreground" />,
              }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {t("deleteBackup.pointsCount", { count: vm.points.length })}
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

        {overridingGfs && (
          <div className="flex items-start gap-2.5 border border-warning/30 bg-warning/10 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t("deleteBackup.gfsTitle")}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {protectedCount > 0
                  ? t("deleteBackup.gfsWarn", { count: protectedCount })
                  : t("deleteBackup.gfsWarnUnknown")}
              </p>
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          <Trans
            i18nKey="deleteBackup.warning"
            ns="jobs"
            values={{ vm: vm.name }}
            components={{ 1: <span className="font-medium text-foreground" /> }}
          />
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={() => void handleConfirm()}>
            <Trash2 className="h-4 w-4" />
            {deleting
              ? t("deleteBackup.deleting")
              : overridingGfs
                ? t("deleteBackup.gfsConfirm")
                : t("deleteBackup.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
