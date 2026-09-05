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

/** Plausible stored ÷ logical for the demo world, where nothing is really
 *  compressed. The appliance measures the real thing per backup (abr-vmdk-tool
 *  reports it); this only has to move the right way with the level so the
 *  Backups tab has something honest-looking to render. */
export function simCompressionRatio(compressionLevel: number): number {
  if (compressionLevel <= 0) return 1;
  return Math.round(Math.max(0.28, 0.82 - compressionLevel * 0.06) * 1000) / 1000;
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
  storedGB: number;
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
      storedGB: points.reduce((a, p) => a + p.sizeGB, 0),
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
  /** What these points occupy in their repositories, after compression. Named
   *  for what it is: this used to be called `logicalGB` and rendered as
   *  "N logical", which was the stored figure wearing the wrong label. */
  storedGB: number;
  /** The real, uncompressed data behind `storedGB`, summed over the points
   *  that report it. null when none do (older catalog entries). */
  logicalGB: number | null;
  /** `storedGB` ÷ `logicalGB` across these points, or null when unknown. */
  compressionRatio: number | null;
  /** createdAt of the newest point. */
  latest: string;
  /** Distinct repositories these points physically live in. */
  repositoryIds: string[];
  /** How many of these points are encrypted at rest. Surfaced on the collapsed
   *  row so encryption status is visible without expanding every VM — and so a
   *  chain that is only PARTLY encrypted (the job's setting was changed
   *  mid-history) is distinguishable from a fully encrypted one, which a plain
   *  boolean would hide. */
  encryptedCount: number;
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
  storedGB: number;
  logicalGB: number | null;
  compressionRatio: number | null;
  /** createdAt of the newest point across every VM. */
  latest: string;
}

/** A compression ratio as the share of the original the backup occupies:
 *  0.356 -> "36%". Lower is better. null for anything unmeasured, so callers
 *  render nothing rather than a misleading "0%" or "100%". */
export function compressionRatioLabel(ratio: number | null | undefined): string | null {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return null;
  return `${Math.round(ratio * 100)}%`;
}

/** Sum the real (uncompressed) size over a set of points, and the ratio the
 *  stored bytes represent against it. Only the points that actually report a
 *  logical size contribute — a mixed set (some written before the mover
 *  reported one) yields the ratio for the part we can measure rather than a
 *  figure skewed by counting the rest as zero. */
function aggregateLogical(points: RestorePoint[]): {
  logicalGB: number | null;
  compressionRatio: number | null;
} {
  const measured = points.filter((p) => p.logicalGB != null && p.logicalGB > 0);
  if (measured.length === 0) return { logicalGB: null, compressionRatio: null };
  const logicalGB = measured.reduce((a, p) => a + (p.logicalGB as number), 0);
  const storedGB = measured.reduce((a, p) => a + p.sizeGB, 0);
  return { logicalGB, compressionRatio: logicalGB > 0 ? storedGB / logicalGB : null };
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
            storedGB: sorted.reduce((a, p) => a + p.sizeGB, 0),
            ...aggregateLogical(sorted),
            latest: sorted[0].createdAt,
            repositoryIds: [...new Set(sorted.map((p) => p.repositoryId))],
            encryptedCount: sorted.filter((p) => p.encrypted).length,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        jobId,
        jobName: jobById.get(jobId)?.name ?? jobPoints[0].jobName,
        orphaned: !jobById.has(jobId),
        vms,
        points: jobPoints,
        storedGB: jobPoints.reduce((a, p) => a + p.sizeGB, 0),
        ...aggregateLogical(jobPoints),
        latest: vms.reduce((a, v) => (v.latest > a ? v.latest : a), vms[0].latest),
      };
    })
    .sort((a, b) => a.jobName.localeCompare(b.jobName));
}
