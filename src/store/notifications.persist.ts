// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Cross-reload persistence for the notification bell's read state.
 *
 * Alerts themselves are re-derived on every hydrate/poll (live mode refetches
 * from the appliance; sim mode reseeds on reload) and always come back with
 * `read: false` — without this, marking one read never survives the next
 * refresh (live re-polls alerts on every `alert.created` event) or a page
 * reload. We persist just the set of read ids to localStorage and reapply it
 * to whatever alert list shows up next, the same pattern the settings store
 * uses to survive reloads.
 */
import type { Alert } from "@/types";

const STORAGE_KEY = "basalt.read-alerts";
/** Caps localStorage growth; oldest-marked ids fall off first. */
const MAX_TRACKED = 500;

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-MAX_TRACKED)));
  } catch {
    /* storage unavailable (private mode / quota) — read state just won't survive a reload */
  }
}

/** Re-applies persisted read ids to a freshly-fetched/reseeded alert list. */
export function applyReadState(alerts: Alert[]): Alert[] {
  const read = load();
  if (read.size === 0) return alerts;
  return alerts.map((a) => (a.read || !read.has(a.id) ? a : { ...a, read: true }));
}

export function persistAlertRead(id: string): void {
  const read = load();
  read.add(id);
  save(read);
}

export function persistAllAlertsRead(alerts: Alert[]): void {
  const read = load();
  for (const a of alerts) read.add(a.id);
  save(read);
}
