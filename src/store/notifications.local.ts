// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Alerts the console raises for itself, from what it watches happen.
 *
 * The appliance's own feed (`listAlerts`) reports *standing problems* — the
 * dashboard's problem areas — and hydrate replaces it wholesale on every poll.
 * That makes it the wrong home for "job X finished at 14:02": a moment-in-time
 * event has no standing representation to refetch, so anything written into
 * `world.alerts` is gone 2.5 seconds later.
 *
 * So the events behind Settings → Notifications live here instead: raised by
 * `useEventNotifications` when it sees a run reach a terminal state, kept in
 * localStorage so they survive the reload that re-derives everything else, and
 * merged into the bell alongside the appliance's list.
 *
 * Text is translated at the moment the alert is raised and stored as literal
 * strings, the same shape `listAlerts` produces. A later language switch
 * therefore leaves older entries in the language they were raised in — they
 * are timestamped records of something that already happened, not live views.
 */
import { create } from "zustand";
import type { Alert } from "@/types";

const STORAGE_KEY = "basalt.event-alerts";
/** Newest-first cap. The bell is a recent-activity feed, not an audit log —
 *  Activity and the appliance's audit trail are the durable records. */
const MAX_ALERTS = 100;

function load(): Alert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    // Persisted by a previous (possibly older) build — keep only entries that
    // still satisfy the shape the bell renders.
    return parsed.filter(
      (a): a is Alert =>
        !!a &&
        typeof a === "object" &&
        typeof (a as Alert).id === "string" &&
        typeof (a as Alert).createdAt === "string",
    );
  } catch {
    return [];
  }
}

function save(alerts: Alert[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    /* storage unavailable (private mode / quota) — the bell still works this session */
  }
}

interface EventAlertsState {
  alerts: Alert[];
  /** Raise one event alert. Ignores an id already present, so a replayed
   *  observation (a re-hydrate that re-reports the same finished run) can't
   *  duplicate an entry. */
  raise(alert: Alert): void;
  markRead(id: string): void;
  markAllRead(): void;
  clear(): void;
}

export const useEventAlertsStore = create<EventAlertsState>((set, get) => ({
  alerts: load(),

  raise: (alert) => {
    if (get().alerts.some((a) => a.id === alert.id)) return;
    const alerts = [alert, ...get().alerts].slice(0, MAX_ALERTS);
    save(alerts);
    set({ alerts });
  },

  markRead: (id) => {
    const alerts = get().alerts.map((a) => (a.id === id ? { ...a, read: true } : a));
    save(alerts);
    set({ alerts });
  },

  markAllRead: () => {
    const alerts = get().alerts.map((a) => (a.read ? a : { ...a, read: true }));
    save(alerts);
    set({ alerts });
  },

  clear: () => {
    save([]);
    set({ alerts: [] });
  },
}));
