// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Every "no" a restore can be told, and which sentence explains it.
 *
 * The wizard used to funnel every unclassified failure into "Couldn't reach
 * the appliance" — an outage report for a box that answered correctly, in
 * under a second, with a specific reason. A 409 name clash, an unscanned
 * target inventory and a pulled network cable are three different problems
 * with three different fixes, and telling an operator mid-recovery that the
 * appliance is down when it is not sends them to investigate the wrong half
 * of the system.
 *
 * The codes below are the ones `POST /restore/start` can actually answer with
 * on THIS orchestrator — read off `restore_start` in
 * `python/srv/services/abr_v41.py` and the helpers it calls
 * (`_resolve_restore_source_point`, `_resolve_host`,
 * `_resolve_restore_target_datastore`, `_ensure_restore_target_capacity`,
 * `_resolve_restore_network_selection`, `resolve_selector`). Anything not
 * listed lands on `rejected`, which says the appliance refused and shows the
 * appliance's own sentence underneath — still true, just less specific. Only
 * a request that never got an answer at all is reported as unreachable.
 */
import { ApiError, apiErrorCode, apiErrorMessage, isVersionMismatchError } from "@/services/api.http";
import type { Hypervisor } from "@/types";

export type RestoreRefusal =
  /** The point exists but the appliance won't read it (sealed, pruned, offline storage). */
  | "pointUnavailable"
  /** The point, its repository copy, or its manifest is not there any more. */
  | "pointMissing"
  /** The destination environment is registered but the appliance can't talk to it. */
  | "targetUnreachable"
  /** The destination environment has no discovered hosts to place a VM on. */
  | "targetNotScanned"
  /** The destination environment the wizard offered is gone from the appliance. */
  | "targetMissing"
  /** Host / datastore / network chosen in the wizard no longer resolves. */
  | "placementMissing"
  /** A VM of that name already exists in the destination. */
  | "nameTaken"
  /** In-place restore, but the VM to replace is no longer at its original location. */
  | "originalVmGone"
  /** The destination datastore hasn't the free space this restore needs. */
  | "notEnoughSpace"
  /** The appliance does not implement the mode or option that was requested. */
  | "unsupported"
  /** The appliance refused, for a reason the console has no bespoke sentence for. */
  | "rejected"
  /** The session is no longer accepted — the restore was never attempted. */
  | "signedOut"
  /** Console and appliance speak incompatible API majors. */
  | "versionMismatch"
  /** No answer at all: the only case that may say "couldn't reach the appliance". */
  | "unreachable"
  /** A 2xx with no restore session in it — accepted, but nothing is running. */
  | "noSession";

/**
 * The appliance's machine code → the refusal whose copy explains it.
 *
 * Several codes share a refusal on purpose: `restore_point_not_found`,
 * `restore_point_not_in_repository` and `restore_point_manifest_missing` are
 * one problem to an operator (the point isn't there any more) with one fix.
 * What a code may NOT do is be absent by accident — absence used to mean
 * "the appliance is unreachable".
 */
export const REFUSAL_BY_CODE: Record<string, RestoreRefusal> = {
  restore_point_unavailable: "pointUnavailable",
  restore_point_not_found: "pointMissing",
  restore_point_not_in_repository: "pointMissing",
  restore_point_manifest_missing: "pointMissing",
  target_inventory_unavailable: "targetUnreachable",
  inventory_not_scanned: "targetNotScanned",
  inventory_not_found: "targetMissing",
  ambiguous_inventory: "targetMissing",
  selector_mismatch: "targetMissing",
  host_not_found: "placementMissing",
  ambiguous_host: "placementMissing",
  datastore_not_found: "placementMissing",
  network_not_found: "placementMissing",
  network_adapter_not_found: "placementMissing",
  target_vm_exists: "nameTaken",
  in_place_source_vm_not_found: "originalVmGone",
  insufficient_datastore_space: "notEnoughSpace",
  restore_mode_unsupported: "unsupported",
  restore_option_unsupported: "unsupported",
  // Everything below is the appliance saying the request itself was wrong.
  // Its own message is the useful part, so they share the generic sentence
  // and carry the detail underneath rather than each inventing a diagnosis.
  invalid_restore: "rejected",
  force_required: "rejected",
  firmware_preservation_required: "rejected",
  backup_mismatch: "rejected",
  inventory_mismatch: "rejected",
  repository_mismatch: "rejected",
  restore_point_mismatch: "rejected",
};

export interface ClassifiedRefusal {
  refusal: RestoreRefusal;
  /**
   * The appliance's own words, when it supplied any. Supporting text only —
   * these arrive as UI-ready English from the orchestrator and must never be
   * the headline (see house rule 5).
   */
  detail: string | null;
}

/** `restore:refusal.<refusal>.title` / `.desc` — the pair that explains one refusal. */
export function refusalKey(refusal: RestoreRefusal, part: "title" | "desc"): string {
  return `refusal.${refusal}.${part}`;
}

/**
 * Classify a thrown restore failure. `world.live.ts` deliberately lets
 * `ApiError`s propagate with their body intact so this can read the code off
 * them; anything that is not an `ApiError` never reached the appliance.
 */
export function classifyRestoreFailure(err: unknown): ClassifiedRefusal {
  if (!(err instanceof ApiError)) return { refusal: "unreachable", detail: null };
  const detail = apiErrorMessage(err);
  if (isVersionMismatchError(err)) return { refusal: "versionMismatch", detail };
  if (err.status === 401) return { refusal: "signedOut", detail };
  const code = apiErrorCode(err);
  const refusal = (code && REFUSAL_BY_CODE[code]) || "rejected";
  return { refusal, detail };
}

/**
 * Whether this appliance can restore a `from` guest onto a `to` environment.
 *
 * It cannot, unless the two platforms match: the orchestrator ships exactly
 * one hypervisor plugin (`python/srv/plugins/vcenter`), so there is nothing
 * that can register a VM on Hyper-V or Proxmox and nothing that converts a
 * disk between formats. Inventories of those kinds can still be registered
 * and scanned, which is why a cross-platform target is reachable in the
 * wizard at all — and why it has to be refused there rather than promised.
 */
export function crossHypervisorRestoreBlocked(
  from: Hypervisor | undefined,
  to: Hypervisor | undefined,
): boolean {
  return !!from && !!to && from !== to;
}
