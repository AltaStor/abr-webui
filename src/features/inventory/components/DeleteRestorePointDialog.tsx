// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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
import { segmentChainPoints } from "@/lib/restore-points";
import { useWorldStore } from "@/store/world";
import type { RestorePoint } from "@/types";

interface DeleteRestorePointDialogProps {
  /** The full backup whose delete button was clicked — the segment anchor.
   *  `RestorePointItem` only renders a delete button on full-backup rows, so
   *  this is never an incremental. */
  point: RestorePoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation for removing one full backup and the incrementals chained onto
 * it (its segment). There is no single-point delete — an incremental never
 * has its own delete button — and deleting a segment never touches other
 * full-backup generations sharing the same chain.
 */
export function DeleteRestorePointDialog({
  point,
  open,
  onOpenChange,
}: DeleteRestorePointDialogProps) {
  const { t } = useTranslation("inventory");
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const deleteRestorePoint = useWorldStore((s) => s.deleteRestorePoint);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) setDeleting(false);
  }, [open, point?.id]);

  const segment = useMemo(() => {
    if (!point) return [];
    const chainPoints = restorePoints.filter((p) => p.chainId === point.chainId);
    return segmentChainPoints(chainPoints).find((seg) => seg.id === point.id)?.points ?? [point];
  }, [restorePoints, point]);

  if (!point) return null;

  const sizeGB = segment.reduce((a, p) => a + p.sizeGB, 0);
  const oldest = segment.reduce((a, p) => (p.createdAt < a.createdAt ? p : a), point);
  const newest = segment.reduce((a, p) => (p.createdAt > a.createdAt ? p : a), point);

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await deleteRestorePoint(point.chainId, point.id);
      if (res.ok) {
        toast.success(t("deleteOne.deletedTitle"), {
          description: t("deleteOne.deletedDesc", { count: segment.length, name: point.vmName }),
        });
        onOpenChange(false);
        return;
      }
      if (res.reason === "not-found") {
        toast.success(t("deleteOne.alreadyTitle"), {
          description: t("deleteOne.alreadyDesc"),
        });
        onOpenChange(false);
      } else {
        toast.error(t("deleteOne.errorTitle"), { description: res.message });
      }
    } catch {
      toast.error(t("deleteOne.errorTitle"), {
        description: t("deleteOne.errorDesc"),
      });
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
          <DialogTitle>{t("deleteOne.title")}</DialogTitle>
          <DialogDescription>{t("deleteOne.desc")}</DialogDescription>
        </DialogHeader>

        {/* Segment summary — the full backup and every incremental chained onto it. */}
        <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t("deleteOne.pointCount", { count: segment.length })}</span>
            <span className="nums text-muted-foreground">{formatStorage(sizeGB, 1)}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {oldest.createdAt === newest.createdAt
              ? formatDateTime(newest.createdAt)
              : t("deleteOne.range", {
                  from: formatDateTime(oldest.createdAt),
                  to: formatDateTime(newest.createdAt),
                })}
            {" · "}
            {point.jobName}
          </p>
        </div>

        <div className="text-xs leading-relaxed text-muted-foreground">
          <p>
            <Trans
              i18nKey="deleteOne.recoverWarn"
              ns="inventory"
              values={{ name: point.vmName }}
              components={{ 1: <span className="font-medium text-foreground" /> }}
            />
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={() => void handleConfirm()}>
            <Trash2 className="h-4 w-4" />
            {deleting ? t("deleteOne.deleting") : t("deleteOne.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
