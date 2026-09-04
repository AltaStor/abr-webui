// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Sizing rules for a user-draggable panel.
 *
 * Kept apart from the React that drives it so the arithmetic — which is where a
 * resizable panel actually goes wrong — can be tested without a DOM: a stored
 * width from a wider monitor must not strand the panel off-screen on a laptop,
 * and a drag must never squeeze the content beside it into nothing.
 */

/** Hard floor: narrower than this and the tree's own labels stop being legible. */
export const PANEL_MIN = 240;
/** Hard ceiling, independent of the viewport. */
export const PANEL_MAX = 640;
/** The content beside the panel never gets less than this. */
export const CONTENT_MIN = 360;

/**
 * Resolve a requested width against both the fixed bounds and the space
 * actually available. `available` is the width of the row holding both columns;
 * pass 0 when it is not measurable yet (first paint, hidden container) and the
 * fixed bounds apply alone.
 */
export function clampPanelWidth(requested: number, available = 0): number {
  if (!Number.isFinite(requested)) return PANEL_MIN;
  // A viewport too narrow to honour CONTENT_MIN would invert the bounds, so the
  // floor wins: better a cramped list than a panel that cannot be dragged back.
  const ceiling = available > 0 ? Math.max(PANEL_MIN, Math.min(PANEL_MAX, available - CONTENT_MIN)) : PANEL_MAX;
  return Math.round(Math.min(Math.max(requested, PANEL_MIN), ceiling));
}

/** Parse a persisted value, rejecting anything that is not a usable number. */
export function parseStoredWidth(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
