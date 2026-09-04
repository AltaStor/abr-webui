// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toneFg, type Tone } from "@/lib/status";

interface MetricProps {
  label: string;
  /** A string truncates and carries a title; anything else renders untouched. */
  value: React.ReactNode;
  /** Optional — plenty of metrics read fine without one, and a glyph invented
   *  purely to satisfy a required prop is noise. */
  icon?: LucideIcon;
  /** Colours the value, never the icon. Most metrics are facts, not verdicts —
   *  leave it unset unless the figure is genuinely a judgement. */
  tone?: Tone;
  /** Sits inline beside the value, baseline-aligned — a qualifier, not a caption. */
  hint?: string;
  /**
   * A second line under the value, at the caption tier. Where `hint` competes
   * with the value for one row's width, `sub` gets its own — which is what a
   * timestamp's absolute companion needs, since both halves are long enough to
   * truncate each other in a three-across strip.
   *
   * It wraps rather than truncates: a metric strip is narrow enough that a full
   * date and time does not fit on one line at every viewport, and a card has
   * the vertical room a table cell does not.
   */
  sub?: string;
  /**
   * `bare` (default) borrows the parent's frame and padding, which is what a
   * supporting figure inside a card wants. `inset` draws the recessed box used
   * when the strip needs to separate itself from the card it sits on.
   */
  surface?: "bare" | "inset";
  className?: string;
}

/**
 * The dense tier: a supporting figure inside something that already owns a
 * frame, a heading and its padding.
 *
 * This is deliberately NOT KpiCard. KpiCard is the headline tile — it draws its
 * own box, sits in a KpiBand at section level, and carries a value at 18–30px.
 * A Metric is subordinate to a heading that is often smaller than a KpiCard's
 * value would be, so pushing these through KpiCard inverted the hierarchy of
 * every panel that used one. Six files each hand-rolled this shape before it
 * existed, between them using four different label treatments and three value
 * sizes for the same idea.
 *
 * The label is always `.label-overline` — the console's one eyebrow treatment.
 */
export function Metric({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  sub,
  surface = "bare",
  className,
}: MetricProps) {
  return (
    <div
      className={cn(
        "min-w-0",
        surface === "inset" && "border border-border bg-muted/20 p-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="label-overline truncate" title={label}>{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn("nums truncate font-display text-sm font-semibold", toneFg(tone ?? "neutral"))}
          title={typeof value === "string" ? value : undefined}
        >
          {value}
        </span>
        {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {sub && (
        <div className="nums text-[11px] leading-tight text-muted-foreground" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}
