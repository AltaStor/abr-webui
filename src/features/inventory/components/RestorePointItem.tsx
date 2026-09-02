// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Lock, RotateCcw, ServerOff, Trash2 } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative, formatStorage } from "@/lib/format";
import { compressionRatioLabel, pointTypeTooltip } from "@/lib/restore-points";
import type { RestorePoint } from "@/types";

/**
 * One restore point row. Shared by the VM detail page and the Backups page so a
 * point looks and behaves identically wherever you find it.
 */
export function RestorePointItem({
  point,
  unavailable,
  onRestore,
  onDelete,
  restoreBlockedReason,
}: {
  point: RestorePoint;
  unavailable: boolean;
  onRestore: () => void;
  onDelete: () => void;
  /** Why restore is unavailable for reasons other than an offline repository —
   *  e.g. the source VM is gone from inventory. Shown, not hidden. */
  restoreBlockedReason?: string;
}) {
  const { t } = useTranslation("inventory");
  const offlineTip = t("point.offlineTip");
  const restoreDisabled = unavailable || restoreBlockedReason !== undefined;
  return (
    <li className={cn("group flex items-center gap-3 py-2.5", unavailable && "opacity-60")}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold uppercase",
          point.type === "full" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {point.type === "full" ? "F" : "I"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{formatDateTime(point.createdAt)}</span>
          <Badge
            variant={point.type === "full" ? "default" : "secondary"}
            className="font-normal capitalize"
            title={pointTypeTooltip(point.type)}
          >
            {point.type}
          </Badge>
          {unavailable && (
            <Badge
              variant="outline"
              className="gap-1 border-warning/40 font-normal text-warning-text"
              title={offlineTip}
            >
              <ServerOff className="h-3 w-3" />
              {t("point.unavailable")}
            </Badge>
          )}
          {point.encrypted && (
            <Badge
              variant="outline"
              className="gap-1 font-normal text-muted-foreground"
              title={t("point.encryptedTip")}
            >
              <Lock className="h-3 w-3" />
              {t("point.encrypted")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatRelative(point.createdAt)} · {point.jobName}
          {point.compressionLevel != null && ` · ${t("point.compression", { level: point.compressionLevel })}`}
        </p>
      </div>
      {/* sizeGB is 0 for points the catalog couldn't measure (e.g. pre-fix
          history) — render nothing rather than claim a measured "0 B" backup.
          It is the STORED size; the real data behind it goes underneath. */}
      {point.sizeGB > 0 && (
        <span
          className="hidden shrink-0 text-right sm:block"
          title={
            point.logicalGB != null
              ? t("point.storedTitle", {
                  logical: formatStorage(point.logicalGB, 1),
                  stored: formatStorage(point.sizeGB, 1),
                })
              : undefined
          }
        >
          <span className="nums block text-sm text-muted-foreground">
            {formatStorage(point.sizeGB, 1)}
          </span>
          {point.logicalGB != null && (
            <span className="nums block text-[11px] text-muted-foreground/80">
              {t("point.fromLogical", { size: formatStorage(point.logicalGB, 1) })}
              {compressionRatioLabel(point.compressionRatio) &&
                ` · ${compressionRatioLabel(point.compressionRatio)}`}
            </span>
          )}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={onRestore}
          disabled={restoreDisabled}
          title={unavailable ? offlineTip : restoreBlockedReason}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("actions.restore")}
        </Button>
        {/* Deletion is segment-granular (a full backup + its incrementals) —
            only the full backup's row can trigger it. */}
        {point.type === "full" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("point.deleteAria")}
            title={unavailable ? offlineTip : t("point.deleteTip")}
            className="text-muted-foreground/70 hover:bg-danger/10 hover:text-danger"
            onClick={onDelete}
            disabled={unavailable}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}
