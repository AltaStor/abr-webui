// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * One definition of the Object Lock form, shared by the create and edit
 * dialogs.
 *
 * The two used to be different shapes: creation offered a full lock form and
 * editing offered nothing at all, so a repository's immutability was decided
 * once, at the moment it was registered, and could never be looked at again.
 * Keeping the draft type, the validation and the wire conversion here is what
 * lets both dialogs put the same question and send the same answer.
 */
import { MAX_IMMUTABILITY_RETENTION_DAYS, type ImmutabilityMode, type RepositoryImmutability } from "@/types";

/** The modes an operator can actually choose. "none" is the switch being off,
 *  not a third entry in the list. */
export const LOCK_MODES = ["governance", "compliance"] as const satisfies readonly ImmutabilityMode[];
export type LockMode = (typeof LOCK_MODES)[number];

/** What turning the switch on proposes. Governance because it is the mode that
 *  survives a compromised backup account while still leaving a deliberate admin
 *  a way out; 30 days because it is a retention period, not a commitment the
 *  operator can't walk back. */
export const DEFAULT_LOCK_MODE: LockMode = "governance";
export const DEFAULT_LOCK_DAYS = "30";

/** The lock as the form holds it: days stay a string so a half-typed number is
 *  the operator's own text and not a value silently coerced to 0. */
export interface ImmutabilityDraft {
  enabled: boolean;
  mode: LockMode;
  days: string;
}

/** Same pairing the orchestrator enforces (`_validate_s3_configuration`): a
 *  lock is at least a day and at most MAX_IMMUTABILITY_RETENTION_DAYS, and
 *  anything else is a 422. */
export function lockDaysValid(value: string): boolean {
  const days = Number(value.trim());
  return Number.isInteger(days) && days >= 1 && days <= MAX_IMMUTABILITY_RETENTION_DAYS;
}

export function draftValid(draft: ImmutabilityDraft): boolean {
  return !draft.enabled || lockDaysValid(draft.days);
}

/** The draft as the appliance wants it. Mode "none" is always paired with 0
 *  days — sending an explicitly-zeroed "none" is what turns the lock back off. */
export function draftToImmutability(draft: ImmutabilityDraft): RepositoryImmutability {
  return draft.enabled
    ? { mode: draft.mode, retentionDays: Number(draft.days.trim()) }
    : { mode: "none", retentionDays: 0 };
}

/** Seed a form from what a repository currently has. A lock that is off keeps
 *  the default mode/period in the fields, so switching it on proposes
 *  something sensible instead of an empty box. */
export function immutabilityToDraft(lock: RepositoryImmutability | null | undefined): ImmutabilityDraft {
  if (!lock || lock.mode === "none" || lock.retentionDays <= 0) {
    return { enabled: false, mode: DEFAULT_LOCK_MODE, days: DEFAULT_LOCK_DAYS };
  }
  return {
    // "none" is excluded by the guard above, so this narrowing is real.
    mode: lock.mode as LockMode,
    enabled: true,
    days: String(lock.retentionDays),
  };
}

export function immutabilityEnabled(lock: RepositoryImmutability | null | undefined): boolean {
  return Boolean(lock && lock.mode !== "none" && lock.retentionDays > 0);
}

export function sameImmutability(
  a: RepositoryImmutability,
  b: RepositoryImmutability,
): boolean {
  return a.mode === b.mode && a.retentionDays === b.retentionDays;
}

/** Ordering of the modes by strength, matching `_IMMUTABILITY_RANKS`. */
const RANK: Record<ImmutabilityMode, number> = { none: 0, governance: 1, compliance: 2 };

/**
 * How a proposed lock compares with the one in force — the question behind
 * "the UI clearly indicates how a new, longer immutability period affects
 * existing and newly created backup data".
 *
 * "relaxed" is the one worth naming separately: Object Lock retention that is
 * already written can never be shortened or removed, so weakening the setting
 * changes nothing at all about what is already stored — only what comes next.
 */
export type ImmutabilityChange = "unchanged" | "enabled" | "disabled" | "strengthened" | "relaxed";

export function immutabilityChange(
  previous: RepositoryImmutability,
  next: RepositoryImmutability,
): ImmutabilityChange {
  if (sameImmutability(previous, next)) return "unchanged";
  const was = immutabilityEnabled(previous);
  const is = immutabilityEnabled(next);
  if (!was && is) return "enabled";
  if (was && !is) return "disabled";
  if (RANK[next.mode] < RANK[previous.mode]) return "relaxed";
  if (next.retentionDays < previous.retentionDays) return "relaxed";
  // A longer period, a stronger mode, or both. One case rather than three
  // because the consequence is identical: it governs what comes next, and it
  // never reaches back into a lock that is already written.
  return "strengthened";
}
