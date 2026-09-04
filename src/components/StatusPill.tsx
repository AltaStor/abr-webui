// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";
import { toneChip, type StatusMeta } from "@/lib/status";

interface StatusPillProps {
  meta: StatusMeta;
  size?: "sm" | "md";
  withIcon?: boolean;
  className?: string;
}

export function StatusPill({ meta, size = "md", withIcon = true, className }: StatusPillProps) {
  const Icon = meta.icon;
  const spinning = meta.spin === true;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-display font-medium",
        toneChip(meta.tone),
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      {withIcon && (
        <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5", spinning && "animate-spin")} />
      )}
      {meta.label}
    </span>
  );
}

/** A bare colored dot — for dense rows. */
export function StatusDot({ tone, pulse }: { tone: string; pulse?: boolean }) {
  /* `--muted` is a SURFACE colour, so painting a dot with it renders an all-but
   * invisible mark on the card it sits on — in both themes. Every "unknown"
   * status uses the muted tone, which is exactly the state that must not read as
   * absent. Map it to its foreground here rather than at each call site, which
   * is what the codebase was doing one component at a time. */
  const dot = tone === "muted" ? "muted-foreground" : tone;
  return (
    <span className="relative flex h-2 w-2">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: `hsl(var(--${dot}))` }}
        />
      )}
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ backgroundColor: `hsl(var(--${dot}))` }}
      />
    </span>
  );
}
