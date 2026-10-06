// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Where each of a VM's source datastores lands on restore, and whether it fits.
 *
 * A VM's disks do not all live on one datastore, so a restore to a new location
 * is not one placement decision but one per source datastore. The appliance
 * takes that as `datastore_map` and checks each TARGET datastore against the
 * disks that land on it (`_resolve_restore_datastore_placement` and
 * `_ensure_restore_target_capacity` in abr-core). Everything here mirrors those
 * two, so the wizard can show the answer — and refuse — before submitting a
 * restore the appliance would reject with a 409 halfway through the operator's
 * afternoon.
 *
 * The one rule worth restating, because it decides most of the arithmetic: a
 * figure that is not known is never evidence of a problem. A datastore that
 * reports no free space, or a disk whose size the restore point never recorded,
 * leaves the target "unknown" rather than "too small" — thin disks routinely
 * hold a fraction of their provisioned size, and blocking a restore on a
 * guess would be worse than letting the appliance decide.
 */

import type { RestoreDatastoreOption, RestoreSourceDisk } from "@/types";

/** Source disk types that are thin on disk, so a restore of them needs what the
 *  backup holds rather than the provisioned size. Mirrors
 *  `_THIN_SOURCE_DISK_TYPES` — VMware's thin formats, and Hyper-V's dynamic and
 *  differencing VHDX. */
const THIN_SOURCE_DISK_TYPES = new Set([
  "vmfs_thin",
  "vmfs_sparse",
  "monolithic_sparse",
  "split_sparse",
  "dynamic",
  "differencing",
]);

/** A disk whose source datastore the restore point never recorded. It cannot be
 *  mapped — the appliance has no name to key it by — so it is grouped under
 *  this and counted against the default target. */
export const UNKNOWN_SOURCE_DATASTORE = "";

export interface SourceDatastoreGroup {
  /** The datastore name as the restore point records it, and as
   *  `datastore_map` takes it. */
  name: string;
  disks: RestoreSourceDisk[];
  /** What these disks need on a target, or null when any of them is unmeasured. */
  requiredBytes: number | null;
}

/** What one disk needs on the target it lands on. Null when unrecorded. */
export function diskRequiredBytes(disk: RestoreSourceDisk): number | null {
  const thin = THIN_SOURCE_DISK_TYPES.has((disk.provisioning ?? "").trim().toLowerCase());
  return thin ? disk.usedBytes : disk.capacityBytes;
}

/** Sum of what these disks need, or null when even one of them is unmeasured —
 *  a partial sum would understate the requirement and read as "it fits". */
export function requiredBytes(disks: RestoreSourceDisk[]): number | null {
  let total = 0;
  for (const disk of disks) {
    const required = diskRequiredBytes(disk);
    if (required == null) return null;
    total += required;
  }
  return total;
}

/**
 * The source datastores this VM occupies, in the order its disks are listed,
 * each with the disks that live on it. This is the list the wizard has to show
 * and the operator has to map.
 */
export function sourceDatastoreGroups(disks: RestoreSourceDisk[]): SourceDatastoreGroup[] {
  const groups = new Map<string, RestoreSourceDisk[]>();
  for (const disk of disks) {
    const name = (disk.sourceDatastore ?? "").trim();
    const existing = groups.get(name);
    if (existing) existing.push(disk);
    else groups.set(name, [disk]);
  }
  return [...groups.entries()].map(([name, grouped]) => ({
    name,
    disks: grouped,
    requiredBytes: requiredBytes(grouped),
  }));
}

export interface TargetDatastoreLoad {
  datastore: RestoreDatastoreOption;
  /** The source datastores whose disks land here. */
  sourceDatastores: string[];
  disks: RestoreSourceDisk[];
  /** What lands here, or null when any disk of it is unmeasured. */
  requiredBytes: number | null;
  /** How much the datastore is short. Null unless both figures are known AND
   *  the requirement exceeds the free space. */
  shortfallBytes: number | null;
}

/**
 * Roll the mapping up per target datastore — the unit the appliance checks, and
 * the only one that answers the real question: two source datastores mapped
 * onto one target have to fit there together.
 */
