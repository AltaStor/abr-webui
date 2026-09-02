// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Repository-fill thresholds — the consumer side of Settings → Storage
 * defaults → "Capacity thresholds" (storageDefaults.capacityWarnPct /
 * capacityCriticalPct). Every surface that colors a repository fill bar or
 * badge derives its tier from here, so moving the sliders re-tones the whole
 * console live instead of fighting hardcoded percentages.
 */
import { useSettingsStore } from "@/store/settings";

export type CapacityLevel = "ok" | "warn" | "critical";

export interface CapacityThresholds {
  warnPct: number;
  criticalPct: number;
}

/** Pure classification — for call sites that loop (one hook call, many bars). */
export function capacityLevel(pct: number, t: CapacityThresholds): CapacityLevel {
  // The Settings form keeps warn < critical, but a hand-edited or stale config
  // could invert them — treat critical as the higher of the two so the tiers
  // never flip.
  const criticalPct = Math.max(t.warnPct, t.criticalPct);
  if (pct >= criticalPct) return "critical";
  if (pct >= t.warnPct) return "warn";
  return "ok";
}

/** Reactive thresholds — subscribes to the settings store (two primitive
 * selectors, so no fresh-object snapshots), so slider changes re-render
 * consumers immediately. */
export function useCapacityThresholds(): CapacityThresholds {
  const warnPct = useSettingsStore((s) => s.storageDefaults.capacityWarnPct);
  const criticalPct = useSettingsStore((s) => s.storageDefaults.capacityCriticalPct);
  return { warnPct, criticalPct };
}

/** Reactive tier for a single fill percentage. */
export function useCapacityLevel(pct: number): CapacityLevel {
  return capacityLevel(pct, useCapacityThresholds());
}
