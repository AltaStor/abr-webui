// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { formatDistanceToNowStrict, format as formatDate } from "date-fns";

/**
 * A NON-BREAKING space, used everywhere below between a number and its unit.
 *
 * A measurement is one token: "130 GB" broken across two lines reads as the
 * number 130 followed by an unrelated "GB", and in a narrow table column — the
 * VM size and backup size columns on Inventory, especially — that is exactly
 * where a plain space lets the browser break it. Nothing here is ever parsed
 * back, so the character is free to be the right one.
 */
const NBSP = "\u00a0";

/** Format a GB value into a human storage string (KB/MB/GB/TB/PB). Sub-MB
 * values fall through to KB so a heavily-deduped incremental (a few hundred KB
 * stored) reads as e.g. "244 KB" rather than a misleading "0 MB". */
export function formatStorage(gb: number, digits = 1): string {
  if (gb <= 0) return `0${NBSP}MB`;
  const mb = gb * 1024;
  if (mb < 1) return `${(mb * 1024).toFixed(0)}${NBSP}KB`;
  if (gb < 1) return `${mb.toFixed(mb < 10 ? 1 : 0)}${NBSP}MB`;
  if (gb < 1024) return `${trimZero(gb.toFixed(digits))}${NBSP}GB`;
  if (gb < 1024 * 1024) return `${trimZero((gb / 1024).toFixed(digits))}${NBSP}TB`;
  return `${trimZero((gb / 1024 / 1024).toFixed(digits))}${NBSP}PB`;
}

/**
 * Display name for a restore run. A restore has no backing job (the appliance
 * never creates one), so the Activity feed's RUN column would otherwise show
 * the "—" placeholder for every restore. Naming it after the VM it produces
 * makes restores identifiable in the feed without opening the log.
 *
 * Shared by the API mapper and the live store so both spell it identically —
 * a session named one way on first fetch and another on the next poll would
 * flicker in the feed.
 */
export function restoreRunName(vmName: string | undefined | null): string {
  const name = (vmName ?? "").trim();
  return name ? `Restore · ${name}` : "Restore";
}

/** Display name for a verification run — same problem and same shape as
 *  `restoreRunName`: an integrity check runs against a stored chain, not a job,
 *  so it has no job.name to fall back to. */
export function verifyRunName(vmName: string | undefined | null): string {
  const name = (vmName ?? "").trim();
  return name ? `Verify · ${name}` : "Verify";
}

/** Throughput in MB/s with sensible scaling. */
export function formatThroughput(mbps: number): string {
  if (mbps >= 1024) return `${(mbps / 1024).toFixed(1)}${NBSP}GB/s`;
  return `${mbps.toFixed(0)}${NBSP}MB/s`;
}

/** Compact integer formatting (1.2k, 3.4M). */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: n >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Full grouped integer (e.g. "1,234"). Locale-aware replacement for stray
 *  `Number.prototype.toLocaleString()` call sites. */
export function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** Duration in seconds → "1h 12m", "4m 03s", "38s". */
export function formatDuration(totalSec: number): string {
  if (totalSec < 60) return `${Math.round(totalSec)}s`;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}h${NBSP}${m.toString().padStart(2, "0")}m`;
  return `${m}m${NBSP}${s.toString().padStart(2, "0")}s`;
}

/** "2 hours ago", "in 4 hours". Falls back gracefully for null. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  const now = Date.now();
  const diff = date.getTime() - now;
  const abs = formatDistanceToNowStrict(date, { addSuffix: false });
  return diff > 0 ? `in ${abs}` : `${abs} ago`;
}

/** Distance with no direction word — "4 hours", not "in 4 hours". For a
 *  countdown whose label already points the way.
 *
 *  A moment that has already passed keeps its suffix: the label only points
 *  forward, so dropping the direction on an overdue run would print it as an
 *  upcoming one. `nextRunAt` sits in the past for the whole of a run and for
 *  any job whose backup window is shut, so this is the common case. */
export function formatCountdown(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (date.getTime() <= Date.now()) return formatRelative(iso);
  return formatDistanceToNowStrict(date);
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(new Date(iso), "HH:mm:ss");
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(new Date(iso), "MMM d, HH:mm");
}

export function formatFullDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(new Date(iso), "EEE, MMM d yyyy · HH:mm");
}

export function formatDay(iso: string): string {
  return formatDate(new Date(iso), "MMM d");
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, "");
}

/** Storage percentage used. */
export function usagePercent(usedGB: number, capacityGB: number): number {
  if (capacityGB <= 0) return 0;
  return Math.min(100, (usedGB / capacityGB) * 100);
}
