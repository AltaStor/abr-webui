// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { FlaskConical } from "@/lib/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Marks a feature that is not finished: a small "Experimental" badge with a
 * flask, placed once next to the feature's name (a section or page title),
 * never on every control inside it. A click opens what that means for this
 * feature, as GitLab's experiment badge, Elastic's technical preview badge and
 * VS Code's Experimental tag do. Take it off when the feature is finished.
 */
export function ExperimentalBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  const { t } = useTranslation("common");
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        data-testid="experimental-badge"
        className={cn(
          "inline-flex items-center gap-1 border border-info/40 bg-info-subtle px-1.5 py-px align-middle font-display text-[11px] font-medium leading-4 text-info-text transition-colors hover:border-info/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <FlaskConical className="h-3 w-3" aria-hidden />
        {t("experimental.label")}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-1.5 text-[13px] leading-relaxed">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <FlaskConical className="h-3.5 w-3.5 text-info-text" aria-hidden />
          {t("experimental.title")}
        </p>
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
