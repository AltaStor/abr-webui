// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowDownToLine } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/format";
import type { LogLine, LogLevel } from "@/types";
import { Button } from "./ui/button";
import { EmptyState } from "./EmptyState";
import { Terminal } from "@/lib/icons";

/* `--terminal` now FOLLOWS the theme — near-black on dark, white on light — so
 * everything drawn on it follows the theme too. That is the whole point: the
 * log view used to be a black slab in the middle of a white console because the
 * surface was pinned to one palette and its contents pinned along with it.
 *
 * `debug` and `info` are not verdicts, so they are plain terminal ink at two
 * opacities: /60 measures 6.5:1 on night and 4.8:1 on white, /80 measures 11:1
 * and 9.9:1 — both clear AA on both grounds. `warn`, `error` and `success` take
 * the `-text` rungs rather than the raw fills, because `-text` is the rung each
 * theme defines to be READ at small sizes: the lighter one on dark (warn
 * 11.5:1, error 8.2:1, success 12.0:1 on near-black) and the darker one on
 * light (warn 5.6:1, error 6.6:1, success 7.6:1 on white). The raw fills clear
 * only one of the two grounds. */
const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: "text-[hsl(var(--terminal-foreground))]/60",
  info: "text-[hsl(var(--terminal-foreground))]/80",
  warn: "text-warning-text",
  error: "text-danger-text",
  success: "text-success-text",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
  success: "OK ",
};

/** Within this many pixels of the end counts as "at the bottom". */
const BOTTOM_SLACK_PX = 24;
/** How many of the rows in view are remembered to hold the reader's place. */
const ANCHOR_ROWS = 20;
const NONE: ReadonlySet<string> = new Set();

interface LogViewerProps {
  lines: LogLine[];
  className?: string;
  height?: number;
  live?: boolean;
}

interface Anchor {
  id: string;
  /** The row's distance from the top of the viewport. */
  offset: number;
  time: number;
}

const timeOf = (line: LogLine) => Date.parse(line.ts);

/**
 * A log tail that follows the newest line only while the reader is at the
 * bottom.
 *
 * Following stops the moment the reader scrolls up (or presses Auto-scroll),
 * and from then on nothing moves the view: entries that arrive are counted in
 * an "N new entries" button instead, and when old entries are trimmed off the
 * top the view stays on the rows being read. Scrolling back to the bottom, the
 * button, or Auto-scroll resumes following. Data keeps arriving throughout;
 * only the scrolling is held.
 */
