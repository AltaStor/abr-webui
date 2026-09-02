// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Auto-lock on threat — the consumer side of Settings → Security → "Auto-lock on
 * threat" (security.autoLockThreatResponse, "Seal affected repositories the
 * moment a threat is detected").
 *
 * The lock is DERIVED, never persisted: a repository is "threat-locked" when the
 * setting is on AND it holds restore points for a source that is under an active
 * (or investigating) threat. We deliberately do NOT stamp repo.readOnly — that
 * would blur an auto-seal against a user's manual read-only flag and leave
 * residue when the threat clears. Because the lock is computed, reversibility is
 * automatic: dismissing/containing the threat or turning the setting off removes
 * every badge with nothing to unwind.
 *
 * This is presentational: it surfaces the policy response on the repository UI
 * (a distinct danger-toned badge) without blocking job runs.
 */
import { useMemo } from "react";
import type { RestorePoint, Threat } from "@/types";
import { useSettingsStore } from "@/store/settings";
import { useWorldStore } from "@/store/world";

/** Why a repository is threat-locked — the threatened sources whose points live here. */
export interface RepoThreatLock {
  /** Distinct display names of threatened sources with restore points in this repo. */
  sourceNames: string[];
}

/** A threat is "live" (worth sealing against) while it's active or being investigated. */
function isLiveThreat(t: Threat): boolean {
  return t.status === "active" || t.status === "investigating";
}

/**
 * Pure classification — for call sites that render many repositories from one
 * compute. Returns a map of repositoryId → why it's locked. Empty when the
 * setting is off or nothing is under a live threat.
 */
export function threatLockedRepos(
  threats: Threat[],
  restorePoints: RestorePoint[],
  enabled: boolean,
): Map<string, RepoThreatLock> {
  const out = new Map<string, RepoThreatLock>();
  if (!enabled) return out;

  // Threatened source id → display name, live threats only.
  const liveSources = new Map<string, string>();
  for (const t of threats) {
    if (isLiveThreat(t)) liveSources.set(t.vmId, t.vmName);
  }
  if (liveSources.size === 0) return out;

  for (const p of restorePoints) {
    const name = liveSources.get(p.vmId);
    if (!name) continue;
    const info = out.get(p.repositoryId);
    if (info) {
      if (!info.sourceNames.includes(name)) info.sourceNames.push(name);
    } else {
      out.set(p.repositoryId, { sourceNames: [name] });
    }
  }
  return out;
}

/**
 * Reactive threat-locks — subscribes to the setting and to the world's threats +
 * restore points, so toggling the setting or dismissing a threat re-tones the
 * repository grid live. Memoized on those references so the map is stable
 * between unrelated renders.
 */
export function useThreatLockedRepos(): Map<string, RepoThreatLock> {
  const enabled = useSettingsStore((s) => s.security.autoLockThreatResponse);
  const threats = useWorldStore((s) => s.threats);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  return useMemo(
    () => threatLockedRepos(threats, restorePoints, enabled),
    [threats, restorePoints, enabled],
  );
}
