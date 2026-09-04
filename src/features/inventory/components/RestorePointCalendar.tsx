// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, startOfDay, startOfMonth } from "date-fns";
import { ServerOff } from "@/lib/icons";
import { MonthCalendar, type DayContext } from "@/components/calendar/MonthCalendar";
import { dayKey, groupByDay } from "@/lib/schedule";
import type { RestorePoint } from "@/types";
import { RestorePointItem } from "./RestorePointItem";

interface Props {
  points: RestorePoint[];
  offlineRepoIds: Set<string>;
  onRestore: (point: RestorePoint) => void;
  onDelete: (point: RestorePoint) => void;
}

/**
 * Calendar view of a VM's restore points — an at-a-glance map of protection
 * coverage over time. Each day shows how many points landed (heat intensity)
 * and whether a full is among them; days that sit *between* existing points
 * but hold none are flagged as coverage gaps. Picking a day lists that day's
 * points with the same restore/delete actions as the flat list.
 */
export function RestorePointCalendar({ points, offlineRepoIds, onRestore, onDelete }: Props) {
  const { t } = useTranslation("inventory");
  const pointsByDay = useMemo(() => groupByDay(points, (p) => p.createdAt), [points]);

  // The span actually covered by points — gaps are only meaningful inside it
  // (a zero-point day between two real points is a genuine hole; days beyond the
  // newest/oldest point are just outside retention, not a missed backup).
  const { coverStart, coverEnd, newestDay } = useMemo(() => {
    const times = points.map((p) => new Date(p.createdAt).getTime());
    const min = times.length ? Math.min(...times) : Date.now();
    const max = times.length ? Math.max(...times) : Date.now();
    return {
      coverStart: startOfDay(new Date(min)).getTime(),
      coverEnd: startOfDay(new Date(max)).getTime(),
      newestDay: startOfDay(new Date(max)),
    };
  }, [points]);

  const [month, setMonth] = useState(() => startOfMonth(newestDay));
  const [selected, setSelected] = useState<Date>(() => newestDay);

  const renderDay = (day: Date, ctx: DayContext): ReactNode => {
    if (!ctx.inMonth) return null;
    const pts = pointsByDay.get(dayKey(day)) ?? [];

    if (pts.length > 0) {
      const hasFull = pts.some((p) => p.type === "full");
      const anyOffline = pts.some((p) => offlineRepoIds.has(p.repositoryId));
      const intensity = Math.min(pts.length, 4) / 4;
      const alpha = (0.1 + intensity * 0.16).toFixed(3);
      return (
        <div className="flex h-full flex-col justify-end">
          <div
            className="px-1 py-0.5"
            style={{ backgroundColor: `hsl(var(--primary) / ${alpha})` }}
            title={t("calendar.pointsCount", { count: pts.length }) + (hasFull ? t("calendar.includesFullSuffix") : "")}
          >
            <div className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-[2px]"
                style={{ backgroundColor: hasFull ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
              />
              <span className="nums text-[11px] font-semibold text-foreground">{pts.length}</span>
              {anyOffline && <ServerOff className="ml-auto h-3 w-3 text-warning" />}
            </div>
          </div>
        </div>
      );
    }

    // Coverage gap — a day inside the protected span with no point.
    const ts = startOfDay(day).getTime();
    if (ts > coverStart && ts < coverEnd) {
      return (
        <div className="flex h-full items-end">
          <span
            className="mb-0.5 h-1.5 w-1.5 rounded-full border border-dashed border-muted-foreground/40"
            title={t("calendar.noPointDay")}
          />
        </div>
      );
    }
    return null;
  };

  const selectedPts = (pointsByDay.get(dayKey(selected)) ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: "hsl(var(--primary))" }} />
        {t("calendar.legendFull")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: "hsl(var(--muted-foreground))" }} />
        {t("calendar.legendIncremental")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full border border-dashed border-muted-foreground/50" />
        {t("calendar.legendGap")}
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      <MonthCalendar
        bare
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelectDay={setSelected}
        renderDay={renderDay}
        legend={legend}
      />

      <div className="border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{format(selected, "EEEE, MMMM d")}</h4>
          <span className="text-xs text-muted-foreground">
            {selectedPts.length > 0
              ? t("calendar.pointsCount", { count: selectedPts.length })
              : t("calendar.noPoints")}
          </span>
        </div>
        {selectedPts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("calendar.noPointsDay")}
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border/60">
            {selectedPts.map((rp) => (
              <RestorePointItem
                key={rp.id}
                point={rp}
                unavailable={offlineRepoIds.has(rp.repositoryId)}
                onRestore={() => onRestore(rp)}
                onDelete={() => onDelete(rp)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
