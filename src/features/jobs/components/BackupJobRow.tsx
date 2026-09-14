// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronRight, History } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative, formatStorage } from "@/lib/format";
import {
  compressionRatioLabel,
  type RestorePointJobGroup,
  type RestorePointJobVmGroup,
} from "@/lib/restore-points";
import type { BackupJob, RestorePoint } from "@/types";
import { accentColor, jobTypeMeta } from "../lib";
import { BackupJobVmRow } from "./BackupJobVmRow";

/**
 * One job in the Backups tree: header (job identity, orphan badge, aggregate
 * stats) and — expanded — the VMs that job produced restore points for. Each
 * VM is its own disclosure with its own restore points list; the job row
 * itself carries no actions, since verify, restore and delete all act on one
 * VM's chain rather than on the job.
 */
export function BackupJobRow({
  group,
  job,
  isOpen,
  onToggle,
  openVmIds,
  onToggleVm,
  sortDir,
  offlineRepoIds,
  verifyingVmIds,
  onVerifyVm,
  onSyntheticFullVm,
  onRestoreVm,
  onRestorePoint,
  onDeleteVm,
}: {
  group: RestorePointJobGroup;
  job: BackupJob | undefined;
  isOpen: boolean;
  onToggle: () => void;
  openVmIds: Set<string>;
  onToggleVm: (vmId: string) => void;
  sortDir: "asc" | "desc";
  offlineRepoIds: Set<string>;
  /** VM ids under THIS job whose chains are being verified right now. */
  verifyingVmIds: Set<string>;
  onVerifyVm: (vm: RestorePointJobVmGroup) => void;
  onSyntheticFullVm: (vm: RestorePointJobVmGroup) => void;
  onRestoreVm: (vm: RestorePointJobVmGroup) => void;
  onRestorePoint: (vm: RestorePointJobVmGroup, point: RestorePoint) => void;
  onDeleteVm: (vm: RestorePointJobVmGroup) => void;
}) {
  const { t } = useTranslation("jobs");
  /** Why a source-less backup can't be restored from here — shown, not hidden.
   *  The restore wizard resolves its target VM from inventory, so a point whose
   *  VM is gone has nothing to restore onto until that VM is re-added. */
  const removedRestoreTip = t("backupsTab.removedTip");
  const typeMeta = job ? jobTypeMeta(job.type) : null;
  const TypeIcon = typeMeta?.icon ?? History;
  const pointCount = group.points.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-3 py-3 pl-4 pr-4 text-left transition-colors hover:bg-muted/40"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-90",
            )}
          />
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted/60"
            style={{ color: job ? accentColor(job.accent) : undefined }}
          >
            <TypeIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <span className="truncate">{group.jobName}</span>
              {group.orphaned && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-warning/40 font-normal text-warning-text"
                  title={t("backupsTab.noActiveJobTip")}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {t("backupsTab.noActiveJob")}
                </Badge>
              )}
            </CardTitle>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="nums">{t("rp.pointsShort", { count: pointCount })}</span>
              <span aria-hidden>·</span>
              <span className="nums">{t("backupsTab.vmCount", { count: group.vms.length })}</span>
              {group.storedGB > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="nums">
                    {t("backupsTab.storedShort", { size: formatStorage(group.storedGB) })}
                  </span>
                </>
              )}
              {group.logicalGB != null && (
                <>
                  <span aria-hidden>·</span>
                  <span className="nums" title={t("backupsTab.logicalTitle")}>
                    {t("backupsTab.fromLogical", { size: formatStorage(group.logicalGB) })}
                    {compressionRatioLabel(group.compressionRatio) &&
                      ` (${compressionRatioLabel(group.compressionRatio)})`}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>
                {t("rp.latest", {
                  rel: formatRelative(group.latest),
                  abs: formatDateTime(group.latest),
                })}
              </span>
            </span>
          </span>
        </button>
      </CardHeader>
      {isOpen && (
        <CardContent className="pt-0">
          <ul className="divide-y divide-border/60 border-t border-border">
            {group.vms.map((vm) => (
              <BackupJobVmRow
                key={vm.vmId}
                jobName={group.jobName}
                vm={vm}
                isOpen={openVmIds.has(vm.vmId)}
                onToggle={() => onToggleVm(vm.vmId)}
                sortDir={sortDir}
                offlineRepoIds={offlineRepoIds}
                restoreBlockedReason={vm.removed ? removedRestoreTip : undefined}
                verifying={verifyingVmIds.has(vm.vmId)}
                onVerify={() => onVerifyVm(vm)}
                onSyntheticFull={() => onSyntheticFullVm(vm)}
                onRestore={() => onRestoreVm(vm)}
                onRestorePoint={(point) => onRestorePoint(vm, point)}
                onDelete={() => onDeleteVm(vm)}
              />
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
