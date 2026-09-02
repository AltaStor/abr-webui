// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";

interface SpecRowProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

/** A label / value row for the VM specs card. */
export function SpecRow({ label, children, className }: SpecRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium">{children}</span>
    </div>
  );
}
