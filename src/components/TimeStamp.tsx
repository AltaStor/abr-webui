// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatFullDateTime, formatRelative } from "@/lib/format";

interface TimeStampProps {
  value: string | null | undefined;
  /** Size of the relative line. The absolute companion is always 11px. */
  size?: "sm" | "xs";
  align?: "left" | "right";
  /** What to print when there is no timestamp. Defaults to "Never". */
  fallback?: ReactNode;
  className?: string;
}

/**
 * A moment in time, printed the way the console has to answer two questions at
 * once: the relative line on top ("2 hours ago") says whether it is fresh, and
 * the absolute line beneath ("Sep 1, 23:29") says *which* run or restore
 * point it actually was.
 *
 * Neither works alone. Relative-only collapses the moment two rows both read
 * "1 hour ago" — the operator can see the estate is current but cannot tell one
 * run from another, or match a row against a maintenance window. Absolute-only
 * makes the reader do arithmetic on every glance. The jobs table's Last run
 * column shipped the pair first; this is that treatment as one component, so
 * every table cell and list row that names a moment reads the same way.
 *
 * The fuller stamp — weekday and year — stays a hover away rather than taking a
 * third line.
 *
 * Not for durations (`formatDuration`) or for a value whose absolute stamp is
 * already the primary line, as on a restore point row.
 */
export function TimeStamp({
  value,
  size = "sm",
  align = "left",
  fallback,
  className,
}: TimeStampProps) {
  const primary = size === "xs" ? "text-xs" : "text-sm";

  if (!value) {
    return (
      <span
        className={cn(
          "nums block text-muted-foreground",
          primary,
          align === "right" && "text-right",
          className,
        )}
      >
        {fallback ?? formatRelative(null)}
      </span>
    );
  }

  return (
    <div
      className={cn("min-w-0", align === "right" && "text-right", className)}
      title={formatFullDateTime(value)}
    >
      <span className={cn("nums block truncate text-muted-foreground", primary)}>
        {formatRelative(value)}
      </span>
      <span className="nums block truncate text-[11px] text-muted-foreground">
        {formatDateTime(value)}
      </span>
    </div>
  );
}