export function LogViewer({ lines, className, height = 320, live }: LogViewerProps) {
  const { t } = useTranslation("components");
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const [following, setFollowingState] = useState(true);
  /** IDs of entries that arrived while not following. */
  const [arrived, setArrived] = useState<ReadonlySet<string>>(NONE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const atBottomRef = useRef(true);
  const anchorsRef = useRef<Anchor[]>([]);
  /** The scrollTop the viewer itself last set, so its scroll event isn't
   *  taken for the reader's. */
  const ownScrollRef = useRef<number | null>(null);
  const seenRef = useRef<{ ids: ReadonlySet<string>; newest: number } | null>(null);

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

  const newCount = useMemo(
    () => (arrived.size === 0 ? 0 : filtered.filter((l) => arrived.has(l.id)).length),
    [filtered, arrived],
  );

  const setFollowing = (on: boolean) => {
    followingRef.current = on;
    setFollowingState(on);
    if (on) setArrived(NONE);
  };

  const scrollTo = (top: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = top;
    // Read back: the browser clamps what it can't honour.
    ownScrollRef.current = el.scrollTop;
  };

  const distanceFromBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight;

  /** Remember which rows are in view and where, to put them back there after
   *  rows above them are trimmed or a filter changes them. Rows are the
   *  viewport's direct children. An empty view (a filter that matches
   *  nothing) keeps what was remembered, so the place survives it. */
  const captureAnchors = () => {
    const el = scrollRef.current;
    if (!el) return;
    const rows = el.children;
    if (!(rows[0] as HTMLElement | undefined)?.dataset.lineId) return;
    let low = 0;
    let high = rows.length - 1;
    let first = rows.length;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const row = rows[mid] as HTMLElement;
      if (row.offsetTop + row.offsetHeight > el.scrollTop) {
        first = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    const anchors: Anchor[] = [];
    for (let i = first; i < rows.length && anchors.length < ANCHOR_ROWS; i += 1) {
      const row = rows[i] as HTMLElement;
      if (row.dataset.lineId) {
        anchors.push({ id: row.dataset.lineId, offset: row.offsetTop - el.scrollTop, time: Number(row.dataset.lineTime) });
      }
    }
    if (anchors.length > 0) anchorsRef.current = anchors;
  };

  const restoreAnchors = () => {
    const el = scrollRef.current;
    const anchors = anchorsRef.current;
    if (!el || anchors.length === 0) return;
    const put = (row: HTMLElement, offset: number) => {
      const delta = row.offsetTop - el.scrollTop - offset;
      if (Math.abs(delta) >= 1) scrollTo(el.scrollTop + delta);
    };
    for (const anchor of anchors) {
      const row = el.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(anchor.id)}"]`);
      if (row) return put(row, anchor.offset);
    }
    // None of them is shown any more (another level filter): the first row
    // from the same moment on takes the place of the first one.
    const rows = [...el.children] as HTMLElement[];
    const next = rows.find((row) => row.dataset.lineId && Number(row.dataset.lineTime) >= anchors[0].time);
    if (next) put(next, anchors[0].offset);
  };

  /* Count what arrives while the reader is elsewhere. An entry is new when it
   * wasn't in the previous lines and isn't older than the newest of them — so
   * older lines a filter brings back into view are not counted as arrivals. */
  useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = {
      ids: new Set(lines.map((l) => l.id)),
      newest: lines.reduce((max, l) => Math.max(max, timeOf(l) || -Infinity), -Infinity),
    };
    if (!previous || followingRef.current) return;
    const fresh = lines.filter((l) => {
      if (previous.ids.has(l.id)) return false;
      const time = timeOf(l);
      return Number.isNaN(time) || time >= previous.newest;
    });
    if (fresh.length > 0) setArrived((prev) => new Set([...prev, ...fresh.map((l) => l.id)]));
  }, [lines]);

  /* After every change to what is shown: pinned to the end while following,
   * otherwise exactly where the reader left it. Before paint, so neither ever
   * flickers. */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (followingRef.current) {
      const end = el.scrollHeight - el.clientHeight;
      if (Math.abs(el.scrollTop - end) >= 1) scrollTo(end);
    } else {
      restoreAnchors();
    }
    atBottomRef.current = distanceFromBottom(el) <= BOTTOM_SLACK_PX;
    captureAnchors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const own = ownScrollRef.current !== null && Math.abs(el.scrollTop - ownScrollRef.current) < 1;
    ownScrollRef.current = null;
    const atBottom = distanceFromBottom(el) <= BOTTOM_SLACK_PX;
    const wasAtBottom = atBottomRef.current;
    atBottomRef.current = atBottom;
    captureAnchors();
    if (own) return;
    if (!atBottom && followingRef.current) setFollowing(false);
    // Coming back down by hand, not merely resting there after a pause.
    else if (atBottom && !wasAtBottom && !followingRef.current) setFollowing(true);
  };

  const jumpToNewest = () => {
    setFollowing(true);
    const el = scrollRef.current;
    if (el) scrollTo(el.scrollHeight - el.clientHeight);
  };

  return (
    <div className={cn("flex flex-col overflow-hidden border border-border bg-[hsl(var(--terminal))]", className)}>
      {/* The toolbar tint and its rule are drawn from the terminal's own ink, so
          they read as a lift on the surface whichever theme it is — a faint
          light wash on night, a faint grey one on white. No `dark` pin any
          more: the terminal is now on the page's theme, so pinning this subtree
          to the dark palette would put light ink on a white toolbar. */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--terminal-foreground)/0.12)] bg-[hsl(var(--terminal-foreground)/0.05)] px-3 py-1.5 text-[hsl(var(--terminal-foreground))]">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
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
            <span className="flex items-center gap-1.5 text-xs text-info-text">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-info" />
              </span>
              {t("logViewer.live")}
            </span>
          )}
          {/* One toggle with a fixed name and a pressed state, instead of an
              icon that flipped between Pause and Play: on means the view
              follows the newest entries, off means it stays put. Scrolling
              flips it too, so it always tells the truth about the view. */}
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={following}
            onClick={() => (following ? setFollowing(false) : jumpToNewest())}
            title={following ? t("logViewer.autoScrollOn") : t("logViewer.autoScrollOff")}
            className={cn(
              "h-6 gap-1.5 border px-2 text-xs",
              following
                ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                : "border-[hsl(var(--terminal-foreground)/0.25)] text-[hsl(var(--terminal-foreground))]/70 hover:text-[hsl(var(--terminal-foreground))]",
            )}
          >
            <ArrowDownToLine className="!size-3.5" />
            {t("logViewer.autoScroll")}
            <span className="sr-only">{following ? t("logViewer.stateOn") : t("logViewer.stateOff")}</span>
          </Button>
        </div>
      </div>
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          // `relative` makes each row's offsetTop count from here; the
          // browser's own scroll anchoring is off because this does it.
          className="relative overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed [overflow-anchor:none]"
          style={{ height }}
        >
          {filtered.length === 0 ? (
            <EmptyState icon={Terminal} title={t("logViewer.empty.title")} description={t("logViewer.empty.description")} compact />
          ) : (
            filtered.map((l) => <LogRow key={l.id} line={l} />)
          )}
        </div>
        {!following && newCount > 0 && (
          <button
            type="button"
            onClick={jumpToNewest}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 bg-primary px-3 py-1 font-display text-xs font-medium text-primary-foreground shadow-md transition-colors duration-250 hover:bg-primary/90"
          >
            {t("logViewer.newEntries", { count: newCount })}
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="sr-only" aria-live="polite">
          {!following && newCount > 0 ? t("logViewer.newEntries", { count: newCount }) : ""}
        </span>
      </div>
    </div>
  );
}

