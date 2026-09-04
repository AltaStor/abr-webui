// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PROTECTION_META, toneFg } from "@/lib/status";
import type { ProtectionStatus } from "@/types";

export type ProtectionFilter = "all" | ProtectionStatus;

interface ProtectionFilterChipsProps {
  value: ProtectionFilter;
  counts: Record<ProtectionStatus, number>;
  total: number;
  onChange: (value: ProtectionFilter) => void;
}

const ORDER: ProtectionStatus[] = ["protected", "warning", "unprotected"];

/** Segmented protection-status chips with live counts, used as the primary filter. */
export function ProtectionFilterChips({ value, counts, total, onChange }: ProtectionFilterChipsProps) {
  const { t } = useTranslation("inventory");
  return (
    <div
      role="group"
      aria-label={t("filters.byProtection")}
      /* min-h-9, not h-9: the chips settle on the one control height the header
         and the rest of the toolbar share, but the group still has to grow when
         four chips wrap onto a second line on a narrow viewport. */
      className="inline-flex min-h-9 flex-wrap items-center gap-1 border border-border bg-card p-0.5"
    >
      <Chip active={value === "all"} onClick={() => onChange("all")}>
        <span className="text-sm font-medium">{t("common:generic.all")}</span>
        <Count active={value === "all"}>{total}</Count>
      </Chip>
      {ORDER.map((status) => {
        const meta = PROTECTION_META[status];
        const Icon = meta.icon;
        const active = value === status;
        return (
          <Chip key={status} active={active} onClick={() => onChange(status)}>
            <Icon className={cn("h-3.5 w-3.5", active ? toneFg(meta.tone) : "text-muted-foreground")} />
            <span className="text-sm font-medium">{meta.label}</span>
            <Count active={active}>{counts[status]}</Count>
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "tap-target inline-flex items-center gap-1.5 px-2.5 py-1 transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Count({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "nums px-1 text-xs font-semibold tabular-nums",
        active ? "bg-background/70 text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
