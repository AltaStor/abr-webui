// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Client-side file export — turns in-memory data into a real browser download
 * (Blob + object URL). Used by the Logs and Reports "Export" actions so they
 * produce an actual .csv / .log file instead of a placeholder toast.
 */

/** Trigger a browser download of an already-built Blob as `filename`. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8"): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/** Serialize rows to CSV. `columns` fixes the column order/subset; defaults to
 * the keys of the first row. Values with commas/quotes/newlines are escaped. */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return columns ? `${columns.join(",")}\n` : "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

/** Compact "YYYYMMDD-HHmm" stamp for export filenames. */
export function fileStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
