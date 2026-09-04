// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { BackupJob, RestorePoint, RestorePointType, VM } from "@/types";
import i18n from "@/i18n";

/** The demo world has no real orchestrator-issued chain id, so it synthesizes
 *  one from the same (job, VM, repository) triple the appliance keys a backup
 *  chain by — stable across ticks/reloads, just never sent over the wire. */
export function simChainId(jobId: string, vmId: string, repositoryId: string): string {
  return `chain::${jobId}::${vmId}::${repositoryId}`;
}

/**
 * Shared copy explaining that restore points are self-contained to restore:
 * "full" vs "incremental" describes how much data that run *ingested* (via
 * changed-block tracking), not a restore dependency — each point restores on
 * its own. That is orthogonal to deletion, which is chain-granular: a chain
 * (one job + VM + repository) is deleted as a whole, never one point at a time.
 */

/** Hover explanation for a full/incremental type badge. */
export function pointTypeTooltip(type: RestorePointType): string {
  return type === "full"
    ? i18n.t("domain:restorePoint.tooltip.full")
    : i18n.t("domain:restorePoint.tooltip.incremental");
}

/** One-line note for the top of a restore-point list. Resolved at call time so
 *  it follows the active language (never freeze i18n.t at module load). */
export function selfContainedNote(): string {
  return i18n.t("domain:restorePoint.selfContainedNote");
}

/** One full backup and the incrementals chained onto it — the deletable unit.
 *  Mirrors the orchestrator's own grouping (`_segment_points` in abr_v41.py):
 *  within one chain, split chronologically at every "full" point. */
export interface RestorePointSegment {
  /** id of the segment's oldest point — normally the full backup; only an
   *  incremental when catalog history precedes any full (a pre-existing data
   *  inconsistency). This is also the value `DELETE /backups/{chainId}?segment=`
   *  expects, so it must stay in lockstep with the backend's definition. */
  id: string;
  /** The full backup anchoring this segment, or null for the orphaned-history
   *  edge case above. */
  full: RestorePoint | null;
  /** Every point in the segment, newest first. */
  points: RestorePoint[];
  logicalGB: number;
  /** createdAt of the newest point in the segment. */
  latest: string;
}

/** Splits one chain's points (same chainId) into full-backup segments. Must
 *  mirror the backend's `_segment_points` exactly — chronological order, a new
 *  segment starting at each "full" point — so a segment id computed here
 *  always resolves against the delete endpoint. */
export function segmentChainPoints(chainPoints: RestorePoint[]): RestorePointSegment[] {
  const ascending = [...chainPoints].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const groups: RestorePoint[][] = [];
  let current: RestorePoint[] = [];
  for (const p of ascending) {
    if (p.type === "full" && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 0) groups.push(current);
  return groups.map((points) => {
    const newestFirst = [...points].reverse();
    return {
      id: points[0].id,
      full: points.find((p) => p.type === "full") ?? null,
      points: newestFirst,
      logicalGB: points.reduce((a, p) => a + p.sizeGB, 0),
      latest: newestFirst[0].createdAt,
    };
  });
}

/** One VM's stored restore points within one job, with the aggregates the
 *  Backups tab's tree rows share. Deletion lives at this level — every chain
 *  behind this VM's points for this job — never on a single point. */
export interface RestorePointJobVmGroup {
  /** The protected VM's id. */
  vmId: string;
  /** Resolved display name; falls back to the point's stored name when the VM
   *  itself has since been removed (points outlive their source). */
  name: string;
  /** The VM no longer exists in inventory. */
  removed: boolean;
  /** Every point for this VM within this job, newest first. */
  points: RestorePoint[];
  /** Chain ids backing these points — normally exactly one (job+VM+repository
   *  key a chain), more than one only if the job's target repository changed
   *  over this VM's history. Deleting the VM-from-job removes every one. */
  chainIds: string[];
  logicalGB: number;
  /** createdAt of the newest point. */
  latest: string;
  /** Distinct repositories these points physically live in. */
  repositoryIds: string[];
}

/** One job's stored restore points, grouped by the VMs it protects. */
export interface RestorePointJobGroup {
  /** The job's id — may reference a job that's since been deleted. */
  jobId: string;
  /** Resolved display name; falls back to the point's stored name when the
   *  job itself has since been removed. */
  jobName: string;
  /** The job no longer exists — its restore points are kept and stay
   *  restorable/deletable, just unreachable from the Jobs list itself. */
  orphaned: boolean;
  /** VMs this job produced restore points for, sorted by name. */
  vms: RestorePointJobVmGroup[];
  /** Every point across every VM in this job, for aggregate stats. */
  points: RestorePoint[];
  logicalGB: number;
  /** createdAt of the newest point across every VM. */
  latest: string;
}

/**
 * Group a flat list of restore points into the Backups tab's tree: job → VM →
 * restore points. Resolves display names from surviving jobs/inventory with
 * each point's own stored name as the honest fallback, so a group renders
 * fully even after its job and the VM it protected are both gone — this is
 * what lets the Backups tab surface points orphaned by a deleted job. Sorted
 * by job name, then by VM name within each job.
 */
export function groupRestorePointsByJob(
  points: RestorePoint[],
  world: { vms: VM[]; jobs: BackupJob[] },
): RestorePointJobGroup[] {
  const vmById = new Map(world.vms.map((v) => [v.id, v]));
  const jobById = new Map(world.jobs.map((j) => [j.id, j]));
  const byJob = new Map<string, RestorePoint[]>();
  for (const p of points) {
    const arr = byJob.get(p.jobId) ?? [];
    arr.push(p);
    byJob.set(p.jobId, arr);
  }
  return [...byJob.entries()]
    .map(([jobId, jobPoints]) => {
      const byVm = new Map<string, RestorePoint[]>();
      for (const p of jobPoints) {
        const arr = byVm.get(p.vmId) ?? [];
        arr.push(p);
        byVm.set(p.vmId, arr);
      }
      const vms = [...byVm.entries()]
        .map(([vmId, vmPoints]) => {
          const sorted = [...vmPoints].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          const vm = vmById.get(vmId);
          return {
            vmId,
            name: vm?.name ?? sorted[0].vmName,
            removed: vm === undefined,
            points: sorted,
            chainIds: [...new Set(sorted.map((p) => p.chainId))],
            logicalGB: sorted.reduce((a, p) => a + p.sizeGB, 0),
            latest: sorted[0].createdAt,
            repositoryIds: [...new Set(sorted.map((p) => p.repositoryId))],
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        jobId,
        jobName: jobById.get(jobId)?.name ?? jobPoints[0].jobName,
        orphaned: !jobById.has(jobId),
        vms,
        points: jobPoints,
        logicalGB: jobPoints.reduce((a, p) => a + p.sizeGB, 0),
        latest: vms.reduce((a, v) => (v.latest > a ? v.latest : a), vms[0].latest),
      };
    })
    .sort((a, b) => a.jobName.localeCompare(b.jobName));
}
