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
    <div className={cn("flex flex-col overflow-hidden rounded-lg border border-border bg-[hsl(var(--terminal))]", className)}>
      <div className="flex items-center justify-between border-b border-border/70 bg-white/[0.04] px-3 py-1.5 text-[hsl(var(--terminal-foreground))]">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-white/10 text-[hsl(var(--terminal-foreground))]"
                  : "text-[hsl(var(--terminal-foreground))]/55 hover:text-[hsl(var(--terminal-foreground))]",
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
        className="overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed"
        style={{ height }}
      >
        {filtered.length === 0 ? (
          <EmptyState icon={Terminal} title={t("logViewer.empty.title")} description={t("logViewer.empty.description")} compact />
        ) : (
          filtered.map((l) => (
            <div key={l.id} className="flex gap-2 whitespace-pre-wrap py-0.5 animate-fade-up">
              <span className="shrink-0 select-none text-[hsl(var(--terminal-foreground))]/45">{formatClock(l.ts)}</span>
              <span className={cn("shrink-0 select-none font-semibold", LEVEL_CLASS[l.level])}>{LEVEL_LABEL[l.level]}</span>
              <span className={cn("min-w-0", LEVEL_CLASS[l.level])}>
                {l.vmName && <span className="text-primary/90">[{l.vmName}] </span>}
                {l.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
