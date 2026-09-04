// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PANEL_MAX, PANEL_MIN, clampPanelWidth, parseStoredWidth } from "@/lib/panel-width";

/** Arrow-key step, and the coarser step Shift buys. */
const STEP = 16;
const STEP_COARSE = 64;

/**
 * A user-draggable width for a side panel, persisted per call site.
 *
 * The width is applied through a CSS custom property rather than React state on
 * the grid, so a drag repaints one column rather than re-rendering the tree and
 * the table under it on every pointer move.
 */
export function useResizablePanel(storageKey: string, defaultWidth: number) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);

  /**
   * Space the two columns actually share — the row minus the gap between them.
   * Measuring the row alone hands the gap to the panel twice over and lets a
   * full-right drag squeeze the list under its own floor by exactly that gap.
   */
  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return 0;
    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    return Math.max(0, row.getBoundingClientRect().width - gap);
  }, []);

  // Restore after mount, never during render: the stored value has to be
  // re-clamped against THIS viewport, which is not knowable on the server or on
  // the first paint. A width saved on a 27" monitor would otherwise open a
  // laptop with the list pushed off the edge.
  useEffect(() => {
    let stored: number | null = null;
    try {
      stored = parseStoredWidth(window.localStorage.getItem(storageKey));
    } catch {
      /* storage unavailable — the default is a fine answer */
    }
    setWidth(clampPanelWidth(stored ?? defaultWidth, measure()));
  }, [storageKey, defaultWidth, measure]);

  const commit = useCallback(
    (next: number) => {
      const clamped = clampPanelWidth(next, measure());
      setWidth(clamped);
      try {
        window.localStorage.setItem(storageKey, String(clamped));
      } catch {
        /* a panel that resizes but cannot remember still beats one that throws */
      }
    },
    [storageKey, measure],
  );

  // A window narrowed after the fact must pull the panel back in, or the list
  // beside it is squeezed out with no way to recover but a reload.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampPanelWidth(w, measure()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  return { rowRef, width, commit, reset: () => commit(defaultWidth) };
}

interface ResizeHandleProps {
  width: number;
  onCommit: (next: number) => void;
  onReset: () => void;
  /** Accessible name — say which panel this resizes. */
  label: string;
  className?: string;
}

/**
 * The grab strip between two columns.
 *
 * A `separator` with a value is the ARIA pattern for a split: screen readers
 * announce it as a slider, and the arrow keys work without a pointer, which is
 * the whole reason this is a focusable element and not a bare `onMouseDown`.
 */
export function ResizeHandle({ width, onCommit, onReset, label, className }: ResizeHandleProps) {
  const { t } = useTranslation("common");
  // Whether a drag is live is a ref, not state: pointermove can arrive in the
  // same task as pointerdown, and a state read there is the pre-render value —
  // the move is silently dropped. The ref is what the handlers branch on; the
  // state exists only to repaint the hairline.
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Pointer capture keeps the drag alive when the cursor outruns this 9px
    // strip, which it always does.
    // Capture can be refused for a pointer the element never legitimately owns;
    // losing it costs a smooth drag past the strip, not the drag itself.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* proceed uncaptured */
    }
    start.current = { x: e.clientX, w: width };
    draggingRef.current = true;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onCommit(start.current.w + (e.clientX - start.current.x));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured, or already released */
    }
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? STEP_COARSE : STEP;
    if (e.key === "ArrowLeft") { e.preventDefault(); onCommit(width - step); }
    else if (e.key === "ArrowRight") { e.preventDefault(); onCommit(width + step); }
    else if (e.key === "Home" || e.key === "Enter") { e.preventDefault(); onReset(); }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      tabIndex={0}
      title={t("resize.hint")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      className={cn(
        // A wide-enough grab strip around a hairline: the line is the affordance,
        // the padding is what makes it catchable.
        "group absolute inset-y-0 -right-2.5 z-10 hidden w-5 cursor-col-resize touch-none select-none lg:block",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-250",
          dragging ? "bg-primary" : "bg-transparent group-hover:bg-primary/60",
        )}
      />
    </div>
  );
}
