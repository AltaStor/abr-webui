// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Synthetic full: the rules, resolved client-side.
 *
 * A synthetic full produces a new FULL restore point by merging a stored chain
 * — one full backup plus the incrementals written on top of it — inside the
 * repository. Nothing is read from the source host, so it costs the production
 * VM nothing and the network nothing; it is repository I/O and time.
 *
 * Everything here mirrors a check the appliance also makes, so the dialog can
 * refuse an impossible run with the reason instead of firing a request the
 * orchestrator would reject. The mirrored code is named at each check; if the
 * backend's rules move, these are the ones that have to move with them:
 *
 *   - the chain to merge is the LAST segment of (job, VM, repository)
 *     — `resolve_source_chain` / `_segment_points` in abr-core
 *   - it must start with a full and hold at least one incremental, with every
 *     later point an incremental — `validate_chain`
 *   - the repository must be able to merge a chain at all
 *     — `repository_supports_synthetic`, surfaced to us as the repository's
 *       `capabilities.supports_synthetic_full`
 *
 * One rule deliberately has NO mirror here: `validate_chain` also refuses a
 * chain whose points describe different disks (a disk added to or removed from
 * the VM mid-chain). The console is never told which disks a restore point
 * holds, so that one cannot be checked before submitting and is surfaced from
 * the run instead — see `syntheticFullFailureKey`.
 */

import i18n from "@/i18n";
import { segmentChainPoints } from "@/lib/restore-points";
import type { BackupJob, FullBackupSchedule, Repository, RestorePoint, Session } from "@/types";

/**
 * The chain a synthetic full would merge: one full backup and the incrementals
 * chained onto it, in the repository they are stored in.
 */
export interface SyntheticFullChain {
  chainId: string;
  jobId: string;
  jobName: string;
  vmId: string;
  vmName: string;
  /** Where the chain lives, and — unless the operator picks another — where the
   *  merged full is written. */
  repositoryId: string;
  /** The segment anchor. Null only for the orphaned-history edge case where a
   *  chain's oldest point is an incremental, which is itself a refusal. */
  full: RestorePoint | null;
  /** The incrementals on top of the full, oldest first. */
  incrementals: RestorePoint[];
  /** Every point being merged, oldest first — the full, then its incrementals.
   *  Same order the appliance reads them in. */
  points: RestorePoint[];
  /** What the chain occupies in the repository today, summed over its points. */
  storedGB: number;
  /** The real data behind it, where the points report one. */
  logicalGB: number | null;
}

/** Why a synthetic full cannot be started. Each maps to one sentence of copy
 *  and, where there is one, one thing the operator can go and do about it. */
export type SyntheticFullRefusalCode =
  /** This VM isn't covered by a backup job, so there is no chain to merge. */
  | "no-job"
  /** The job has never produced a restore point for this VM in its repository. */
  | "no-chain"
  /** The chain's oldest point is an incremental — pre-existing catalog damage;
   *  the appliance refuses to treat it as a base. */
  | "chain-not-anchored"
  /** A full with nothing on top of it: merging would copy it unchanged, which
   *  the appliance declines to do. */
  | "no-incrementals"
  /** The chain's own repository can't merge (not an AltaStor local/S3 repo). */
  | "source-repository-unsupported"
  /** The chain's repository is unreachable — its points can't be read. */
  | "source-repository-offline"
  /** The repository the operator picked can't hold a merged backup. */
  | "target-repository-unsupported"
  /** The repository the operator picked is unreachable. */
  | "target-repository-offline"
  /** A run of this job is already in flight; the appliance would queue a second
   *  one against a chain that is about to change underneath it. */
  | "job-running";

export interface SyntheticFullRefusal {
  code: SyntheticFullRefusalCode;
  /** Interpolation values for the refusal's copy (repository/job names). */
  values?: Record<string, string>;
}

interface SyntheticFullWorld {
  jobs: BackupJob[];
  restorePoints: RestorePoint[];
  repositories: Repository[];
  sessions: Session[];
}

/**
 * The jobs that back up this VM and could, in principle, merge a chain for it —
 * i.e. the ones that have actually written restore points for it. A VM covered
 * by a job that has never run has nothing to merge, so it isn't offered.
 *
 * Ordered newest-chain-first, so the default selection is the chain the
 * operator most likely means.
 */
export function syntheticFullJobsForVm(vmId: string, world: SyntheticFullWorld): BackupJob[] {
  const byJob = new Map<string, string>();
  for (const point of world.restorePoints) {
    if (point.vmId !== vmId) continue;
    const latest = byJob.get(point.jobId);
    if (!latest || point.createdAt > latest) byJob.set(point.jobId, point.createdAt);
  }
  return world.jobs
    .filter((job) => job.type === "backup" && byJob.has(job.id))
    .sort((a, b) => (byJob.get(b.id) ?? "").localeCompare(byJob.get(a.id) ?? ""));
}

