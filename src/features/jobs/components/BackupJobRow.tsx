// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { AlertTriangle, ChevronRight, History } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRelative, formatStorage } from "@/lib/format";
import {
  compressionRatioLabel,
  type RestorePointJobGroup,
  type RestorePointJobVmGroup,
} from "@/lib/restore-points";
import type { BackupJob } from "@/types";
import { accentColor, jobTypeMeta } from "../lib";
import { BackupJobVmRow } from "./BackupJobVmRow";

/** Why a source-less backup can't be restored from here — shown, not hidden.
 *  The restore wizard resolves its target VM from inventory, so a point whose
 *  VM is gone has nothing to restore onto until that VM is re-added. */
const REMOVED_RESTORE_TIP =
  "The source VM of this backup isn't in inventory (removed, or discovered by another appliance). Re-add the same VM and these points restore normally.";

/**
 * One job in the Backups tree: header (job identity, orphan badge, aggregate
 * stats) and — expanded — the VMs that job produced restore points for. Each
 * VM is its own disclosure with its own restore points list; the job row
 * itself carries no actions, since restore and delete both need a specific
 * VM to act on.
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
  onRestoreVm,
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
  onRestoreVm: (vm: RestorePointJobVmGroup) => void;
  onDeleteVm: (vm: RestorePointJobVmGroup) => void;
}) {
  const typeMeta = job ? jobTypeMeta(job.type) : null;
  const TypeIcon = typeMeta?.icon ?? History;
  const pointCount = group.points.length;
  const vmNoun = group.vms.length === 1 ? "VM" : "VMs";

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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60"
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
                  title="This job has been deleted. Its restore points are kept and stay restorable."
                >
                  <AlertTriangle className="h-3 w-3" />
                  No active job
                </Badge>
              )}
            </CardTitle>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="nums">
                {pointCount} point{pointCount === 1 ? "" : "s"}
              </span>
              <span aria-hidden>·</span>
              <span className="nums">
                {group.vms.length} {vmNoun}
              </span>
              {group.storedGB > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="nums">{formatStorage(group.storedGB)} stored</span>
                </>
              )}
              {group.logicalGB != null && (
                <>
                  <span aria-hidden>·</span>
                  <span
                    className="nums"
                    title="The real, uncompressed data these restore points hold"
                  >
                    from {formatStorage(group.logicalGB)}
                    {compressionRatioLabel(group.compressionRatio) &&
                      ` (${compressionRatioLabel(group.compressionRatio)})`}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>latest {formatRelative(group.latest)}</span>
            </span>
          </span>
        </button>
      </CardHeader>
      {isOpen && (
        <CardContent className="pt-0">
          <ul className="divide-y divide-border/60 border-t border-border/60">
            {group.vms.map((vm) => (
              <BackupJobVmRow
                key={vm.vmId}
                jobName={group.jobName}
                vm={vm}
                isOpen={openVmIds.has(vm.vmId)}
                onToggle={() => onToggleVm(vm.vmId)}
                sortDir={sortDir}
                offlineRepoIds={offlineRepoIds}
                restoreBlockedReason={vm.removed ? REMOVED_RESTORE_TIP : undefined}
                onRestore={() => onRestoreVm(vm)}
                onDelete={() => onDeleteVm(vm)}
              />
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
