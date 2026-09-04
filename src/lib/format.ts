// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { formatDistanceToNowStrict, format as formatDate } from "date-fns";

/** Format a GB value into a human storage string (KB/MB/GB/TB/PB). Sub-MB
 * values fall through to KB so a heavily-deduped incremental (a few hundred KB
 * stored) reads as e.g. "244 KB" rather than a misleading "0 MB". */
export function formatStorage(gb: number, digits = 1): string {
  if (gb <= 0) return "0 MB";
  const mb = gb * 1024;
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (gb < 1) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  if (gb < 1024) return `${trimZero(gb.toFixed(digits))} GB`;
  if (gb < 1024 * 1024) return `${trimZero((gb / 1024).toFixed(digits))} TB`;
  return `${trimZero((gb / 1024 / 1024).toFixed(digits))} PB`;
}

/** Throughput in MB/s with sensible scaling. */
export function formatThroughput(mbps: number): string {
  if (mbps >= 1024) return `${(mbps / 1024).toFixed(1)} GB/s`;
  return `${mbps.toFixed(0)} MB/s`;
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
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
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
