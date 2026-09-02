// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { ReactNode } from "react";

/**
 * Shared chart design system — one considered look across every recharts surface,
 * tuned to the AltaStor palette instead of the stock library defaults:
 *   · faint solid hairline grid (not the dashed "monitoring tool" grid)
 *   · muted, low-contrast axis ticks with breathing room
 *   · rich 3-stop gradient area fills
 *   · a square, slightly glassy on-brand tooltip
 *   · an emphasized marker on the latest data point
 *
 * recharts detects chart children by component *type*, so the structural pieces
 * (grid/axes/cursor/gradient) are exported as spreadable props, not wrappers.
 */

export const token = (name: string) => `hsl(var(--${name}))`;

/* ----------------------------- grid & axes ------------------------------ */

export const gridProps = {
  vertical: false as const,
  stroke: "hsl(var(--foreground) / 0.055)",
  strokeWidth: 1,
} as const;

const AXIS_TICK = { fontSize: 10.5, fill: "hsl(var(--muted-foreground) / 0.7)" } as const;

export const xAxisProps = (over: Record<string, unknown> = {}) => ({
  tickLine: false,
  axisLine: false,
  tick: AXIS_TICK,
  tickMargin: 10,
  minTickGap: 28,
  ...over,
});

export const yAxisProps = (over: Record<string, unknown> = {}) => ({
  tickLine: false,
  axisLine: false,
  tick: AXIS_TICK,
  tickMargin: 6,
  width: 44,
  ...over,
});

/** Hover guides — a hairline for line/area charts, a soft wash for bars. */
export const areaCursor = {
  stroke: "hsl(var(--foreground) / 0.18)",
  strokeWidth: 1,
  strokeDasharray: "4 4",
};
export const barCursor = { fill: "hsl(var(--foreground) / 0.05)" };

/* --------------------------- gradient fills ----------------------------- */

/** Vertical bar fill — full colour up top, gently deepening toward the baseline,
 *  so bars read with a little depth instead of as flat blocks. */
export function BarGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={1} />
      <stop offset="100%" stopColor={color} stopOpacity={0.62} />
    </linearGradient>
  );
}

/** Rich 3-stop area fill: a defined top, a long soft mid, fading to nothing. */
export function AreaGradient({
  id,
  color,
  top = 0.3,
  mid = 0.06,
}: {
  id: string;
  color: string;
  top?: number;
  mid?: number;
}) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={top} />
      <stop offset="55%" stopColor={color} stopOpacity={mid} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

/* ------------------------- latest-point marker -------------------------- */

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/**
 * A recharts `dot` renderer that marks ONLY the latest point — a filled node with
 * a soft halo, so the eye lands on "where the trend is now". Every other point
 * renders nothing.
 */
export function latestDot(color: string, lastIndex: number) {
  return function LatestDot({ cx, cy, index }: DotProps) {
    if (index !== lastIndex || cx == null || cy == null) {
      return <g key={`d-${index}`} />;
    }
    return (
      <g key={`d-${index}`}>
        <circle cx={cx} cy={cy} r={5.5} fill={color} fillOpacity={0.16} />
        <circle cx={cx} cy={cy} r={3} fill={color} stroke={token("card")} strokeWidth={1.5} />
      </g>
    );
  };
}

/** Index of the last point whose `key` value is a finite number (skips a null
 *  forecast tail), for placing the latest-point marker on real data. */
export function lastRealIndex<T>(data: T[], key: keyof T): number {
  let idx = -1;
  data.forEach((d, i) => {
    const v = d[key] as unknown;
    if (typeof v === "number" && Number.isFinite(v)) idx = i;
  });
  return idx;
}

/* ------------------------------- tooltip -------------------------------- */

export interface ChartTipItem {
  value: number;
  name?: string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  footer,
}: {
  active?: boolean;
  payload?: ChartTipItem[];
  label?: string | number;
  labelFormatter?: (l: string | number) => ReactNode;
  valueFormatter?: (v: number, item: ChartTipItem) => ReactNode;
  footer?: (rows: ChartTipItem[]) => { label: ReactNode; value: ReactNode } | null;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => Number.isFinite(p.value));
  if (!rows.length) return null;
  const foot = footer?.(rows) ?? null;
  return (
    <div className="min-w-[8.5rem] border border-border/70 bg-popover/95 px-2.5 py-2 text-xs shadow-pop backdrop-blur-sm">
      {label != null && (
        <p className="mb-1.5 font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {rows.map((p) => (
          <div
            key={String(p.dataKey ?? p.name)}
            className="flex items-center justify-between gap-6"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              {p.color && <span className="h-2 w-2" style={{ backgroundColor: p.color }} />}
              <span className="capitalize">{p.name}</span>
            </span>
            <span className="nums font-semibold text-foreground">
              {valueFormatter ? valueFormatter(p.value, p) : p.value}
            </span>
          </div>
        ))}
      </div>
      {foot && (
        <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-border/50 pt-1.5 text-muted-foreground">
          <span>{foot.label}</span>
          <span className="nums font-semibold text-foreground">{foot.value}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- legend --------------------------------- */

export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2.5 shrink-0" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