function sameLine(a: LogLine, b: LogLine): boolean {
  return a.id === b.id && a.ts === b.ts && a.level === b.level && a.message === b.message && a.vmName === b.vmName;
}

/** One line. Memoized on its content, so a refresh that brings the same
 *  entries back (as new objects) re-renders none of them. */
const LogRow = memo(
  function LogRow({ line: l }: { line: LogLine }) {
    return (
      <div data-line-id={l.id} data-line-time={timeOf(l)} className="flex gap-2 whitespace-pre-wrap py-0.5 animate-fade-up">
        {/* The timestamp is small text and has to clear AA on BOTH grounds
            now that the terminal follows the theme: /55 measured 5.6:1 on
            night but only 4.09:1 on white, under the 4.5 floor. /65 gives
            7.5:1 and 5.7:1 while staying well behind the message at /80. */}
        <span className="shrink-0 select-none text-[hsl(var(--terminal-foreground))]/65">{formatClock(l.ts)}</span>
        <span className={cn("shrink-0 select-none font-semibold", LEVEL_CLASS[l.level])}>{LEVEL_LABEL[l.level]}</span>
        <span className={cn("min-w-0", LEVEL_CLASS[l.level])}>
          {/* The source prefix names which object emitted the line — it is
              a label, not a verdict, so it takes plain terminal ink at full
              strength and separates from the message by weight rather than
              by hue. It used to wear `--primary`, which the operator can
              repoint from Settings → Appearance and which could land on a
              hue with no contrast left against this surface. */}
          {l.vmName && <span className="font-medium text-[hsl(var(--terminal-foreground))]">[{l.vmName}] </span>}
          {l.message}
        </span>
      </div>
    );
  },
  (prev, next) => sameLine(prev.line, next.line),
);
