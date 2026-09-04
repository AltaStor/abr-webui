// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, Radio, Search, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { LogLine } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LogViewer } from "@/components/LogViewer";
import { toast } from "@/components/ui/sonner";
import { downloadText, fileStamp } from "@/lib/download";
import { formatInt } from "@/lib/format";
import type { WorldMode } from "@/store/world.types";
import type { LogSource, SystemLogEntry } from "../types";
import { synthesizeLiveLine } from "../mock";

interface SystemLogTabProps {
  entries: SystemLogEntry[];
  /**
   * World mode. Only the sim may synthesize tail lines; a live appliance's log
   * carries what the appliance actually recorded and nothing else.
   */
  mode: WorldMode;
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

export function SystemLogTab({ entries, mode }: SystemLogTabProps) {
  const { t } = useTranslation("logs");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Set<LogSource>>(new Set());
  const [tailing, setTailing] = useState(false);
  const [synthesized, setSynthesized] = useState<SystemLogEntry[]>([]);
  const seqRef = useRef(0);

  /* Live tail — SIM ONLY appends one synthesized line every ~2s.
   *
   * On a real appliance this effect used to fabricate RAID scrubs, SMART
   * reallocated-sector warnings and object-verification all-clears, stamp them
   * with `new Date()` and merge them indistinguishably into the appliance's own
   * log — including its "Download log" export. An operator could pull a healthy
   * disk on the strength of an invented warning. In LIVE the toggle only follows
   * the appliance's own stream: `system` is rebuilt from the live world on every
   * SSE revision, so real lines keep arriving on their own and the switch just
   * pins the viewer to the tail. */
  useEffect(() => {
    if (!tailing || mode !== "sim") return;
    const iv = window.setInterval(() => {
      seqRef.current += 1;
      const line = synthesizeLiveLine(seqRef.current);
      setSynthesized((prev) => [...prev.slice(-120), line]);
    }, 2000);
    return () => window.clearInterval(iv);
  }, [tailing, mode]);

  /* Switching worlds does not remount this tab — `setWorldMode` swaps the world
   * in place and the route key ignores it — so lines synthesized during a demo
   * session would otherwise survive into the live view, and into its "Download
   * log" export and line count. Drop them the moment the world stops being sim. */
  useEffect(() => {
    if (mode !== "sim") setSynthesized([]);
  }, [mode]);

  const sources = useMemo(() => {
    const present = new Set(entries.map((e) => e.source));
    return SOURCE_ORDER.filter((s) => present.has(s));
  }, [entries]);

  const merged = useMemo(() => {
    // Base is newest-first; LogViewer expects oldest-first (it appends downward
    // and autoscrolls). Reverse to chronological, then append the sim tail
    // (empty in live mode, where `entries` is the whole truth).
    const base = [...entries].reverse();
    return [...base, ...synthesized];
  }, [entries, synthesized]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter((e) => {
      if (active.size > 0 && !active.has(e.source)) return false;
      if (q && !e.message.toLowerCase().includes(q) && !e.source.includes(q)) return false;
      return true;
    });
  }, [merged, active, search]);

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
      {/* Source chips + search + live tail */}
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

        {/* The search takes the whole row; the tail/download group keeps its
            natural width and wraps to its own line before anything overflows. */}
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
            <div className="flex h-9 items-center gap-2 border border-border bg-background px-2.5">
              <Radio className={cn("h-4 w-4", tailing ? "text-info" : "text-muted-foreground")} />
              <Label htmlFor="live-tail" className="cursor-pointer text-xs font-medium">
                {t("system.liveTail")}
              </Label>
              <Switch
                id="live-tail"
                checked={tailing}
                onCheckedChange={setTailing}
                aria-label={t("system.toggleLiveTail")}
              />
            </div>
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

      <LogViewer lines={lines} height={460} live={tailing} />

      <p className="text-xs text-muted-foreground">
        {t("system.lineCount", { count: filtered.length, formatted: formatInt(filtered.length) })}
        {active.size > 0 && t("system.filteredToSources", { count: active.size })}
        {tailing && (mode === "live" ? t("system.following") : t("system.streaming"))}
      </p>
    </div>
  );
}
