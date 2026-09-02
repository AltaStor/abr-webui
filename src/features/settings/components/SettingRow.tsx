// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";

interface SettingRowProps {
  /** Left-hand label — the name of the setting. */
  label: React.ReactNode;
  /** Optional supporting copy under the label. */
  description?: React.ReactNode;
  /** The control(s) on the right. */
  children: React.ReactNode;
  /** Wire a native <label> to a control id for click-to-focus + a11y. */
  htmlFor?: string;
  /**
   * Stack the control under the label even on wide screens (for controls that
   * need the full row width — sliders, list editors, textareas).
   */
  stacked?: boolean;
  className?: string;
}

/**
 * One labelled setting: name + optional description on the left, control on the
 * right. Collapses to a stacked layout on small screens.
 */
export function SettingRow({ label, description, children, htmlFor, stacked, className }: SettingRowProps) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 py-3.5",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <Label
        {...(htmlFor ? { htmlFor } : {})}
        className={cn("min-w-0 space-y-0.5", htmlFor && "cursor-pointer")}
      >
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="max-w-prose text-[13px] leading-relaxed text-muted-foreground">{description}</div>
        )}
      </Label>
      <div className={cn("shrink-0", stacked ? "w-full" : "sm:min-w-[220px] sm:max-w-[340px]")}>{children}</div>
    </div>
  );
}
