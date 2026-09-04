// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CountUpProps {
  value: number;
  /** Format the interpolated number for display. */
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animated count-up that eases to its target and re-animates when the target changes. */
export function CountUp({ value, format = (n) => `${Math.round(n)}`, durationMs = 900, className }: CountUpProps) {
  const [display, setDisplay] = useState(prefersReducedMotion() ? value : 0);
  const fromRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (value - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  /* The display face carries no `tnum` feature, so a value whose digit COUNT
   * changes mid-animation would reflow the box (and shove whatever sits beside
   * it). Reserving the settled string's width up front holds the box still: a
   * count-up never renders more characters than it ends with. */
  const settled = format(value);

  return (
    <span className={cn("nums inline-block", className)} style={{ minWidth: `${settled.length}ch` }}>
      <span aria-hidden="true">{format(display)}</span>
      <span className="sr-only">{settled}</span>
    </span>
  );
}