/**
 * Resolve the chain a synthetic full for (job, VM) would merge.
 *
 * Mirrors `resolve_source_chain`: take this VM's points for this job, and keep
 * the LAST segment — the newest full and everything chained onto it. Older
 * generations in the same chain are not merged and are not touched.
 *
 * Returns null when the pair has no points at all. A chain whose newest segment
 * is unmergeable still comes back — `validateSyntheticFull` names the problem,
 * and the dialog can show the operator what it found.
 */
export function resolveSyntheticFullChain(
  vmId: string,
  jobId: string,
  world: SyntheticFullWorld,
): SyntheticFullChain | null {
  const jobVmPoints = world.restorePoints.filter((p) => p.vmId === vmId && p.jobId === jobId);
  if (jobVmPoints.length === 0) return null;

  /* A job that was repointed at another repository mid-history leaves this VM
   * with more than one chain. The appliance merges within ONE repository, so
   * the newest chain wins — that is the one the job is writing to now. */
  const newestByChain = new Map<string, string>();
  for (const point of jobVmPoints) {
    const latest = newestByChain.get(point.chainId);
    if (!latest || point.createdAt > latest) newestByChain.set(point.chainId, point.createdAt);
  }
  const chainId = [...newestByChain.entries()].sort((a, b) => b[1].localeCompare(a[1]))[0][0];
  const chainPoints = jobVmPoints.filter((p) => p.chainId === chainId);

  const segments = segmentChainPoints(chainPoints);
  const segment = segments[segments.length - 1];
  // `segmentChainPoints` hands back each segment newest-first; the appliance
  // reads a chain oldest-first, and so does everything below.
  const points = [...segment.points].reverse();
  const full = segment.full;
  const incrementals = points.filter((p) => p !== full);
  const measured = points.filter((p) => p.logicalGB != null && p.logicalGB > 0);

  const anchor = points[0];
  return {
    chainId,
    jobId,
    jobName: anchor.jobName,
    vmId,
    vmName: anchor.vmName,
    repositoryId: anchor.repositoryId,
    full,
    incrementals,
    points,
    storedGB: points.reduce((total, p) => total + p.sizeGB, 0),
    logicalGB: measured.length
      ? measured.reduce((total, p) => total + (p.logicalGB as number), 0)
      : null,
  };
}

/**
 * Can this repository hold a merged full?
 *
 * `supportsSyntheticFull` is the appliance's own answer
 * (`capabilities.supports_synthetic_full`) and is trusted whenever it is
 * present. The demo simulation doesn't report capabilities, so it falls back to
 * the same rule the appliance applies by default (`is_abr_repository`): the
 * .abr-format repositories — local and SMB folders and object storage — can
 * merge a chain, and a plain NFS target cannot.
 */
export function repositorySupportsSyntheticFull(repository: Repository | undefined): boolean {
  if (!repository) return false;
  if (typeof repository.supportsSyntheticFull === "boolean") return repository.supportsSyntheticFull;
  return (
    repository.type === "local" ||
    repository.type === "smb" ||
    repository.type === "object-lock-s3" ||
    repository.type === "hardened-immutable"
  );
}

/**
 * Every refusal that can be known before submitting, in the order the operator
 * can act on them. Returns null when the run is startable.
 *
 * `targetRepositoryId` is the repository the merge is written to — omit it (or
 * pass the chain's own) for a merge that stays where the chain is.
 */
export function validateSyntheticFull(
  chain: SyntheticFullChain | null,
  world: SyntheticFullWorld,
  targetRepositoryId?: string,
): SyntheticFullRefusal | null {
  if (!chain) return { code: "no-chain" };

  const sourceRepository = world.repositories.find((r) => r.id === chain.repositoryId);
  if (!repositorySupportsSyntheticFull(sourceRepository)) {
    return {
      code: "source-repository-unsupported",
      values: { repository: sourceRepository?.name ?? chain.repositoryId },
    };
  }
  if (sourceRepository?.status === "offline") {
    return { code: "source-repository-offline", values: { repository: sourceRepository.name } };
  }

  /* validate_chain, in its own order: anchored, then long enough to be worth
   * merging. Anything after the full that isn't an incremental can't occur in
   * a single segment — `segmentChainPoints` starts a new one at every full — so
   * that arm of the backend check has nothing to mirror here. */
  if (!chain.full || chain.points[0] !== chain.full) return { code: "chain-not-anchored" };
  if (chain.incrementals.length === 0) return { code: "no-incrementals" };

  if (targetRepositoryId && targetRepositoryId !== chain.repositoryId) {
    const target = world.repositories.find((r) => r.id === targetRepositoryId);
    if (!repositorySupportsSyntheticFull(target)) {
      return {
        code: "target-repository-unsupported",
        values: { repository: target?.name ?? targetRepositoryId },
      };
    }
    if (target?.status === "offline") {
      return { code: "target-repository-offline", values: { repository: target.name } };
    }
  }

  const job = world.jobs.find((j) => j.id === chain.jobId);
  if (job && (job.state === "running" || job.lastStatus === "running")) {
    return { code: "job-running", values: { job: job.name } };
  }

  return null;
}

