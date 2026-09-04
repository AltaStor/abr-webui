// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Search, X } from "@/lib/icons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_FILTERS, type StatusFilter } from "../lib";

interface ActivityFiltersProps {
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  job: string;
  onJob: (id: string) => void;
  jobOptions: { id: string; name: string }[];
  search: string;
  onSearch: (q: string) => void;
}

export function ActivityFilters({
  status,
  onStatus,
  job,
  onJob,
  jobOptions,
  search,
  onSearch,
}: ActivityFiltersProps) {
  const { t } = useTranslation("activity");
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Segmented status control */}
      <div
        role="group"
        aria-label={t("filters.statusGroupLabel")}
        className="flex w-full items-center gap-0.5 border border-border bg-card p-0.5 sm:w-auto"
      >
        {STATUS_FILTERS.map((f) => {
          const active = status === f.key;
          return (
            <button
              key={f.key}
              aria-pressed={active}
              onClick={() => onStatus(f.key)}
              className={cn(
                "relative flex-1 px-3 py-1.5 font-display text-xs font-medium transition-colors duration-250 sm:flex-none",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="activity-status-pill"
                  className="absolute inset-0 bg-muted"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search first and taking the row, job filter at its own width — the
          toolbar shape Backup, Inventory and Logs already use. */}
      <div className="flex w-full items-center gap-2 sm:flex-1">
        {/* Search */}
        <div className="relative w-full sm:min-w-[16rem] sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            aria-label={t("filters.searchLabel")}
            className="pl-8 pr-8"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onSearch("")}
              aria-label={t("filters.clearSearch")}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Job filter */}
        <Select value={job} onValueChange={onJob}>
          <SelectTrigger className="h-9 w-full sm:w-[200px] sm:shrink-0" aria-label={t("filters.jobLabel")}>
            <SelectValue placeholder={t("filters.allJobs")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allJobs")}</SelectItem>
            {jobOptions.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
