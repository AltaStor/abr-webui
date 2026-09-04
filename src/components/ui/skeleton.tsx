// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse bg-muted", className)} {...props} />;
}
