// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Backup copy jobs, as the console reads them: the appliance's copy settings
 * on the wire (`backup_copy` on a job, `copy_window` rules), which VMs a copy
 * job's sources hold, and the rules its form checks before the appliance
 * would. The appliance's own logic is `backup_copy.py` in abr-core; the
 * functions here mirror it and are named after the parts they mirror.
 */
import i18n from "@/i18n";
import { instantAt, wallTime } from "@/lib/time";
import type {
  BackupCopySettings,
  BackupJob,
  CopyMode,
  CopyWindowRule,
  Environment,
  NamedRef,
  RestorePoint,
  RestorePointCopySource,
  VM,
} from "@/types";

type Dict = Record<string, unknown>;

/** The retries the appliance uses when a job sets none (DEFAULT_RETRIES). */
export const COPY_RETRY_DEFAULTS: Record<CopyMode, { count: number; intervalMinutes: number }> = {
  periodic: { count: 5, intervalMinutes: 0 },
  immediate: { count: 3, intervalMinutes: 10 },
};
export const MAX_COPY_RETRY_COUNT = 20;
export const MAX_COPY_RETRY_INTERVAL_MINUTES = 24 * 60;

/** Day indices (0 = Sunday) in the order the appliance takes them: a copy
 *  window rule's days must go Monday to Sunday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WIRE_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});

function namedRefs(raw: unknown): NamedRef[] {
  return (Array.isArray(raw) ? raw : [])
    .map(asDict)
    .filter((ref) => str(ref.id))
    .map((ref) => ({ id: str(ref.id), name: str(ref.name) || str(ref.id) }));
}

/** One stored copy window rule. The appliance answers "24:00" for a window
 *  that ends at midnight; the console's time fields say "00:00". */
function windowRuleFromWire(raw: unknown): CopyWindowRule | null {
  const rule = asDict(raw);
  const start = str(rule.start);
  const end = str(rule.end);
  if (!start || !end) return null;
  const days = (Array.isArray(rule.days) ? rule.days : [])
    .map((d) => WIRE_DAYS.indexOf(str(d).slice(0, 3).toLowerCase()))
    .filter((d) => d >= 0);
  return {
    daysOfWeek: days.length ? days : [...WEEK_ORDER],
    start,
    end: end === "24:00" ? "00:00" : end,
    timezone: str(rule.timezone) || undefined,
  };
}

/** A rule as `parse_copy_window` reads it. An end of "00:00" goes out as
 *  "24:00": the appliance refuses a rule that starts and ends at the same
 *  time, and 00:00–24:00 is how it spells a whole day. */
export function windowRuleToWire(rule: CopyWindowRule): Dict {
  return {
    days: WEEK_ORDER.filter((d) => rule.daysOfWeek.includes(d)).map((d) => WIRE_DAYS[d]),
    start: rule.start,
    end: rule.end === "00:00" ? "24:00" : rule.end,
    ...(rule.timezone ? { timezone: rule.timezone } : {}),
  };
}

/** The job DTO's `backup_copy`. `scheduled` comes from the job's own schedule,
 *  which the appliance reports as null for a job without one. */
export function mapBackupCopy(raw: unknown, scheduled: boolean): BackupCopySettings {
  const copy = asDict(raw);
  const mode: CopyMode = copy.copy_mode === "immediate" ? "immediate" : "periodic";
  const retry = asDict(copy.retry);
  const runAfter = asDict(copy.run_after_job);
  return {
    mode,
    sourceJobs: namedRefs(copy.source_jobs),
    sourceRepositories: namedRefs(copy.source_repositories),
    runAfterJob: str(runAfter.id) ? { id: str(runAfter.id), name: str(runAfter.name) || str(runAfter.id) } : null,
    retry: {
      count: typeof retry.count === "number" ? retry.count : COPY_RETRY_DEFAULTS[mode].count,
      intervalMinutes:
        typeof retry.interval_minutes === "number" ? retry.interval_minutes : COPY_RETRY_DEFAULTS[mode].intervalMinutes,
    },
    window: (Array.isArray(copy.copy_window) ? copy.copy_window : [])
      .map(windowRuleFromWire)
      .filter((rule): rule is CopyWindowRule => rule !== null),
    scheduled,
  };
}

/** A restore point's `copy_source`, or null for a point a backup made. */
export function mapCopySource(raw: unknown): RestorePointCopySource | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Dict;
  const orNull = (v: unknown) => str(v) || null;
  return {
    jobId: orNull(source.job_id),
    jobName: orNull(source.job_name),
    repositoryId: orNull(source.repository_id),
    repositoryName: orNull(source.repository_name),
    pointId: orNull(source.point_id),
    createdAt: orNull(source.created_at),
  };
}

/** "From nightly, Offsite-S3 · all VMs" — a copy job's scope in a line. */
export function copyScopeSummary(copy: BackupCopySettings, vmCount: number): string {
  const sources = [...copy.sourceJobs, ...copy.sourceRepositories].map((s) => s.name).join(", ");
  const vms = vmCount ? i18n.t("jobs:copy.scope.vms", { count: vmCount }) : i18n.t("jobs:copy.scope.allVms");
  return sources ? i18n.t("jobs:copy.scope.summary", { sources, vms }) : vms;
}

/* ------------------------------------------------------------ copy window -- */

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export interface CopyWindowState {
  open: boolean;
  /** While closed: when it next opens; null when no rule ever opens it. */
  opensAt: Date | null;
  /** While open: when it closes, across rules that run into each other; null
   *  without a window. */
  closesAt: Date | null;
}

