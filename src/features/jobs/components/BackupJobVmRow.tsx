// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { ChevronRight, Lock, LockOpen, RotateCcw, Server, ServerOff, Trash2 } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative, formatStorage } from "@/lib/format";
import {
  compressionRatioLabel,
  pointTypeTooltip,
  type RestorePointJobVmGroup,
} from "@/lib/restore-points";
import type { RestorePoint } from "@/types";

/** Hover explanation for a full/incremental type badge on the row's repository being offline. */
const OFFLINE_TIP =
  "This restore point's repository is offline — it can't be read until the repository comes back online.";

/**
 * One VM within a job's expanded tree: a header row (name, stats, restore,
 * the one delete action for this whole VM-from-job backup) and — expanded —
 * its flat restore points list, full and incremental together, sorted by the
 * tab's shared time order. There is no per-point delete here; that lives only
 * on this row, and removes the VM's entire chain(s) for this job at once.
 */
export function BackupJobVmRow({
  jobName,
  vm,
  isOpen,
  onToggle,
  sortDir,
  offlineRepoIds,
  restoreBlockedReason,
  onRestore,
  onDelete,
}: {
  jobName: string;
  vm: RestorePointJobVmGroup;
  isOpen: boolean;
  onToggle: () => void;
  sortDir: "asc" | "desc";
  offlineRepoIds: Set<string>;
  /** Why restore is disabled — e.g. the source VM is gone from inventory. */
  restoreBlockedReason?: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const unreachable = vm.points.filter((p) => offlineRepoIds.has(p.repositoryId)).length;
  const allUnreachable = unreachable === vm.points.length;
  const restoreDisabled = allUnreachable || restoreBlockedReason !== undefined;
  const orderedPoints = sortDir === "asc" ? [...vm.points].reverse() : vm.points;
  // Encryption at rest, summarised for the collapsed row. "Partly" is a real
  // and important state — a job whose encryption setting changed mid-history
  // leaves older points in the clear, which a plain on/off badge would hide.
  const encryption: "none" | "partial" | "all" =
    vm.encryptedCount === 0 ? "none" : vm.encryptedCount === vm.points.length ? "all" : "partial";

  return (
    <li>
      {/* Toggle + actions are SIBLINGS — a button inside a button is invalid. */}
      <div className="flex w-full items-center gap-3 pr-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors hover:bg-muted/40"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-90",
            )}
          />
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
            <Server className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">{vm.name}</span>
              {vm.removed && (
                <Badge
                  variant="outline"
                  className="shrink-0 font-normal text-muted-foreground"
                  title={restoreBlockedReason}
                >
                  source removed
                </Badge>
              )}
              {encryption !== "none" && (
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 gap-1 font-normal",
                    encryption === "all" ? "text-muted-foreground" : "border-warning/40 text-warning-text",
                  )}
                  title={
                    encryption === "all"
                      ? `All ${vm.points.length} restore point${vm.points.length === 1 ? "" : "s"} are encrypted at rest`
                      : `${vm.encryptedCount} of ${vm.points.length} restore points are encrypted at rest — the rest are stored unencrypted`
                  }
                >
                  <Lock className="h-3 w-3" />
                  {encryption === "all" ? "Encrypted" : `Encrypted ${vm.encryptedCount}/${vm.points.length}`}
                </Badge>
              )}
              {encryption === "none" && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 font-normal text-muted-foreground/70"
                  title="This VM's restore points are stored unencrypted"
                >
                  <LockOpen className="h-3 w-3" />
                  Not encrypted
                </Badge>
              )}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="nums">
                {vm.points.length} point{vm.points.length === 1 ? "" : "s"}
              </span>
              {vm.storedGB > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="nums">{formatStorage(vm.storedGB)} stored</span>
                </>
              )}
              {vm.logicalGB != null && (
                <>
                  <span aria-hidden>·</span>
                  <span
                    className="nums"
                    title="The real, uncompressed data these restore points hold"
                  >
                    from {formatStorage(vm.logicalGB)}
                    {compressionRatioLabel(vm.compressionRatio) &&
                      ` (${compressionRatioLabel(vm.compressionRatio)})`}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>latest {formatRelative(vm.latest)}</span>
              {unreachable > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-warning-text">{unreachable} unavailable</span>
                </>
              )}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Restore ${vm.name} from ${jobName}`}
            title={restoreBlockedReason ?? (allUnreachable ? OFFLINE_TIP : "Restore")}
            className="text-muted-foreground"
            onClick={onRestore}
            disabled={restoreDisabled}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${vm.name}'s backup from ${jobName}`}
            title="Delete this VM's backup from this job"
            className="text-muted-foreground/70 hover:bg-danger/10 hover:text-danger"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {isOpen && (
        <ul className="ml-11 divide-y divide-border/60 border-t border-border/60 pr-3">
          {orderedPoints.map((point) => (
            <BackupPointRow
              key={point.id}
              point={point}
              unavailable={offlineRepoIds.has(point.repositoryId)}
              restoreBlockedReason={restoreBlockedReason}
              onRestore={onRestore}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function BackupPointRow({
  point,
  unavailable,
  restoreBlockedReason,
  onRestore,
}: {
  point: RestorePoint;
  unavailable: boolean;
  restoreBlockedReason?: string;
  onRestore: () => void;
}) {
  const restoreDisabled = unavailable || restoreBlockedReason !== undefined;
  return (
    <li className={cn("flex items-center gap-3 py-2", unavailable && "opacity-60")}>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold uppercase",
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
              title={OFFLINE_TIP}
            >
              <ServerOff className="h-3 w-3" />
              Unavailable
            </Badge>
          )}
          {point.encrypted && (
            <Badge
              variant="outline"
              className="gap-1 font-normal text-muted-foreground"
              title="This backup's data is encrypted at rest"
            >
              <Lock className="h-3 w-3" />
              Encrypted
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatRelative(point.createdAt)}
          {point.compressionLevel != null && ` · Compression level ${point.compressionLevel}`}
        </p>
      </div>
      {point.sizeGB > 0 && (
        // Stored size leads — it is what the repository is actually holding —
        // with the real data it came from underneath, so the two are read
        // together rather than one being mistaken for the other.
        <span
          className="hidden shrink-0 text-right sm:block"
          title={
            point.logicalGB != null
              ? `${formatStorage(point.logicalGB, 1)} of data stored as ${formatStorage(point.sizeGB, 1)}`
              : "Stored size in the repository"
          }
        >
          <span className="nums block text-sm text-muted-foreground">
            {formatStorage(point.sizeGB, 1)}
          </span>
          {point.logicalGB != null && (
            <span className="nums block text-[11px] text-muted-foreground/80">
              from {formatStorage(point.logicalGB, 1)}
              {compressionRatioLabel(point.compressionRatio) &&
                ` · ${compressionRatioLabel(point.compressionRatio)}`}
            </span>
          )}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Restore this point"
        title={unavailable ? OFFLINE_TIP : (restoreBlockedReason ?? "Restore")}
        className="shrink-0 text-muted-foreground"
        onClick={onRestore}
        disabled={restoreDisabled}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}
