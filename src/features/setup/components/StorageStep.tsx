// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Info } from "@/lib/icons";
import { formatStorage } from "@/lib/format";
import { toneChip, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ManifestArraySpec, PhysicalDisk, RaidLevel } from "@/services/api.http";
import { StepHeader } from "./StepHeader";
import i18n from "@/i18n";

interface StorageStepProps {
  disks: PhysicalDisk[] | null;
  plan: ManifestArraySpec[] | null;
  /** Planner remarks straight from the appliance (real mode); null → client fallback. */
  notes?: string[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/** What each planned array is for, keyed by the planner's names. */
const PURPOSE: Record<string, string> = {
  system: i18n.t("setup:storage.purpose.system"),
  perf: i18n.t("setup:storage.purpose.perf"),
  staging: i18n.t("setup:storage.purpose.staging"),
  bulk: i18n.t("setup:storage.purpose.bulk"),
};

function diskStatusChip(d: PhysicalDisk): { label: string; tone: Tone } {
  switch (d.status) {
    case "unassigned":
      return { label: i18n.t("setup:storage.diskStatus.available"), tone: "info" };
    case "spare":
      return { label: i18n.t("setup:storage.diskStatus.hotSpare"), tone: "immutable" };
    case "failing":
      return { label: i18n.t("setup:storage.diskStatus.failing"), tone: "warning" };
    case "failed":
      return { label: i18n.t("setup:storage.diskStatus.failed"), tone: "danger" };
    default:
      return d.arrayId
        ? { label: i18n.t("setup:storage.diskStatus.inArray"), tone: "success" }
        : { label: i18n.t("setup:storage.diskStatus.healthy"), tone: "success" };
  }
}

/** Usable capacity after mirroring/parity, from the smallest member (mdadm's rule). */
function usableGBFor(level: RaidLevel, n: number, minGB: number): number {
  switch (level) {
    case "raid1":
      return minGB;
    case "raid5":
      return (n - 1) * minGB;
    case "raid6":
      return (n - 2) * minGB;
    case "raid10":
      return (n / 2) * minGB;
  }
}

/** Replay the planner's disk-claiming order to estimate per-array usable capacity. */
function estimateLayout(
  disks: PhysicalDisk[],
  plan: ManifestArraySpec[],
): { usable: Map<string, number>; leftover: number } {
  const claimed = new Set<string>();
  const usable = new Map<string, number>();
  for (const spec of plan) {
    const candidates = disks
      .filter((d) => d.status === "unassigned" && d.media === spec.media && !claimed.has(d.id))
      .sort((a, b) => a.capacityGB - b.capacityGB || a.slot.localeCompare(b.slot));
    const take = candidates.slice(0, spec.diskCount + spec.spares);
    for (const d of take) claimed.add(d.id);
    const members = take.slice(0, spec.diskCount);
    if (members.length < spec.diskCount) continue;
    const minGB = Math.min(...members.map((d) => d.capacityGB));
    usable.set(spec.name, usableGBFor(spec.level, spec.diskCount, minGB));
  }
  const leftover = disks.filter((d) => d.status === "unassigned" && !claimed.has(d.id)).length;
  return { usable, leftover };
}

export function StorageStep({ disks, plan, notes, loading, error, onRetry }: StorageStepProps) {
  const { t } = useTranslation("setup");
  const estimate = useMemo(
    () => (disks && plan ? estimateLayout(disks, plan) : null),
    [disks, plan],
  );

  return (
    <div className="space-y-5">
      <StepHeader title={t("storage.title")} description={t("storage.description")} />

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-danger-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("common:actions.retry")}
          </Button>
        </div>
      )}

      {/* -------- detected disks -------- */}
      <div className="overflow-hidden rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("storage.columns.slot")}</TableHead>
              <TableHead>{t("storage.columns.model")}</TableHead>
              <TableHead>{t("storage.columns.media")}</TableHead>
              <TableHead className="text-right">{t("storage.columns.size")}</TableHead>
              <TableHead>{t("storage.columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || !disks
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : disks.map((d) => {
                  const chip = diskStatusChip(d);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.slot}</TableCell>
                      <TableCell className="max-w-52 truncate text-sm" title={d.model}>
                        {d.model}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                            toneChip("muted"),
                          )}
                        >
                          {d.media}
                        </span>
                      </TableCell>
                      <TableCell className="nums text-right text-sm">
                        {formatStorage(d.capacityGB, 0)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "px-2 py-0.5 text-[11px] font-medium",
                            toneChip(chip.tone),
                          )}
                        >
                          {chip.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      {/* -------- auto-layout preview -------- */}
      <div className="space-y-2.5">
        <p className="text-sm font-medium">{t("storage.plannedLayout")}</p>
        {loading || plan === null ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : plan.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("storage.noLayout")}
          </div>
        ) : (
          <>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {plan.map((spec) => {
                const usableGB = estimate?.usable.get(spec.name);
                return (
                  <div
                    key={spec.name}
                    className="space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold capitalize">{spec.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {spec.level}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {spec.diskCount}× {spec.media.toUpperCase()}
                      {spec.spares > 0 && t("storage.hotSpares", { count: spec.spares })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {PURPOSE[spec.name] ?? t("storage.purpose.default")}
                    </p>
                    {usableGB !== undefined && (
                      <p className="nums text-sm font-medium">
                        {t("storage.usable", { size: formatStorage(usableGB, 1) })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {notes && notes.length > 0 ? (
              /* The appliance planner's own remarks — authoritative in real mode. */
              <div className="space-y-0.5">
                {notes.map((note) => (
                  <p key={note} className="text-xs text-muted-foreground">
                    {note}
                  </p>
                ))}
              </div>
            ) : (
              estimate !== null &&
              estimate.leftover > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("storage.leftoverInventory", { count: estimate.leftover })}
                </p>
              )
            )}
          </>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-sm text-info-text">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("storage.appliedAsShown")}</span>
      </div>
    </div>
  );
}
