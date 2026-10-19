// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVisibleSections, type SectionKey } from "../lib";

interface SettingsRailProps {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}

/**
 * Left section rail on >= md; a horizontal scroll strip on tablet and a Select
 * on the smallest widths.
 */
export function SettingsRail({ active, onSelect }: SettingsRailProps) {
  const { t } = useTranslation("settings");
  const sections = useVisibleSections();
  return (
    <>
      {/* Mobile: compact Select */}
      <div className="sm:hidden">
        <Select value={active} onValueChange={(v) => onSelect(v as SectionKey)}>
          <SelectTrigger className="h-10" aria-label={t("rail.sectionLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tablet: horizontal scroll strip */}
      <div className="hidden sm:block md:hidden">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onSelect(s.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 border px-3 py-2 font-display text-sm font-medium transition-colors duration-250",
                  isActive
                    ? "border-primary/30 bg-primary/[0.08] text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: sticky vertical rail */}
      <nav aria-label={t("rail.sectionsNav")} className="hidden md:block">
        <div className="sticky top-4 space-y-1">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onSelect(s.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors duration-250",
                  isActive ? "bg-primary/[0.08]" : "hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center transition-colors duration-250",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={cn("block font-display text-sm font-medium", isActive ? "text-foreground" : "text-foreground/90")}>
                    {s.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{s.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
