// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Rectangle, type RectangleProps } from "recharts";
import { DUR, EASE_BRAND } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Shared chart design system — one considered look across every recharts surface,
 * tuned to the AltaStor palette instead of the stock library defaults:
 *   · faint solid hairline grid (not the dashed "monitoring tool" grid)
 *   · muted axis ticks with breathing room
 *   · flat, faint series fills under full-strength strokes
 *   · a square, opaque on-brand tooltip
 *   · an emphasized marker on the latest data point
 *
 * recharts detects chart children by component *type*, so the structural pieces
 * (grid/axes/cursor) are exported as spreadable props, not wrappers.
 */

export const token = (name: string) => `hsl(var(--${name}))`;

/* ----------------------------- grid & axes ------------------------------ */

export const gridProps = {
  vertical: false as const,
  // The band hairline the brand uses behind drawn geometry — the same rule the
  // page draws with, not a bespoke wash of the ink colour.
  stroke: "hsl(var(--grid-line))",
  strokeWidth: 1,
} as const;

const AXIS_TICK = { fontSize: 10.5, fill: "hsl(var(--muted-foreground))" } as const;

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

/* ------------------------- linked inspection --------------------------- */

/**
 * Motion shared by the stacked outcome charts. The selected outcome grows
 * sideways only: height remains an honest encoding of run count, while the
 * sibling series quiet down exactly like G5's unselected donut sectors.
 */
export function inspectionBarShape({
  active,
  quiet,
  reduceMotion,
}: {
  active: boolean;
  quiet: boolean;
  reduceMotion: boolean;
}) {
  return function InspectionBarShape(shapeProps: unknown) {
    // Recharts deliberately types custom shape callbacks as `unknown`; at
    // runtime these are its documented Rectangle geometry/presentation props.
    const props = shapeProps as RectangleProps;
    const x = typeof props.x === "number" ? props.x : 0;
    const y = typeof props.y === "number" ? props.y : 0;
    const width = typeof props.width === "number" ? props.width : 0;
    const height = typeof props.height === "number" ? props.height : 0;

    return (
      <motion.g
        initial={false}
        animate={{
          opacity: quiet ? 0.28 : 1,
          scaleX: reduceMotion || height <= 0 ? 1 : active ? 1.08 : 1,
        }}
        transition={{
          duration: reduceMotion ? 0 : DUR.color,
          ease: EASE_BRAND,
        }}
        style={{
          transformBox: "view-box",
          transformOrigin: `${x + width / 2}px ${y + height / 2}px`,
        }}
      >
        <Rectangle {...props} isAnimationActive={false} />
      </motion.g>
    );
  };
}

export interface ChartInspectionLegendItem<Key extends string> {
  key: Key;
  color: string;
  label: string;
  ariaLabel: string;
}

/**
 * The keyboard/touch counterpart to linked chart hover. Pointer and focus are
 * transient; activation pins an outcome until it is activated again.
 */
export function ChartInspectionLegend<Key extends string>({
  items,
  activeKey,
  pinnedKey,
  ariaLabel,
  className,
  onPointerKeyChange,
  onFocusKeyChange,
  onToggleKey,
}: {
  items: ChartInspectionLegendItem<Key>[];
  activeKey: Key | null;
  pinnedKey: Key | null;
  ariaLabel: string;
  className?: string;
  onPointerKeyChange: (key: Key | null) => void;
  onFocusKeyChange: (key: Key | null) => void;
  onToggleKey: (key: Key) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onPointerLeave={() => onPointerKeyChange(null)}
      className={cn(
        "grid w-full grid-cols-3 items-center gap-1 sm:flex sm:w-auto sm:flex-wrap sm:justify-end",
        className,
      )}
    >
      {items.map((item) => {
        const active = activeKey === item.key;

        return (
          <button
            key={item.key}
            type="button"
            aria-label={item.ariaLabel}
            aria-pressed={pinnedKey === item.key}
            title={item.label}
            onPointerEnter={() => onPointerKeyChange(item.key)}
            onFocus={() => onFocusKeyChange(item.key)}
            onBlur={() => onFocusKeyChange(null)}
            onClick={(event) => {
              onToggleKey(item.key);
              // A pointer click should fall back to the pinned state, so a
              // second tap can visibly clear it. Keyboard focus stays put.
              if (event.detail > 0) {
                onPointerKeyChange(null);
                event.currentTarget.blur();
              }
            }}
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center gap-1.5 px-2 text-xs transition-colors duration-250",
              active
                ? "bg-muted/55 text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span
              className="h-2 w-2.5 shrink-0"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------- latest-point marker -------------------------- */

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/**
 * A recharts `dot` renderer that marks ONLY the latest point — a filled node
 * inside a thin stroked ring, so the eye lands on "where the trend is now".
 * Every other point renders nothing.
 */
export function latestDot(color: string, lastIndex: number) {
  return function LatestDot({ cx, cy, index }: DotProps) {
    if (index !== lastIndex || cx == null || cy == null) {
      return <g key={`d-${index}`} />;
    }
    return (
      <g key={`d-${index}`}>
        <circle cx={cx} cy={cy} r={5.5} fill="none" stroke={color} strokeWidth={1} />
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
    <div className="min-w-[8.5rem] border border-border bg-popover px-2.5 py-2 text-xs shadow-pop">
      {label != null && (
        <p className="mb-1.5 font-display font-medium text-foreground">
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
            <span className="nums font-display font-semibold text-foreground">
              {valueFormatter ? valueFormatter(p.value, p) : p.value}
            </span>
          </div>
        ))}
      </div>
      {foot && (
        <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-border pt-1.5 text-muted-foreground">
          <span>{foot.label}</span>
          <span className="nums font-display font-semibold text-foreground">{foot.value}</span>
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