export function targetDatastoreLoads(
  groups: SourceDatastoreGroup[],
  mappings: ReadonlyMap<string, string>,
  targets: RestoreDatastoreOption[],
): TargetDatastoreLoad[] {
  const byId = new Map(targets.map((target) => [target.id, target]));
  const loads = new Map<string, TargetDatastoreLoad>();
  for (const group of groups) {
    const targetId = mappings.get(group.name) ?? "";
    const datastore = byId.get(targetId);
    if (!datastore) continue;
    const load =
      loads.get(datastore.id) ??
      ({
        datastore,
        sourceDatastores: [],
        disks: [],
        requiredBytes: 0,
        shortfallBytes: null,
      } satisfies TargetDatastoreLoad);
    load.sourceDatastores.push(group.name);
    load.disks.push(...group.disks);
    loads.set(datastore.id, load);
  }
  return [...loads.values()].map((load) => {
    const required = requiredBytes(load.disks);
    const free = load.datastore.freeBytes;
    return {
      ...load,
      requiredBytes: required,
      shortfallBytes: required != null && free != null && free < required ? required - free : null,
    };
  });
}

export type DatastoreMappingProblem =
  | { kind: "unmapped"; sourceDatastore: string }
  | {
      kind: "insufficient";
      datastoreName: string;
      requiredBytes: number;
      freeBytes: number;
      shortfallBytes: number;
    };

/**
 * Everything that must be fixed before the restore can start: a source
 * datastore with nowhere to go, and a target that certainly cannot hold what
 * the mapping sends it.
 *
 * Returned in that order because it is the order they have to be dealt with —
 * a target only becomes too small once something is mapped onto it.
 */
export function datastoreMappingProblems(
  groups: SourceDatastoreGroup[],
  mappings: ReadonlyMap<string, string>,
  targets: RestoreDatastoreOption[],
): DatastoreMappingProblem[] {
  const byId = new Map(targets.map((target) => [target.id, target]));
  const problems: DatastoreMappingProblem[] = [];
  for (const group of groups) {
    const targetId = mappings.get(group.name) ?? "";
    if (!targetId || !byId.has(targetId)) {
      problems.push({ kind: "unmapped", sourceDatastore: group.name });
    }
  }
  for (const load of targetDatastoreLoads(groups, mappings, targets)) {
    if (load.shortfallBytes == null || load.requiredBytes == null || load.datastore.freeBytes == null) continue;
    problems.push({
      kind: "insufficient",
      datastoreName: load.datastore.name,
      requiredBytes: load.requiredBytes,
      freeBytes: load.datastore.freeBytes,
      shortfallBytes: load.shortfallBytes,
    });
  }
  return problems;
}

/**
 * The mapping to start from, and to re-derive whenever the target host or
 * environment changes.
 *
 * Only two things pre-fill a row: a choice the operator already made, as long
 * as the new host still mounts it, and a target datastore of the SAME NAME as
 * the source — the natural answer when restoring into an environment built like
 * the one the backup came from.
 *
 * Nothing else. In particular not "the first datastore the host mounts", which
 * is what the appliance's own `default_datastore_id` falls back to
 * (`get_restore_context`) and what this function used to accept: in a vCenter
 * whose datastores are named ds-01, ds-02, ds-03, that fallback pre-selects
 * ds-01 for every VM in the estate, whatever the VM's disks have to do with
 * ds-01 — a silent, confident decision about where someone's data lands, made
 * on alphabetical order. An empty row the operator must answer is better; it is
 * reported as a problem, and it blocks the restore until they do.
 */
export function resolveDatastoreMappings(
  groups: SourceDatastoreGroup[],
  targets: RestoreDatastoreOption[],
  { previous }: { previous?: ReadonlyMap<string, string> } = {},
): Map<string, string> {
  const byId = new Map(targets.map((target) => [target.id, target]));
  const byName = new Map(targets.map((target) => [target.name.trim().toLowerCase(), target.id]));
  const resolved = new Map<string, string>();
  for (const group of groups) {
    const kept = previous?.get(group.name);
    if (kept && byId.has(kept)) {
      resolved.set(group.name, kept);
      continue;
    }
    resolved.set(group.name, byName.get(group.name.trim().toLowerCase()) ?? "");
  }
  return resolved;
}