/**
 * The repositories a merged full may be written to: every one that can hold it
 * and is reachable, plus the chain's own repository, which is always the
 * default and is listed even while offline so the dialog can explain itself
 * rather than silently drop the current target.
 */
export function syntheticFullTargetRepositories(
  chain: SyntheticFullChain,
  repositories: Repository[],
): Repository[] {
  return repositories.filter(
    (repository) =>
      repository.id === chain.repositoryId ||
      (repositorySupportsSyntheticFull(repository) && repository.status !== "offline"),
  );
}

/**
 * Translate a failed synthetic-full run into one of the console's own
 * explanations.
 *
 * The appliance's `SyntheticFullValidationError` text is precise but written
 * for a log, and some of its cases — a disk added to the VM mid-chain,
 * a repository that filled up — are exactly the ones an operator needs told in
 * their own language, with the next step attached. Returns the i18n key under
 * `inventory:syntheticFull.failure`, or null to show the appliance's own
 * sentence unchanged (always better than a wrong guess).
 */
export function syntheticFullFailureKey(message: string): string | null {
  if (!message) return null;
  if (/different disks/i.test(message)) return "mismatchedDisks";
  if (/missing stored backup locations/i.test(message)) return "missingArtifacts";
  if (/records no backup artifacts/i.test(message)) return "missingArtifacts";
  if (/no space|out of space|disk full|insufficient/i.test(message)) return "outOfSpace";
  if (/permission denied|access denied|forbidden|not permitted/i.test(message)) return "permissionDenied";
  if (/no longer registered/i.test(message)) return "repositoryGone";
  if (/where the chain it reads from is stored/i.test(message)) return "destinationCollision";
  if (/cannot merge|cannot hold a merged/i.test(message)) return "repositoryUnsupported";
  if (/synthetic full needs it to start with a full|every backup after the full/i.test(message)) {
    return "invalidChain";
  }
  // The appliance's sentence needs no next step, so the console's is that
  // sentence word for word: the banner, the VM row and the log then agree.
  if (/only a full backup with no incrementals/i.test(message)) return "noIncrementals";
  return null;
}

/**
 * When an active full backup lands on the same day as the synthetic full.
 *
 * The appliance resolves a tie between due schedules in favour of the more
 * thorough kind (`active_overrides_synthetic`, in `job_effective_policy`), so
 * "Active full: daily 02:00" + "Synthetic full: daily 02:00" is a legal job
 * that quietly runs an active full every night and never merges anything. The
 * operator gets an expensive full backup where they configured a cheap one.
 *
 * A collision at a DIFFERENT time on the same day is not a tie and nothing
 * overrides anything, but it is just as wasted: an active full starts a new
 * chain, so a merge a few hours either side of it either has nothing to merge
 * yet or is superseded before the day is out. Both are worth saying, in
 * different words:
 *
 *   "always"   Same time, every occurrence. The merge never runs at all.
 *   "partial"  Same time, some occurrences — a daily merge against a weekly
 *              active full, which merges six nights a week and skips the
 *              seventh.
 *   "sameDay"  Different times, same day. The merge runs and achieves little.
 *
 * Any pair whose days can meet is reported, including the ones that meet only
 * in some months: an active full on day 15 against a weekly merge on Mondays
 * (the months the 15th is a Monday), or monthly schedules on the 30th and the
 * 31st (every 30-day month, where both run on the 30th). Only periodic and cron
 * schedules, set from the CLI, are left alone.
 */
export interface SyntheticFullOverride {
  kind: "always" | "partial" | "sameDay";
  /** Weekday indexes (0 = Sunday) the collision falls on. Absent when it falls
   *  on every day the merge is due. With `dayOfMonth`, the collision falls on
   *  that day of the month in the months it is one of these weekdays. */
  days?: number[];
  /** Day of the month the collision falls on. */
  dayOfMonth?: number;
  /** Two monthly schedules on different days from the 28th on: both run on the
   *  last day of each month that has no day `monthsWithoutDay`. */
  monthsWithoutDay?: number;
}

