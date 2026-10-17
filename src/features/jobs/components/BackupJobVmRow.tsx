// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Layers,
  Loader2,
  RotateCcw,
  Server,
  ServerOff,
  ShieldCheck,
  Trash2,
} from "@/lib/icons";
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
import { SyntheticFullBadge } from "@/components/SyntheticFullBadge";
import { ConsistencyBadge } from "@/components/ConsistencyBadge";
import { PointEncryptionBadge, VmEncryptionBadge } from "./EncryptionBadge";

/**
 * One VM within a job's expanded tree: a header row (name, stats, verify,
 * restore, the one delete action for this whole VM-from-job backup) and —
 * expanded — its flat restore points list, full and incremental together,
 * sorted by the tab's shared time order. There is no per-point delete here;
 * that lives only on this row, and removes the VM's entire chain(s) for this
 * job at once. Verify is scoped the same way, because a chain is the unit the
 * appliance verifies (`POST /backups/{chainId}/verify`).
 */
export function BackupJobVmRow({
  jobName,
  jobEncrypts,
  vm,
  isOpen,
  onToggle,
  sortDir,
  offlineRepoIds,
  restoreBlockedReason,
  verifying,
  onVerify,
  onSyntheticFull,
  onRestore,
  onRestorePoint,
  onDelete,
}: {
  jobName: string;
  /** The job's current encryption setting; undefined when the job is gone. */
  jobEncrypts: boolean | undefined;
  vm: RestorePointJobVmGroup;
  isOpen: boolean;
  onToggle: () => void;
  sortDir: "asc" | "desc";
  offlineRepoIds: Set<string>;
  /** Why restore is disabled — e.g. the source VM is gone from inventory. */
  restoreBlockedReason?: string;
  /** A verification of this VM's chain(s) is running right now. */
  verifying: boolean;
  /** Re-read every artifact behind these points and check it against the
   *  catalog. Unlike restore, this needs no source VM — it reads what is
   *  stored, so it stays available for a VM that has since been removed. */
  onVerify: () => void;
  /** Merge this VM's chain under this job into a new full backup. Scoped the
   *  same way verify is — a chain is what the appliance merges — and offered
   *  here because this tree is already grouped by exactly the (job, VM) pair a
   *  synthetic full operates on. */
  onSyntheticFull: () => void;
  /** The VM-level action: recover this machine, wizard picks the newest point. */
  onRestore: () => void;
  /** The point-level action. Distinct on purpose — an operator who opens the
   *  tree and picks a three-day-old point is usually doing so *because* the
   *  newest one is the problem, so handing them the newest is the one
   *  substitution this button must never make. */
  onRestorePoint: (point: RestorePoint) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("jobs");
  /** Hover explanation for a row whose repository is offline. */
  const offlineTip = t("point.offlineTip");
  const unreachable = vm.points.filter((p) => offlineRepoIds.has(p.repositoryId)).length;
  const allUnreachable = unreachable === vm.points.length;
  const restoreDisabled = allUnreachable || restoreBlockedReason !== undefined;
  const orderedPoints = sortDir === "asc" ? [...vm.points].reverse() : vm.points;
  /* The points don't all share one encryption state (some encrypted, or some
   * the appliance never reported), so each point row says which it is. */
  const mixedEncryption =
    vm.encryption.state === "partial" ||
    (vm.encryption.unreported > 0 && vm.encryption.unreported < vm.points.length);

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
          <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-muted/60 text-muted-foreground">
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
                  {t("backupsTab.sourceRemoved")}
                </Badge>
              )}
              {verifying && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-info/40 font-normal text-info-text"
                  title={t("backupsTab.verify.runningTip")}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("backupsTab.verify.running")}
                </Badge>
              )}
              <VmEncryptionBadge summary={vm.encryption} jobEncrypts={jobEncrypts} />
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="nums">{t("rp.pointsShort", { count: vm.points.length })}</span>
              {vm.storedGB > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="nums">
                    {t("backupsTab.storedShort", { size: formatStorage(vm.storedGB) })}
                  </span>
                </>
              )}
              {vm.logicalGB != null && (
                <>
                  <span aria-hidden>·</span>
                  <span className="nums" title={t("backupsTab.logicalTitle")}>
                    {t("backupsTab.fromLogical", { size: formatStorage(vm.logicalGB) })}
                    {compressionRatioLabel(vm.compressionRatio) &&
                      ` (${compressionRatioLabel(vm.compressionRatio)})`}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>
                {t("rp.latest", {
                  rel: formatRelative(vm.latest),
                  abs: formatDateTime(vm.latest),
                })}
              </span>
              {unreachable > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-warning-text">
                    {t("rp.unavailable", { count: unreachable })}
                  </span>
                </>
              )}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("backupsTab.verify.aria", { vm: vm.name, job: jobName })}
            title={allUnreachable ? offlineTip : t("backupsTab.verify.tip")}
            className="text-muted-foreground"
            onClick={onVerify}
            disabled={allUnreachable || verifying}
          >
            {verifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("backupsTab.syntheticFull.aria", { vm: vm.name, job: jobName })}
            title={allUnreachable ? offlineTip : t("backupsTab.syntheticFull.tip")}
            className="text-muted-foreground"
            onClick={onSyntheticFull}
            disabled={allUnreachable}
          >
            <Layers className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("backupsTab.restoreVmAria", { vm: vm.name, job: jobName })}
            title={restoreBlockedReason ?? (allUnreachable ? offlineTip : t("rp.restore"))}
            className="text-muted-foreground"
            onClick={onRestore}
            disabled={restoreDisabled}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("backupsTab.deleteVmAria", { vm: vm.name, job: jobName })}
            title={t("backupsTab.deleteVmTip")}
            className="text-muted-foreground/70 hover:bg-danger/10 hover:text-danger"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {isOpen && (
        <ul className="ml-11 divide-y divide-border/60 border-t border-border pr-3">
          {orderedPoints.map((point) => (
            <BackupPointRow
              key={point.id}
              point={point}
              mixedEncryption={mixedEncryption}
              unavailable={offlineRepoIds.has(point.repositoryId)}
              restoreBlockedReason={restoreBlockedReason}
              onRestore={() => onRestorePoint(point)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function BackupPointRow({
  point,
  mixedEncryption,
  unavailable,
  restoreBlockedReason,
  onRestore,
}: {
  point: RestorePoint;
  /** The VM's chain mixes encryption states, so each point says which it is. */
  mixedEncryption: boolean;
  unavailable: boolean;
  restoreBlockedReason?: string;
  onRestore: () => void;
}) {
  const { t } = useTranslation("jobs");
  const offlineTip = t("point.offlineTip");
  const restoreDisabled = unavailable || restoreBlockedReason !== undefined;
  return (
    <li className={cn("flex items-center gap-3 py-2", unavailable && "opacity-60")}>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-semibold uppercase",
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
          {/* Same marker as the VM detail list — a merged full has to look the
              same wherever a restore point is shown. */}
          {point.synthetic && <SyntheticFullBadge />}
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
          <PointEncryptionBadge encrypted={point.encrypted} mixedChain={mixedEncryption} />
          <ConsistencyBadge consistency={point.consistency} reason={point.consistencyReason} />
        </div>
        <p className="text-xs text-muted-foreground">
          {formatRelative(point.createdAt)}
          {point.compressionLevel != null &&
            ` · ${t("point.compression", { level: point.compressionLevel })}`}
        </p>
      </div>
      {point.sizeGB > 0 && (
        <span className="nums hidden shrink-0 text-sm text-muted-foreground sm:block">
          {formatStorage(point.sizeGB, 1)}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("point.restoreAria")}
        title={unavailable ? offlineTip : (restoreBlockedReason ?? t("rp.restore"))}
        className="shrink-0 text-muted-foreground"
        onClick={onRestore}
        disabled={restoreDisabled}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}
