// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine, Pause, Play } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/format";
import type { LogLine, LogLevel } from "@/types";
import { Button } from "./ui/button";
import { EmptyState } from "./EmptyState";
import { Terminal } from "@/lib/icons";

/* `--terminal` is near-black in BOTH themes, so nothing drawn on it may follow
 * the page theme. `debug` and `info` are not verdicts, so they are plain
 * terminal ink at two opacities (6.5:1 and 11:1 on the surface). `warn`,
 * `error` and `success` keep their semantic tokens — but the surrounding
 * elements are pinned to the palette drawn for a dark ground (see the `dark`
 * class below), so those tokens resolve to their dark rungs whichever theme the
 * console is in: warn 9.2:1, error 5.4:1, success 12.0:1 on `--terminal`.
 * Reading them from the light palette instead gave 5.2 / 3.5 / 3.5, and the
 * `-text` rungs would have been worse still (3.2 / 2.9 / 2.6) because on light
 * the `-text` rung is the *darker* one. */
const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: "text-[hsl(var(--terminal-foreground))]/60",
  info: "text-[hsl(var(--terminal-foreground))]/80",
  warn: "text-warning",
  error: "text-danger",
  success: "text-success",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
  success: "OK ",
};

interface LogViewerProps {
  lines: LogLine[];
  className?: string;
  height?: number;
  live?: boolean;
}

export function LogViewer({ lines, className, height = 320, live }: LogViewerProps) {
  const { t } = useTranslation("components");
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const FILTERS: { key: "all" | LogLevel; label: string }[] = [
    { key: "all", label: t("common:generic.all") },
    { key: "info", label: t("logViewer.filter.info") },
    { key: "warn", label: t("logViewer.filter.warnings") },
    { key: "error", label: t("logViewer.filter.errors") },
  ];

  const filtered = useMemo(() => {
    if (filter === "all") return lines;
    if (filter === "warn") return lines.filter((l) => l.level === "warn");
    if (filter === "error") return lines.filter((l) => l.level === "error");
    return lines.filter((l) => l.level === filter || l.level === "success");
  }, [lines, filter]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  return (
    <div className={cn("flex flex-col overflow-hidden border border-border bg-[hsl(var(--terminal))]", className)}>
      {/* The toolbar tint and its rule are drawn from the terminal's own ink, so
          they stay a lift on the dark surface in both themes. `dark` pins the
          subtree to the palette drawn for a dark ground — the terminal is one,
          in either theme — so the "live" marker, the ghost buttons' hover and
          every semantic token inside resolve to rungs that are legible here
          rather than to the light theme's dark inks. The outer container is
          deliberately left out of it: its border separates the terminal from the
          page, so it stays on the page's theme. */}
      <div className="dark flex items-center justify-between border-b border-[hsl(var(--terminal-foreground)/0.12)] bg-[hsl(var(--terminal-foreground)/0.05)] px-3 py-1.5 text-[hsl(var(--terminal-foreground))]">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-2 py-0.5 font-display text-xs font-medium transition-colors duration-250",
                filter === f.key
                  ? "bg-[hsl(var(--terminal-foreground)/0.12)] text-[hsl(var(--terminal-foreground))]"
                  : "text-[hsl(var(--terminal-foreground))]/70 hover:text-[hsl(var(--terminal-foreground))]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <span className="flex items-center gap-1.5 text-xs text-info">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-info" />
              </span>
              {t("logViewer.live")}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAutoScroll((v) => !v)}
            aria-label={autoScroll ? t("logViewer.pauseAutoScroll") : t("logViewer.resumeAutoScroll")}
          >
            {autoScroll ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }}
            aria-label={t("logViewer.scrollToLatest")}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="dark overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
        style={{ height }}
      >
        {filtered.length === 0 ? (
          <EmptyState icon={Terminal} title={t("logViewer.empty.title")} description={t("logViewer.empty.description")} compact />
        ) : (
          filtered.map((l) => (
            <div key={l.id} className="flex gap-2 whitespace-pre-wrap py-0.5 animate-fade-up">
              {/* /55 rather than /45: the timestamp is small text and has to
                  clear AA (5.6:1 here, where /45 gave 4.10:1), while staying
                  well behind the message at /80. */}
              <span className="shrink-0 select-none text-[hsl(var(--terminal-foreground))]/55">{formatClock(l.ts)}</span>
              <span className={cn("shrink-0 select-none font-semibold", LEVEL_CLASS[l.level])}>{LEVEL_LABEL[l.level]}</span>
              <span className={cn("min-w-0", LEVEL_CLASS[l.level])}>
                {/* The source prefix names which object emitted the line — it is
                    a label, not a verdict, so it takes plain terminal ink at full
                    strength (17:1) and separates from the message by weight
                    rather than by hue. It used to wear `--primary`, which the
                    operator can repoint from Settings → Appearance and which on
                    light resolved to a dark ice that measured 3.3:1 here. */}
                {l.vmName && (
                  <span className="font-medium text-[hsl(var(--terminal-foreground))]">[{l.vmName}] </span>
                )}
                {l.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
