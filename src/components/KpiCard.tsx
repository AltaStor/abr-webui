// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { ArrowUpRight, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toneChip, toneFg, type Tone } from "@/lib/status";
import { CountUp } from "./CountUp";
import { Skeleton } from "./ui/skeleton";

interface KpiCardProps {
  label: string;
  value: number;
  format?: (n: number) => string;
  unit?: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  drillLabel?: string;
  onClick?: () => void;
  footer?: React.ReactNode;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  format = (n) => `${Math.round(n)}`,
  unit,
  icon: Icon,
  tone = "muted",
  hint,
  drillLabel,
  onClick,
  footer,
  loading,
}: KpiCardProps) {
  const clickable = !!onClick;
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-card",
        clickable && "cursor-pointer transition-all hover:border-border hover:shadow-pop",
      )}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? (drillLabel ? drillLabel.replace(/\s*→$/, "") : label) : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneChip(tone))}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        </div>
        {drillLabel && (
          <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
        )}
      </div>

      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <div className="flex items-baseline gap-1">
            <CountUp value={value} format={format} className={cn("nums font-mono text-3xl font-bold tracking-tight", toneFg(tone))} />
            {unit && <span className="text-base font-medium text-muted-foreground">{unit}</span>}
          </div>
        )}
        {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>

      {(footer || drillLabel) && (
        <div className="mt-3 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          {footer ?? <span className="font-medium text-foreground/80 group-hover:text-primary">{drillLabel}</span>}
        </div>
      )}
    </div>
  );
}
