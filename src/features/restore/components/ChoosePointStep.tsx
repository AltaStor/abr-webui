// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useListMaxHeight } from "../useListMaxHeight";
import { format } from "date-fns";
import { Clock, History, Lock, ServerOff, ShieldCheck } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { formatRelative, formatStorage } from "@/lib/format";
import { useSettingsStore } from "@/store/settings";
import { compressionRatioLabel, pointTypeTooltip } from "@/lib/restore-points";
import { useWorldStore } from "@/store/world";
import i18n from "@/i18n";
import type { RestorePoint, VM } from "@/types";

interface ChoosePointStepProps {
  vm: VM;
  selectedId: string | null;
  onSelect: (point: RestorePoint) => void;
}

/** Stable day-bucket KEY for grouping — always ISO, never displayed. */
function dayKey(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

/** date-fns date pattern honouring the user's "Date format" preference. */
const DATE_PATTERNS = { iso: "yyyy-MM-dd", us: "MM/dd/yyyy", eu: "dd.MM.yyyy" } as const;

/** The DISPLAYED group heading. "Today"/"Yesterday" stay verbal; older days use
 *  the user's configured date format (read live from the settings snapshot). */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (dayKey(iso) === dayKey(today.toISOString())) return i18n.t("restore:point.today");
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return i18n.t("restore:point.yesterday");
  return format(d, DATE_PATTERNS[useSettingsStore.getState().general.dateFormat]);
}

/** Step 2 — timeline picker of the chosen VM's restore points, grouped by day. */
export function ChoosePointStep({ vm, selectedId, onSelect }: ChoosePointStepProps) {
  const { t } = useTranslation("restore");
  const { ref: listRef, maxHeight } = useListMaxHeight<HTMLDivElement>();
  const allPoints = useWorldStore((s) => s.restorePoints);
  const repositories = useWorldStore((s) => s.repositories);

  const offlineRepoIds = useMemo(
    () => new Set(repositories.filter((r) => r.status === "offline").map((r) => r.id)),
    [repositories],
  );

  const points = useMemo(
    () =>
      allPoints
        .filter((p) => p.vmId === vm.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allPoints, vm.id],
  );

  const groups = useMemo(() => {
    const map = new Map<string, RestorePoint[]>();
    for (const p of points) {
      const k = dayKey(p.createdAt);
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return Array.from(map.entries()).map(([, pts]) => ({ label: dayLabel(pts[0].createdAt), points: pts }));
  }, [points]);

  const unreachableCount = points.filter((p) => offlineRepoIds.has(p.repositoryId)).length;
  const allUnreachable = points.length > 0 && unreachableCount === points.length;
  const offlineTip = t("point.offlineTip");

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{t("point.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="point.countFor"
              ns="restore"
              count={points.length}
              values={{ name: vm.name }}
              components={{ 1: <span className="font-medium text-foreground" /> }}
            />{" "}
            {allUnreachable ? t("point.allUnreachable") : t("point.mostRecentSelected")}
          </p>
        </div>
        {unreachableCount > 0 && (
          <div className="flex items-start gap-2.5 border border-warning/30 bg-warning/10 px-3 py-2.5">
            <ServerOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-foreground">
              <Trans
                i18nKey="point.unreachableCallout"
                ns="restore"
                count={unreachableCount}
                components={{ 1: <span className="font-medium text-warning-text" /> }}
              />
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {points.length === 0 ? (
          <EmptyState
            icon={History}
            title={t("point.empty.title", { noun: "VM" })}
            description={t("point.empty.desc")}
            compact
          />
        ) : (
          <div
            ref={listRef}
            style={{ maxHeight }}
            className="overflow-y-auto overflow-x-hidden overscroll-contain px-1 pt-0.5"
          >
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="label-overline mb-2">
                    {group.label}
                  </p>
                  <ol className="relative space-y-1.5">
                    {/* Continuous rail behind the markers — lives inside the row gutter so it
                        never escapes the scroll container (that was the old clipping bug). */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-[8px] top-2 bottom-2 w-px bg-border/60"
                    />
                    {group.points.map((p) => {
                      const selected = p.id === selectedId;
                      const unavailable = offlineRepoIds.has(p.repositoryId);
                      return (
                        <li key={p.id} className="relative flex items-stretch gap-2.5">
                          <span className="relative flex w-[17px] shrink-0 justify-center pt-[0.95rem]">
                            <span
                              aria-hidden
                              className={cn(
                                "z-10 h-2 w-2 rounded-full ring-4 ring-card transition-colors",
                                selected
                                  ? "bg-primary"
                                  : unavailable
                                    ? "bg-warning"
                                    : "bg-muted-foreground/40",
                              )}
                            />
                          </span>
                          <button
                            type="button"
                            onClick={() => !unavailable && onSelect(p)}
                            aria-pressed={selected}
                            aria-disabled={unavailable}
                            disabled={unavailable}
                            title={unavailable ? offlineTip : undefined}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-3 border px-3 py-2.5 text-left transition-colors duration-250",
                              unavailable
                                ? "cursor-not-allowed border-border/50 bg-muted/30 opacity-60"
                                : selected
                                  ? "border-primary/50 bg-primary/[0.06]"
                                  : "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.03]",
                            )}
                          >
                            <span className="flex items-center gap-2 text-sm">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="nums font-medium tabular-nums">
                                {format(new Date(p.createdAt), "HH:mm")}
                              </span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant={p.type === "full" ? "info" : "outline"}
                                  title={pointTypeTooltip(p.type)}
                                >
                                  {p.type === "full" ? t("point.full") : t("point.incremental")}
                                </Badge>
                                {unavailable && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 border-warning/40 font-normal text-warning-text"
                                  >
                                    <ServerOff className="h-3 w-3" />
                                    {t("point.badge.unavailable")}
                                  </Badge>
                                )}
                                {p.encrypted && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 font-normal text-muted-foreground"
                                    title={t("point.encryptedTip")}
                                  >
                                    <Lock className="h-3 w-3" />
                                    {t("point.encrypted")}
                                  </Badge>
                                )}
                              </span>
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {p.jobName} · {formatRelative(p.createdAt)}
                                {p.compressionLevel != null &&
                                  ` · ${t("point.compression", { level: p.compressionLevel })}`}
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              <span className="nums text-sm font-medium">{formatStorage(p.sizeGB)}</span>
                              {p.logicalGB != null && (
                                <span
                                  className="nums text-[11px] text-muted-foreground"
                                  title={t("point.storedTitle", {
                                    logical: formatStorage(p.logicalGB, 1),
                                    stored: formatStorage(p.sizeGB, 1),
                                  })}
                                >
                                  {t("point.fromLogical", { size: formatStorage(p.logicalGB, 1) })}
                                  {compressionRatioLabel(p.compressionRatio) &&
                                    ` · ${compressionRatioLabel(p.compressionRatio)}`}
                                </span>
                              )}
                              {selected && (
                                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                                  <ShieldCheck className="h-3 w-3" /> {t("point.selected")}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
