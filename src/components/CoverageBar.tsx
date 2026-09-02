// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";

interface CoverageBarProps {
  /** Protected / warning / unprotected VM counts. */
  protectedCount: number;
  warning: number;
  unprotected: number;
  /** Tailwind height class, e.g. "h-1.5" (default) or "h-2". */
  height?: string;
  className?: string;
}

/**
 * The single segmented protection-coverage bar used everywhere protection is
 * shown as a proportion — the infrastructure topology rollups and the inventory
 * coverage strip. One vocabulary, one component, so green/amber/red always mean
 * the same thing at the same weights.
 */
export function CoverageBar({
  protectedCount,
  warning,
  unprotected,
  height = "h-1.5",
  className,
}: CoverageBarProps) {
  const total = protectedCount + warning + unprotected || 1;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className={cn("flex overflow-hidden bg-muted", height, className)}>
      {protectedCount > 0 && <span className="h-full bg-success" style={{ width: `${pct(protectedCount)}%` }} />}
      {warning > 0 && <span className="h-full bg-warning" style={{ width: `${pct(warning)}%` }} />}
      {unprotected > 0 && <span className="h-full bg-danger" style={{ width: `${pct(unprotected)}%` }} />}
    </div>
  );
}
