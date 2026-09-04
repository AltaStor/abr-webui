// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link } from "react-router-dom";
import { ChevronLeft, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  backTo?: { href: string; label: string };
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, actions, backTo, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {backTo && (
          <Link
            to={backTo.href}
            className="mb-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            {/* The label is not always a short page name — a back link can name
                the object the operator came from — so it truncates rather than
                pushing the header wider than its column. */}
            <span className="truncate">{backTo.label}</span>
          </Link>
        )}
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-9 w-9 items-center justify-center bg-primary/12 text-primary">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
