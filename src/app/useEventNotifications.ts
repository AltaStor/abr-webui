// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The consumer side of Settings → Notifications → Events.
 *
 * Those four switches used to be inert: the settings store recorded them and
 * nothing read them back, so turning "Job failed" on changed nothing anywhere
 * in the console. This watches the hydrated world for the moments they name
 * and raises a notification for each one the operator asked for — a toast for
 * immediacy, and a bell entry (see `notifications.local`) so it survives being
 * missed.
 *
 * Detection is by *transition*, not by state: the poll re-hydrates the whole
 * world every couple of seconds, so "this session is failed" is true on every
 * pass and would notify forever. We keep the last status seen per session and
 * fire only when it changes into a terminal one.
 *
 * The first pass after connecting seeds that baseline **without** notifying —
 * otherwise every historical run in the hydrated list would look like it had
 * just finished, and connecting would spray a hundred toasts.
 *
 * A run the console has never seen before is judged by when it *started*, not
 * by when it turned up: the store only holds the newest page of history and
 * "Load older runs" pours pages of long-finished runs into it, none of which is
 * news. So an unseen finished run notifies only if it began after this watch
 * did — which is exactly the short run that started and completed between two
 * polls, and never the ones fetched out of the archive.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/sonner";
import { capacityLevel, type CapacityLevel } from "@/lib/capacity";
import { useSettingsStore } from "@/store/settings";
import { useEventAlertsStore } from "@/store/notifications.local";
import { useWorldStore } from "@/store/world";
import type { Alert, AlertSeverity, Session, SessionStatus } from "@/types";

/** Statuses a run can no longer move out of. */
const TERMINAL: ReadonlySet<SessionStatus> = new Set<SessionStatus>(["success", "warning", "failed"]);

function isTerminal(status: SessionStatus): boolean {
  return TERMINAL.has(status);
}

/** A finished run's severity, used for both the toast and the bell glyph. */
function severityOf(status: SessionStatus): AlertSeverity {
  if (status === "failed") return "critical";
  if (status === "warning") return "warning";
  return "success";
}

/**
 * Which switch governs a finished run.
 *
 * A restore answers to "Restore completed" whatever its outcome — the operator
 * asked to hear when a recovery ends, and a recovery that ended badly is the
 * case they most need to hear about. For a backup, "failed" is the failure
 * event and both clean and warned completions are the success event: a run
 * that warned did finish, and someone who muted successes has said they don't
 * want to hear about runs that completed.
 */
function eventKeyFor(session: Session): "jobFailure" | "jobSuccess" | "restoreCompleted" {
  if (session.type === "restore") return "restoreCompleted";
  return session.status === "failed" ? "jobFailure" : "jobSuccess";
}

/** Whether a run began after the watch took its baseline. An unparseable or
 *  missing start time is treated as old: a notification wrongly withheld is a
 *  smaller failure than a burst of them for runs that finished last month. */
function startedSinceBaseline(session: Session, baselineAt: number): boolean {
  const started = new Date(session.startedAt).getTime();
  return Number.isFinite(started) && started >= baselineAt;
}

/** Stable id, so the same finished run can never produce two bell entries even
 *  across a reload (the store de-duplicates on it). */
const sessionAlertId = (session: Session) => `event:session:${session.id}:${session.status}`;
const capacityAlertId = (repoId: string, level: CapacityLevel, pct: number) =>
  `event:capacity:${repoId}:${level}:${Math.round(pct)}`;

