// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The one place the restore wizard's deep link is spelled.
 *
 * Every "Restore" affordance outside the wizard is a link into it, and the
 * wizard reads the same two params back (see RestorePage). Building the query
 * string by hand at each call site is what let the point id go missing: the
 * VM-detail restore-point rows passed only `?vm=`, so the wizard fell back to
 * "newest restorable" and the operator's actual choice never reached the
 * request. Callers that have a point in hand pass it here; callers that only
 * have a VM (a page-level "Restore" button) legitimately omit it and get the
 * newest-point default.
 */

/** Query param naming the VM to restore. */
export const RESTORE_VM_PARAM = "vm";
/** Query param naming the restore point to open on. */
export const RESTORE_POINT_PARAM = "point";

/** Deep link into the restore wizard for `vmId`, optionally opening on a
 *  specific restore point rather than the newest restorable one. */
export function restoreLink(vmId: string, pointId?: string): string {
  const params = new URLSearchParams({ [RESTORE_VM_PARAM]: vmId });
  if (pointId) params.set(RESTORE_POINT_PARAM, pointId);
  return `/restore?${params}`;
}