/** The frequencies whose occurrences can be compared without a calendar. */
function isCalendarFrequency(
  schedule: FullBackupSchedule,
): schedule is FullBackupSchedule & { frequency: "daily" | "weekly" | "monthly" } {
  return schedule.frequency === "daily" || schedule.frequency === "weekly" || schedule.frequency === "monthly";
}

/** A weekly schedule on all seven days falls due every day, so it is compared
 *  as a daily one. */
function asDaily<S extends FullBackupSchedule>(schedule: S): S {
  return schedule.frequency === "weekly" && new Set(schedule.daysOfWeek ?? []).size === 7
    ? { ...schedule, frequency: "daily" }
    : schedule;
}

export function syntheticFullOverride(
  activeSchedule: FullBackupSchedule | null | undefined,
  syntheticSchedule: FullBackupSchedule | null | undefined,
): SyntheticFullOverride | null {
  if (!activeSchedule?.enabled || !syntheticSchedule?.enabled) return null;
  // periodic / cron — not comparable without evaluating the expressions.
  if (!isCalendarFrequency(activeSchedule) || !isCalendarFrequency(syntheticSchedule)) return null;
  const active = asDaily(activeSchedule);
  const synthetic = asDaily(syntheticSchedule);

  // Same time is what makes the appliance choose between them; a different time
  // on the same day is a weaker finding, not a non-finding.
  const sameTime = active.atTime === synthetic.atTime;
  const collide = (kind: "always" | "partial", rest: Omit<SyntheticFullOverride, "kind"> = {}) =>
    sameTime ? { kind, ...rest } : { kind: "sameDay" as const, ...rest };

  if (active.frequency === "daily") {
    // The active full falls due every day, so it meets every merge there is.
    return collide("always");
  }

  if (active.frequency === "weekly") {
    const activeDays = [...new Set(active.daysOfWeek ?? [])].sort((a, b) => a - b);
    if (!activeDays.length) return null;
    if (synthetic.frequency === "daily") return collide("partial", { days: activeDays });
    if (synthetic.frequency === "weekly") {
      const syntheticDays = [...new Set(synthetic.daysOfWeek ?? [])];
      if (!syntheticDays.length) return null;
      const overlap = syntheticDays.filter((day) => activeDays.includes(day)).sort((a, b) => a - b);
      if (!overlap.length) return null;
      return overlap.length === syntheticDays.length
        ? collide("always")
        : collide("partial", { days: overlap });
    }
    // A monthly merge meets it in the months its day falls on one of these.
    return collide("partial", { dayOfMonth: synthetic.dayOfMonth ?? 1, days: activeDays });
  }

  // Monthly active full.
  const dayOfMonth = active.dayOfMonth ?? 1;
  if (synthetic.frequency === "daily") return collide("partial", { dayOfMonth });
  if (synthetic.frequency === "weekly") {
    const syntheticDays = [...new Set(synthetic.daysOfWeek ?? [])].sort((a, b) => a - b);
    if (!syntheticDays.length) return null;
    return collide("partial", { dayOfMonth, days: syntheticDays });
  }
  const syntheticDay = synthetic.dayOfMonth ?? 1;
  if (syntheticDay === dayOfMonth) return collide("always");
  // A day a month is too short for runs on its last day (`_next_monthly_after`),
  // so two different days from the 28th on still meet there: the 30th and the
  // 31st in every 30-day month, any two of them in February.
  const earlier = Math.min(syntheticDay, dayOfMonth);
  return earlier >= 28 ? collide("partial", { monthsWithoutDay: earlier + 1 }) : null;
}

/**
 * A failed synthetic full's result, in the console's own words.
 *
 * `syntheticFullFailureKey` is the recognizer; this is the sentence, and it is
 * here rather than in the dialog because a synthetic full fails in two places:
 * the manual run an operator is watching, and a scheduled one they find
 * afterwards in Activity or a job's run history. Both were reading the same
 * appliance message; only one of them translated it.
 *
 * Falls back to the appliance's own sentence — always truer than a wrong guess
 * — and to a generic line only when it said nothing at all.
 */
export function syntheticFullFailureMessage(message: string): string {
  const key = syntheticFullFailureKey(message);
  if (key) return i18n.t(`inventory:syntheticFull.failure.${key}`);
  return message || i18n.t("inventory:syntheticFull.failure.generic");
}

/**
 * A refusal as a sentence. Resolved at call time so it follows the active
 * language, and shared by everything that can refuse a synthetic full — the
 * dialog before submitting, and the demo world's own driver — so an operator
 * never gets two different explanations for the same "no".
 */
export function syntheticFullRefusalMessage(refusal: SyntheticFullRefusal): string {
  return i18n.t(`inventory:syntheticFull.refusal.${refusal.code}`, refusal.values ?? {});
}
