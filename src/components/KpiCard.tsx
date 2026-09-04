// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link } from "react-router-dom";

import { ArrowRight, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toneFg, type Tone } from "@/lib/status";
import { CountUp } from "./CountUp";
import { useInKpiBand } from "./KpiBand";
import { Skeleton } from "./ui/skeleton";

interface KpiCardProps {
  label: string;
  /**
   * A number animates via CountUp; a string renders as-is; anything else (a
   * StatusPill, a truncating name) renders in the value slot untouched, which
   * is what lets dense tiles show something that is not a figure.
   */
  value: React.ReactNode;
  format?: (n: number) => string;
  unit?: string;
  icon: LucideIcon;
  /** Spin the icon — only for genuinely in-flight states, paired with a spinner-shaped icon (Loader2). */
  iconSpin?: boolean;
  tone?: Tone;
  hint?: string;
  /**
   * Names where the tile goes. It is a destination, not a command: no leading
   * "View"/"Manage" — the arrow already says a trip is involved, and matching
   * the destination's own nav word is what lets an operator confirm they landed
   * in the right place. Carry a count when the tile drills to a filtered subset
   * ("9 unprotected"); the number is the information.
   */
  drillLabel?: string;
  /**
   * Where the tile goes. A navigating tile renders as a real anchor, so it has a
   * URL, opens in a new tab and shows up in a screen reader's link list — none
   * of which a `role="button"` div can do. `onClick` stays for the rare tile
   * that acts on the current page instead of travelling.
   */
  to?: string;
  onClick?: () => void;
  /**
   * `compact` is the dense tier: a smaller value, tighter padding, and a value
   * slot that holds a pill or a name rather than a figure. Use it when a row
   * carries more than four tiles, or when the values are not all numbers —
   * a repository name at the headline size is not a headline.
   */
  density?: "default" | "compact";
  /** Trailing marker in the header row, opposite the label (e.g. an immutability lock). */
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  format = (n) => `${Math.round(n)}`,
  unit,
  icon: Icon,
  iconSpin,
  tone = "neutral",
  hint,
  drillLabel,
  to,
  onClick,
  density = "default",
  badge,
  footer,
  loading,
}: KpiCardProps) {
  const clickable = !!to || !!onClick;
  const inBand = useInKpiBand();
  const compact = density === "compact";

  const valueClass = cn(
    "nums font-display tracking-tight",
    compact ? "text-lg font-semibold leading-tight" : "text-3xl font-bold",
    toneFg(tone),
  );

  const rootClass = cn(
    "group relative flex flex-col justify-between overflow-hidden bg-card no-underline",
    compact ? "p-3.5" : "p-4",
    // Inside a band the frame is the band's; a border here would double the
    // hairline the grid gap already draws.
    !inBand && "border border-border",
    clickable && "cursor-pointer transition-colors",
    // A band cell has no frame to shift, so its hover is the surface itself —
    // opaque, because the band's hairline colour sits behind every cell.
    clickable && (inBand ? "hover:bg-accent" : "hover:border-primary/60"),
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4 text-muted-foreground", iconSpin && "animate-spin")} />
          <span className="label-overline">{label}</span>
        </div>
        {badge}
      </div>

      <div className={compact ? "mt-2" : "mt-3"}>
        {loading ? (
          <Skeleton className={compact ? "h-7 w-24" : "h-9 w-28"} />
        ) : (
          <div className={cn("flex items-baseline gap-1", compact && "min-h-[1.75rem]")}>
            {typeof value === "number" ? (
              <CountUp value={value} format={format} className={valueClass} />
            ) : typeof value === "string" ? (
              <span className={valueClass}>{value}</span>
            ) : (
              // A pill or a truncating name: hand it the tier, let it style itself.
              <div className={cn(valueClass, "min-w-0")}>{value}</div>
            )}
            {unit && <span className="font-display text-base font-medium text-muted-foreground">{unit}</span>}
          </div>
        )}
        {hint && !loading && <p className="mt-1 truncate text-xs text-muted-foreground" title={hint}>{hint}</p>}
      </div>

      {(footer || drillLabel) && (
        <div className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
          {footer ?? (
            // The arrow is the component's, not the copy's: a glyph baked into a
            // translated string has to be stripped back out to build an
            // accessible name, and drifts from the icon the card headers use.
            <span className="inline-flex items-center gap-1 font-display font-medium text-foreground/80 transition-colors group-hover:text-primary">
              {drillLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={rootClass} aria-label={drillLabel ?? label}>
        {body}
      </Link>
    );
  }

  return (
    <div
      className={rootClass}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? (drillLabel ?? label) : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {body}
    </div>
  );
}
