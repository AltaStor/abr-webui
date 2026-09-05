// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, Search, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { LogLine } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogViewer } from "@/components/LogViewer";
import { toast } from "@/components/ui/sonner";
import { downloadText, fileStamp } from "@/lib/download";
import { formatInt } from "@/lib/format";
import type { LogSource, SystemLogEntry } from "../types";

interface SystemLogTabProps {
  entries: SystemLogEntry[];
}

/** Order the source chips deterministically; only show sources that appear. */
const SOURCE_ORDER: LogSource[] = [
  "scheduler",
  "session",
  "engine",
  "copy",
  "datad",
  "raid",
  "gc",
  "ntp",
  "api",
  "tiering",
  "vss",
  "iscsi",
  "agent",
];

function toLogLine(e: SystemLogEntry): LogLine {
  return { id: e.id, ts: e.ts, level: e.level, message: e.message, vmName: e.source };
}

/* The chips are a MULTI-select set, not a tab strip, and a tint alone did not
 * say so — it read as "this one is current". A checkbox box says "any number of
 * these", which is what the control actually does. Decorative, so aria-hidden:
 * the state is already carried by each chip's `aria-pressed`. */
function SourceCheck({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-3 w-3 shrink-0 items-center justify-center border transition-colors duration-250",
        on ? "border-primary bg-primary text-primary-foreground" : "border-input",
      )}
    >
      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
    </span>
  );
}

export function SystemLogTab({ entries }: SystemLogTabProps) {
  const { t } = useTranslation("logs");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Set<LogSource>>(new Set());

  const sources = useMemo(() => {
    const present = new Set(entries.map((e) => e.source));
    return SOURCE_ORDER.filter((s) => present.has(s));
  }, [entries]);

  /* `entries` is newest-first; LogViewer expects oldest-first (it appends
   * downward and autoscrolls). The appliance's own log is the whole truth
   * here — nothing is synthesized on top of it. */
  const ordered = useMemo(() => [...entries].reverse(), [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ordered.filter((e) => {
      if (active.size > 0 && !active.has(e.source)) return false;
      if (q && !e.message.toLowerCase().includes(q) && !e.source.includes(q)) return false;
      return true;
    });
  }, [ordered, active, search]);

  const lines = useMemo(() => filtered.map(toLogLine), [filtered]);

  const toggleSource = (s: LogSource) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Source chips + search */}
      <div className="flex flex-col gap-3 border border-border bg-card p-3 ">
        {/* A multi-select filter group, not a tab strip: several chips may be on
            at once, and none-on means every source is shown. The count states
            that outright instead of leaving the operator to infer it. */}
        <div role="group" aria-label={t("system.sourcesGroupLabel")} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-muted-foreground">{t("system.sources")}</span>
            <span className="nums text-xs text-muted-foreground">
              {active.size === 0
                ? t("system.sourcesAllShown", { total: sources.length })
                : t("system.sourcesSomeShown", { selected: active.size, total: sources.length })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActive(new Set())}
              aria-pressed={active.size === 0}
              className={cn(
                "inline-flex items-center gap-1.5 border px-2 py-1 font-display text-xs font-medium transition-colors duration-250",
                active.size === 0
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <SourceCheck on={active.size === 0} />
              {t("common:generic.all")}
            </button>
            {/* "All" is the same checkbox as its neighbours — it is checked
                exactly when none of them are — so the hairline says "and then
                these", not "a different kind of control". */}
            <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
            {sources.map((s) => {
              const on = active.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSource(s)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-xs transition-colors duration-250",
                    on
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-muted/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <SourceCheck on={on} />
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* The search takes the whole row; the download button keeps its natural
            width and wraps to its own line before anything overflows. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:min-w-[240px] sm:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("system.searchPlaceholder")}
              aria-label={t("system.searchLabel")}
              className="pl-8 pr-8"
            />
            {search && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSearch("")}
                aria-label={t("filters.clearSearch")}
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:ml-auto sm:shrink-0">
            <Button
              variant="outline"
              /* Deliberately NOT the header's export: this writes what the
                 search and source chips currently show, in view order, so the
                 filename says `filtered` where the header's says `full`. Two
                 files on one support ticket have to be tellable apart. */
              onClick={() => {
                downloadText(
                  `altastor-system-filtered-${fileStamp()}.log`,
                  filtered.map((e) => `${e.ts} ${e.level.toUpperCase()} [${e.source}] ${e.message}`).join("\n"),
                );
                toast.success(t("toast.exportedSystemFiltered", { count: filtered.length }));
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {t("system.downloadLog")}
            </Button>
          </div>
        </div>
      </div>

      <LogViewer lines={lines} height={460} />

      <p className="text-xs text-muted-foreground">
        {t("system.lineCount", { count: filtered.length, formatted: formatInt(filtered.length) })}
        {active.size > 0 && t("system.filteredToSources", { count: active.size })}
      </p>
    </div>
  );
}
