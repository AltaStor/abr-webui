// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ (AltaStor.com)

import type { LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface SpecRowProps {
  label: string;
  /** Marks the parameter, so it sits by the label, not the value (ABR-559). */
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

/** A label / value row for the VM specs card. */
export function SpecRow({ label, icon: Icon, children, className }: SpecRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2", className)}>
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm font-medium">{children}</span>
    </div>
  );
}