/**
 * Whether copies may move data at `now` (`copy_window_state`). Each rule
 * opens on its days at `start` on its zone's clock and closes at `end`, the
 * next day when `end` is at or before `start`.
 */
export function copyWindowState(rules: CopyWindowRule[], now: Date = new Date()): CopyWindowState {
  if (!rules.length) return { open: true, opensAt: null, closesAt: null };
  const at = now.getTime();
  const intervals: [number, number][] = [];
  for (const rule of rules) {
    const zone = rule.timezone || "UTC";
    const today = wallTime(now, zone);
    const start = minutesOf(rule.start);
    const end = minutesOf(rule.end);
    for (let offset = -1; offset <= 8; offset++) {
      const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
      if (!rule.daysOfWeek.includes(day.getUTCDay())) continue;
      const wall = (dayShift: number, minutes: number) => {
        const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + dayShift));
        return instantAt(
          { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: Math.floor(minutes / 60), minute: minutes % 60 },
          zone,
        ).getTime();
      };
      intervals.push([wall(0, start), end > start ? wall(0, end) : wall(1, end)]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const current = intervals.filter(([opens, closes]) => opens <= at && at < closes);
  if (!current.length) {
    const next = intervals.find(([opens]) => opens > at);
    return { open: false, opensAt: next ? new Date(next[0]) : null, closesAt: null };
  }
  let closes = Math.max(...current.map(([, c]) => c));
  for (let extended = true; extended; ) {
    extended = false;
    for (const [opens, ends] of intervals) {
      if (opens <= closes && closes < ends) {
        closes = ends;
        extended = true;
      }
    }
  }
  return { open: true, opensAt: null, closesAt: new Date(closes) };
}

/* ---------------------------------------------------------------- sources -- */

export interface CopySources {
  jobIds: string[];
  repositoryIds: string[];
}

interface CopyWorld {
  jobs: BackupJob[];
  restorePoints: RestorePoint[];
  vms: VM[];
}

/** The restore points a copy job reads (`source_points`): those of its source
 *  jobs, and every job's in its source repositories, never its own. */
export function copySourcePoints(sources: CopySources, points: RestorePoint[], copyJobId?: string): RestorePoint[] {
  const jobs = new Set(sources.jobIds);
  const repositories = new Set(sources.repositoryIds);
  return points.filter(
    (p) => p.jobId && p.jobId !== copyJobId && (jobs.has(p.jobId) || repositories.has(p.repositoryId)),
  );
}

/**
 * The VMs a copy job's sources back up (`_known_vms`): the VMs of its source
 * jobs and of every restore point it reads. These are the VMs it can be told
 * to copy, and the ones it copies when it is told none.
 */
export function copySourceVms(sources: CopySources, world: CopyWorld, copyJobId?: string): NamedRef[] {
  const vmName = new Map(world.vms.map((v) => [v.id, v.name]));
  const known = new Map<string, string>();
  for (const job of world.jobs) {
    if (!sources.jobIds.includes(job.id)) continue;
    for (const id of job.vmIds) known.set(id, vmName.get(id) ?? id);
  }
  for (const p of copySourcePoints(sources, world.restorePoints, copyJobId)) {
    if (p.vmId && !known.has(p.vmId)) known.set(p.vmId, vmName.get(p.vmId) ?? p.vmName ?? p.vmId);
  }
  return [...known.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function copySourcesOf(copy: BackupCopySettings): CopySources {
  return { jobIds: copy.sourceJobs.map((j) => j.id), repositoryIds: copy.sourceRepositories.map((r) => r.id) };
}

/** The VMs a copy job covers: the ones it picked, or every VM of its sources. */
export function copyJobVmIds(job: BackupJob, world: CopyWorld): string[] {
  if (job.vmIds.length || !job.copy) return job.vmIds;
  return copySourceVms(copySourcesOf(job.copy), world, job.id).map((vm) => vm.id);
}

/** Whether the sources hold encrypted restore points of the VMs copied
 *  (`_encrypted_sources`): a copy of them must be encrypted with a key of the
 *  copy job's own. */
export function copySourcesEncrypted(sources: CopySources, vmIds: string[], world: CopyWorld, copyJobId?: string): boolean {
  if (world.jobs.some((j) => sources.jobIds.includes(j.id) && j.options.encryption)) return true;
  const wanted = new Set(vmIds);
  return world.restorePoints.some(
    (p) =>
      sources.repositoryIds.includes(p.repositoryId) &&
      p.jobId !== copyJobId &&
      (!wanted.size || wanted.has(p.vmId)) &&
      p.encrypted === true,
  );
}

/** Whether the sources hold Hyper-V VMs (`_hyperv_sources`), whose copies have
 *  to land where the Hyper-V hosts reach them. */
export function copySourcesHyperV(
  sources: CopySources,
  vmIds: string[],
  world: CopyWorld & { environments: Environment[] },
  copyJobId?: string,
): boolean {
  const hyperv = new Set(world.environments.filter((e) => e.hypervisor === "hyperv").map((e) => e.id));
  const vmEnv = new Map(world.vms.map((v) => [v.id, v.environmentId]));
  const isHyperV = (vmId: string) => hyperv.has(vmEnv.get(vmId) ?? "");
  if (world.jobs.some((j) => sources.jobIds.includes(j.id) && j.vmIds.some(isHyperV))) return true;
  const wanted = new Set(vmIds);
  return copySourcePoints(sources, world.restorePoints, copyJobId).some(
    (p) => (!wanted.size || wanted.has(p.vmId)) && isHyperV(p.vmId),
  );
}