export function useEventNotifications(): void {
  const { t } = useTranslation("layout");
  const ready = useWorldStore((s) => s.ready);
  const sessions = useWorldStore((s) => s.sessions);
  const repositories = useWorldStore((s) => s.repositories);

  /** Last status seen per session id; empty until the baseline is seeded. */
  const seenStatus = useRef<Map<string, SessionStatus>>(new Map());
  /** Last capacity tier seen per repository id. */
  const seenLevel = useRef<Map<string, CapacityLevel>>(new Map());
  const seeded = useRef(false);
  /** When the baseline was taken — the cutoff for "this run is news". */
  const baselineAt = useRef(0);

  // Re-seed from scratch whenever the console disconnects: on reconnect the
  // world is rebuilt from a fresh hydrate, and anything that finished while we
  // were away is history, not news.
  useEffect(() => {
    if (!ready) {
      seeded.current = false;
      baselineAt.current = 0;
      seenStatus.current.clear();
      seenLevel.current.clear();
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;

    // Read the *saved* settings, not a snapshot captured in a selector: this
    // effect re-runs on every world change, and reading at fire time means a
    // switch flipped a second ago already applies.
    const events = useSettingsStore.getState().notifications.events;
    const { capacityWarnPct, capacityCriticalPct } = useSettingsStore.getState().storageDefaults;
    const raise = useEventAlertsStore.getState().raise;

    const firstPass = !seeded.current;
    if (firstPass) baselineAt.current = Date.now();

    /* ------------------------------ runs ------------------------------- */
    for (const session of sessions) {
      const previous = seenStatus.current.get(session.id);
      seenStatus.current.set(session.id, session.status);
      if (firstPass) continue; // baseline only
      if (previous === session.status) continue;
      if (!isTerminal(session.status)) continue;
      // Never seen before: only news if it began after we started watching.
      // Anything older arrived from "Load older runs", not from the appliance
      // finishing something.
      if (previous === undefined && !startedSinceBaseline(session, baselineAt.current)) continue;

      // A verification has no job behind it (the appliance runs it against a
      // stored chain), so the bell's job routing below would deep-link to an
      // empty job id. It is also already reported where it was asked for — the
      // Backups tab toasts each run's verdict — and the Activity feed keeps the
      // record either way, so it does not belong in this loop.
      if (session.type === "verify") continue;
      // Same for a deletion: no job behind it either, so the routing below
      // would deep-link to an empty job id, and the bell would announce the
      // removal of a chain under the job placeholder name.
      if (session.type === "delete") continue;

      const key = eventKeyFor(session);
      if (!events[key]) continue;

      const severity = severityOf(session.status);
      const name = session.jobName;
      const title =
        key === "restoreCompleted"
          ? t(`notifications.event.restore.${session.status === "failed" ? "failed" : "done"}`, { name })
          : t(`notifications.event.job.${session.status}`, { name });
      const body = session.message?.trim() || t(`notifications.event.body.${session.status}`, { name });

      const alert: Alert = {
        id: sessionAlertId(session),
        severity,
        // Restores have no category of their own; they are runs, and the bell
        // routes them by `entityType` instead.
        category: "job",
        title,
        message: body,
        createdAt: session.finishedAt ?? new Date().toISOString(),
        read: false,
        entityType: session.type === "restore" ? "session" : "job",
        entityId: session.type === "restore" ? session.id : session.jobId,
      };
      raise(alert);

      const notify =
        severity === "critical" ? toast.error : severity === "warning" ? toast.warning : toast.success;
      notify(title, { description: body });
    }

    // Sessions that fell out of the hydrated window can't transition again;
    // dropping them keeps the map from growing without bound on a long session.
    if (seenStatus.current.size > sessions.length) {
      const live = new Set(sessions.map((s) => s.id));
      for (const id of seenStatus.current.keys()) if (!live.has(id)) seenStatus.current.delete(id);
    }

    /* --------------------------- repositories --------------------------- */
    for (const repo of repositories) {
      const pct = repo.capacityGB > 0 ? (repo.usedGB / repo.capacityGB) * 100 : 0;
      const level = capacityLevel(pct, { warnPct: capacityWarnPct, criticalPct: capacityCriticalPct });
      const previous = seenLevel.current.get(repo.id);
      seenLevel.current.set(repo.id, level);
      if (firstPass || previous === undefined) continue;
      // Only on the way up: a repository dropping back to "ok" after a prune is
      // good news nobody asked to be interrupted by.
      if (level === "ok" || level === previous) continue;
      if (previous === "critical" && level === "warn") continue;
      if (!events.capacityWarning) continue;

      const title = t(`notifications.event.capacity.${level}`, { name: repo.name });
      const body = t("notifications.event.capacityBody", { name: repo.name, pct: Math.round(pct) });
      raise({
        id: capacityAlertId(repo.id, level, pct),
        severity: level === "critical" ? "critical" : "warning",
        category: "capacity",
        title,
        message: body,
        createdAt: new Date().toISOString(),
        read: false,
        entityType: "repository",
        entityId: repo.id,
      });
      (level === "critical" ? toast.error : toast.warning)(title, { description: body });
    }

    seeded.current = true;
  }, [ready, sessions, repositories, t]);
}
