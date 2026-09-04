// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap border px-2 py-0.5 font-display text-xs font-medium transition-colors duration-250",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        /* A status chip is small text on its family's `-subtle` fill, which is
         * exactly the pairing the `-text` rung exists for. The vivid DEFAULT
         * rung is the fill/icon colour and is not drawn to be read at 12px on
         * its own chip: on light it measured success 4.71 · warning 3.13 ·
         * danger 4.71 · info 4.16, so warning and info failed AA outright and
         * the other two had no margin. The `-text` rungs take the same chips to
         * 6.38 · 5.18 · 5.71 · 6.26 on light and 8.10 · 7.67 · 6.36 · 6.95 on
         * dark. `immutable` was already correct. */
        success: "border-transparent bg-success-subtle text-success-text",
        warning: "border-transparent bg-warning-subtle text-warning-text",
        danger: "border-transparent bg-danger-subtle text-danger-text",
        info: "border-transparent bg-info-subtle text-info-text",
        immutable: "border-transparent bg-immutable-subtle text-immutable-text",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
