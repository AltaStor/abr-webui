// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * "Work in progress" tag for sidebar entries whose UI has no backing in the
 * current VMware orchestrator yet.
 */
import { cn } from "@/lib/utils";

export function WipBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-warning/40 bg-warning-subtle px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.14em] text-warning-text",
        className,
      )}
    >
      WIP
    </span>
  );
}
