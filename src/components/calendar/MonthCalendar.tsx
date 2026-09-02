// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { type ReactNode } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { languageMeta } from "@/i18n/languages";

/** Monday-first, matching the ISO/enterprise convention the appliance defaults to. */
export const WEEK_STARTS_ON = 1 as const;

export interface DayContext {
  /** The day falls within the month being displayed (vs. a leading/trailing pad day). */
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

interface MonthCalendarProps {
  /** Any date within the month to render. */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Cell body rendered beneath the date number — the caller's markers. */
  renderDay: (day: Date, ctx: DayContext) => ReactNode;
  selected?: Date | null;
  onSelectDay?: (day: Date) => void;
  /** Optional node beside the month nav (e.g. a summary chip). */
  title?: ReactNode;
  /** Optional node on the right of the header (e.g. a view toggle). */
  actions?: ReactNode;
  /** Optional footer legend row. */
  legend?: ReactNode;
  /** Drop the outer card chrome (border/shadow/rounding) when embedded inside an
   *  existing Card, so it doesn't read as a card-in-card. */
  bare?: boolean;
  className?: string;
}

/**
 * Presentational month grid — a shared primitive behind both the job-schedule
 * calendar and the VM restore-point calendar, so the two read as one system.
 * It owns the chrome (month nav, weekday header, today ring, selection, stable
 * 6-week height) and delegates every per-day marker to `renderDay`.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  renderDay,
  selected,
  onSelectDay,
  title,
  actions,
  legend,
  bare,
  className,
}: MonthCalendarProps) {
  const { t, i18n } = useTranslation("common");
  const locale = languageMeta(i18n.language).dateFnsLocale;
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  // Always 6 weeks (42 cells) so height never jumps as the user pages months.
  const days = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });
  // Localised weekday headers derived from the first grid week (respects WEEK_STARTS_ON).
  const weekdayLabels = days.slice(0, 7).map((d) => format(d, "EEEEEE", { locale }));
  const clickable = !!onSelectDay;

  return (
    <div className={cn("overflow-hidden", !bare && "rounded-xl border border-border/70 bg-card shadow-card", className)}>
      {/* Month navigation */}
      <div className={cn("flex flex-wrap items-center gap-2 border-b border-border/60 py-2.5", bare ? "px-0" : "px-3 sm:px-4")}>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label={t("calendar.prevMonth")} onClick={() => onMonthChange(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold">{format(month, "MMMM yyyy", { locale })}</span>
          <Button variant="ghost" size="icon-sm" aria-label={t("calendar.nextMonth")} onClick={() => onMonthChange(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="ml-1 h-7 px-2 text-xs text-muted-foreground" onClick={() => onMonthChange(new Date())}>
            {t("calendar.today")}
          </Button>
        </div>
        {title && <div className="min-w-0">{title}</div>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      {/* Weekday header */}
      <div className={cn("grid grid-cols-7 pt-2 text-center", bare ? "px-0" : "px-2 sm:px-2.5")}>
        {weekdayLabels.map((d, i) => (
          <div key={i} className="pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className={cn("grid grid-cols-7 gap-1 pb-2", bare ? "px-0" : "px-2 sm:px-2.5")}>
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const ctx: DayContext = { inMonth, isToday: today, isSelected };

          const cellClass = cn(
            "flex min-h-[3.5rem] flex-col rounded-lg border p-1 text-left transition-colors sm:min-h-[4.25rem] sm:p-1.5",
            isSelected ? "border-border bg-muted/50" : "border-transparent",
            !inMonth && "opacity-40",
            clickable && "hover:border-border/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          );

          const body = (
            <>
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center self-start rounded-full text-[11px] nums leading-none",
                  today
                    ? "bg-primary font-semibold text-primary-foreground"
                    : inMonth
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50",
                )}
              >
                {format(day, "d", { locale })}
              </span>
              <div className="mt-0.5 min-h-0 flex-1">{renderDay(day, ctx)}</div>
            </>
          );

          return clickable ? (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay!(day)}
              aria-current={today ? "date" : undefined}
              aria-pressed={isSelected}
              className={cellClass}
            >
              {body}
            </button>
          ) : (
            <div key={day.toISOString()} aria-current={today ? "date" : undefined} className={cellClass}>
              {body}
            </div>
          );
        })}
      </div>

      {legend && <div className={cn("border-t border-border/60 py-2.5", bare ? "px-0" : "px-3 sm:px-4")}>{legend}</div>}
    </div>
  );
}
