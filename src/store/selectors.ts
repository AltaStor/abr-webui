// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type {
  ActivityPoint,
  DashboardSummary,
  ProtectionStatus,
  Session,
  VM,
} from "@/types";
import type { World } from "@/mock/seed";

const DAY = 86_400_000;

/** Bucket sessions into the last `days` days for the activity timeline. */
function buildActivityTimeline(sessions: Session[], days = 14): ActivityPoint[] {
  const now = Date.now();
  const buckets: ActivityPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now - i * DAY);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + DAY;
    const inDay = sessions.filter((s) => {
      const t = new Date(s.finishedAt ?? s.startedAt).getTime();
      return t >= dayStart.getTime() && t < dayEnd;
    });
    buckets.push({
      date: dayStart.toISOString(),
      success: inDay.filter((s) => s.status === "success").length,
      warning: inDay.filter((s) => s.status === "warning").length,
      failed: inDay.filter((s) => s.status === "failed").length,
    });
  }
  return buckets;
}

export function countByProtection(vms: VM[]): Record<ProtectionStatus, number> {
  return {
    protected: vms.filter((v) => v.protection === "protected").length,
    warning: vms.filter((v) => v.protection === "warning").length,
    unprotected: vms.filter((v) => v.protection === "unprotected").length,
  };
}

export function computeDashboardSummary(world: World): DashboardSummary {
  const { vms, sessions, repositories, threats, restorePoints } = world;
  const counts = countByProtection(vms);
  const totalVms = vms.length;

  const last24h = sessions.filter(
    (s) =>
      s.status !== "running" &&
      s.status !== "queued" &&
      Date.now() - new Date(s.finishedAt ?? s.startedAt).getTime() < DAY,
  );
  const success24h = last24h.filter((s) => s.status === "success").length;
  const failed24h = last24h.filter((s) => s.status === "failed").length;

  const capacityGB = repositories.reduce((a, r) => a + r.capacityGB, 0);
  const usedGB = repositories.reduce((a, r) => a + r.usedGB, 0);

  return {
    totalVms,
    protectedVms: counts.protected,
    warningVms: counts.warning,
    unprotectedVms: counts.unprotected,
    protectionCoverage: totalVms ? (counts.protected / totalVms) * 100 : 0,
    // No sessions in the window means there is nothing to measure — null (not
    // a vacuous 100%), so the KPI renders "—" instead of a false-green rate.
    successRate24h: last24h.length ? (success24h / last24h.length) * 100 : null,
    sessions24h: last24h.length,
    failed24h,
    totalRestorePoints: restorePoints.length,
    capacityGB,
    usedGB,
    activeThreats: threats.filter((t) => t.status === "active" || t.status === "investigating").length,
    dataProtectedGB: vms.filter((v) => v.protection === "protected").reduce((a, v) => a + v.usedGB, 0),
    activityTimeline: buildActivityTimeline(sessions),
  };
}

export function jobSuccessSeries(statuses: string[]): number[] {
  // Map status history to a 0..1 health series for sparklines.
  return statuses.map((s) => (s === "success" ? 1 : s === "warning" ? 0.55 : s === "running" ? 0.8 : 0.15));
}
