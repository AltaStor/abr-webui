// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { LucideIcon } from "@/lib/icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Optional right-aligned header slot (a button, a status chip …). */
  headerAside?: React.ReactNode;
  /** Sticky action footer — typically the Save / Discard bar. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Remove the default vertical padding on the content region. */
  flush?: boolean;
  className?: string;
}

/**
 * A titled card that frames one logical group of settings. Rows inside are
 * usually <SettingRow> children separated by hairline dividers.
 */
export function SettingsSection({
  title,
  description,
  icon: Icon,
  headerAside,
  footer,
  children,
  flush,
  className,
}: SettingsSectionProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border/60 bg-muted/25 py-4">
        <div className="flex items-start gap-2.5">
          {Icon && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
        </div>
        {headerAside && <div className="shrink-0">{headerAside}</div>}
      </CardHeader>
      <CardContent className={cn(flush ? "p-0" : "px-5 py-1")}>{children}</CardContent>
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/25 px-5 py-3">
          {footer}
        </div>
      )}
    </Card>
  );
}

/** A hairline divider between stacked SettingRows inside a section. */
export function SettingDivider() {
  return <div className="border-t border-border/50" />;
}
