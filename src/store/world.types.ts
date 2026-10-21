// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Shared contract between the two world drivers:
 *  - "live": the console is a client of the AltaStor appliance (server/ on :4980)
 *    — hydrated over REST, kept fresh over SSE, mutations are API calls.
 *  - "sim": the original in-browser demo world — seeded data + a 1.2 s tick.
 *
 * Components only ever see `WorldState`; they cannot tell the drivers apart.
 * Every mutation is async in the contract (the sim driver resolves instantly).
 */
import type {
  AccentKey,
  Alert,
  ApplyImmutabilityResult,
  AuditEvent,
  BackupJob,
  CreateEnvironmentInput,
  CreateRepositoryInput,
  Environment,
  FullBackupSchedule,
  Host,
  ImmutabilityEffect,
  JobOptions,
  LogLine,
  MetricSnapshot,
  Replica,
  ReplicaTarget,
  Repository,
  RepositoryImmutability,
  RepositoryShareInput,
  RepositoryValidationResult,
  RestorePlacementOptions,
  RestorePoint,
  Retention,
  RetentionRunResult,
  S3ConnectionCheck,
  S3ConnectionTestResult,
  S3RepositoryConfig,
  Schedule,
  Session,
  Threat,
  VM,
  WinrmProtocol,
} from "@/types";

export type WorldMode = "live" | "sim";

export interface WorldData {
  environments: Environment[];
  hosts: Host[];
  vms: VM[];
  jobs: BackupJob[];
  /** The slice of run history the console currently holds. Hydrate loads only
   *  the newest page (see api.http SESSION_PAGE_SIZE); `loadOlderSessions`
   *  extends it on demand. Screens that summarise "all runs" are summarising
   *  this. */
  sessions: Session[];
  /** How many sessions the appliance has in total, from the page envelope —
   *  so a screen can say what it is *not* showing. */
  sessionsTotal: number;
  /** Whether older sessions remain unfetched. */
  sessionsHasMore: boolean;
  /** True while `loadOlderSessions` is in flight. */
  sessionsLoadingMore: boolean;
  restorePoints: RestorePoint[];
  repositories: Repository[];
  alerts: Alert[];
  threats: Threat[];
  /** Appliance audit trail (server-backed in live mode). */
  auditEvents: AuditEvent[];
  /** Daily estate-wide metric snapshots for Reports. */
  metricsHistory: MetricSnapshot[];
  /** Ready-to-run replicas maintained by replication jobs. */
  replicas: Replica[];
}

/** Failover options for a replica. */
export interface FailoverInput {
  /** Planned = graceful (final sync, then power off source); unplanned = DR now. */
  planned: boolean;
  /** Recovery point to fail over to; defaults to the latest. */
  pointId?: string;
}

/** Editable repository fields for the edit dialog / world action. */
export interface RepositoryEdit {
  name?: string;
  capacityGB?: number;
  compression?: "none" | "optimal" | "high";
  ioThrottleMBps?: number;
  maxConcurrentTasks?: number;
  maintenanceMode?: boolean;
  /** Object Lock. Omitted leaves the repository's setting untouched; included,
   *  it replaces it — mode "none" turns the lock off for future backups. */
  immutability?: RepositoryImmutability;
  /** A local repository's SMB share for Hyper-V hosts. Omitted leaves it as
   *  it is; null removes it. */
  share?: RepositoryShareInput | null;
}

/** Editable environment fields for the edit dialog / world action. */
export interface EnvironmentEdit {
  name?: string;
  endpoint?: string;
  port?: number;
  protocol?: WinrmProtocol;
  username?: string;
  password?: string;
  /** Skip TLS certificate verification (self-signed lab certs). */
  insecure?: boolean;
}

/** A backup job referencing an environment/repository that blocks its deletion. */
export interface BlockingJobRef {
  id: string;
  name: string;
}

/** Outcome of asking the appliance to verify one or more stored backup chains.
 *  Each chain is its own run, so the ids come back as a list: a VM's backups
 *  within one job normally live in a single chain, but span two when the job's
 *  target repository changed part-way through that VM's history. */
export type VerifyBackupResult =
  | { ok: true; sessionIds: string[] }
  | { ok: false; message: string };

/** What a synthetic full should merge, and where the result should land. */
export interface SyntheticFullInput {
  /** The job owning the chain. The appliance starts the run per JOB, not per
   *  chain, so every VM the job covers gets a synthetic full of its own. */
  jobId: string;
  /** The VM whose chain the operator was looking at. The appliance does not
   *  take it (there is no per-VM start), so it is carried only to identify
   *  this VM's session among the ones the run creates. */
  vmId: string;
  /** Where to write the merged full. Omitted, it lands in the job's own
   *  repository, alongside the chain it was merged from. */
  targetRepositoryId?: string;
}

/**
 * Outcome of starting a synthetic full.
 *
 * `sessionIds` is every session the run created — one per VM in the job — and
 * `sessionId` is this VM's, the one the dialog follows. `message` on failure is
 * the appliance's own refusal (an unmergeable repository, a job that is already
 * running), which the dialog shows rather than a generic "couldn't start".
 */
export type SyntheticFullStartResult =
  | { ok: true; sessionId: string | null; sessionIds: string[] }
  | { ok: false; message: string };

/**
 * Outcome of creating or editing a repository.
 *
 * Not `Repository | null`: the appliance refuses an unusable Object Lock
 * configuration with a 422 that names the individual probes that failed
 * (`_assert_immutability_is_usable`), and a null throws that away — leaving the
 * dialog to say "something went wrong" about a bucket that told it exactly what
 * was wrong. `immutabilityEffect` is the appliance's account of what the
 * setting now does, and what it cannot reach.
 */
export type RepositoryWriteResult =
  | { ok: true; repository: Repository; immutabilityEffect: ImmutabilityEffect | null }
  | { ok: false; message: string; checks: S3ConnectionCheck[] };

/** Outcome of a repository delete — the guard reasons are surfaced to the UI. */
export type RepoDeleteResult =
  | { ok: true }
  | { ok: false; reason: "jobs"; jobs: BlockingJobRef[] }
  | { ok: false; reason: "error"; message: string };

/** Outcome of an environment delete — the guard reasons are surfaced to the UI. */
export type EnvDeleteResult =
  | { ok: true }
  | { ok: false; reason: "jobs"; jobs: BlockingJobRef[] }
  | { ok: false; reason: "error"; message: string };

/** Outcome of a single restore-point delete. */
export type RestorePointDeleteResult =
  | { ok: true }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "gfs-protected" }
  | { ok: false; reason: "error"; message: string };

export interface CreateJobInput {
  name: string;
  type: BackupJob["type"];
  description?: string;
  vmIds: string[];
  scopeSummary: string;
  repositoryId: string;
  schedule: Schedule;
  /** Backup jobs only. Omitted or null: the job has no such schedule. */
  activeFullSchedule?: FullBackupSchedule | null;
  syntheticFullSchedule?: FullBackupSchedule | null;
  retention: Retention;
  options: JobOptions;
  accent: AccentKey;
  runNow?: boolean;
  /** For replication jobs — where the replica is maintained. */
  replicaTarget?: ReplicaTarget;
}

export interface RestoreInput {
  vmId: string;
  vmName: string;
  restorePointId: string;
  destination: "original" | "new-location";
  /** Required by the wizard for new-location restores; forwarded to the appliance. */
  targetEnvId?: string;
  /** Name for the restored VM. Empty ⇒ the appliance defaults to "<source>-restored". */
  newName?: string;
  /** Host within the target environment. Empty ⇒ the appliance picks one. */
  targetHostId?: string;
  /** Target datastore name/id. Empty ⇒ the appliance picks one. */
  datastore?: string;
  /** Source-NIC → target-network id pairs, one per source adapter. Empty ⇒
   *  automatic mapping. */
  networkMappings?: { nicId: string; target: string }[];
  /** Source-datastore → target-datastore id pairs, one per datastore the source
   *  VM's disks live on. `datastore` above is the default the rest fall back
   *  to; this is what places a VM whose disks span several datastores. */
  datastoreMappings?: { sourceDatastore: string; target: string }[];
  /** Power the restored VM on once the restore completes. */
  powerOn?: boolean;
  /** Authorizes an in-place restore (destination "original" against a VM
   *  that still exists) — the appliance requires this explicitly since it
   *  destroys the live original once the replacement is fully written. Set
   *  once the wizard's typed-confirmation step is satisfied. */
  force?: boolean;
  /** Decrypts this restore point with a key the operator supplies instead of
   *  the one the catalog holds. Empty ⇒ the appliance resolves its own (the
   *  point's key, then the source job's — `_resolve_restore_encryption_key`).
   *  This is the path that survives a lost catalog: the data carries no key,
   *  so a restore with the escrowed key is what recovers it. */
  encryptionKey?: string;
}

export interface WorldState extends WorldData {
  liveLogs: Record<string, LogLine[]>;
  /** Bumped on structural changes — Providers turns it into query invalidation. */
  revision: number;
  /** Bumped on high-frequency progress updates (no invalidation). */
  tickCount: number;

  mode: WorldMode;
  /** Live: appliance reachable (SSE open). Sim: always true. */
  connected: boolean;
  /** First data load finished (sim: immediately on start). */
  ready: boolean;
  /** Set when the appliance speaks an incompatible major API version — the
   *  console can't safely talk to it at all (not a reachability problem, a
   *  reload/upgrade problem), so this is surfaced as a standing banner
   *  instead of the demo-world fallback. Cleared by the next activation. */
  apiVersionError: string | null;

  runJob(jobId: string, triggeredBy?: Session["triggeredBy"], forceFull?: boolean): Promise<string | null>;
  /** Ask the appliance to stop one in-flight run. Resolves false when the
   *  request didn't reach it — the run keeps going and the caller says so. */
  stopSession(sessionId: string): Promise<boolean>;
  createJob(input: CreateJobInput): Promise<BackupJob>;
  updateJob(jobId: string, patch: Partial<BackupJob>): Promise<void>;
  setJobEnabled(jobId: string, enabled: boolean): Promise<void>;
  deleteJob(jobId: string): Promise<void>;
  markAllAlertsRead(): Promise<void>;
  markAlertRead(id: string): Promise<void>;
  dismissThreat(id: string): Promise<void>;
  /* --------------- hypervisor environment lifecycle --------------- */
  /** Register a vSphere/ESXi/Hyper-V environment. Resolves once the record
   *  exists — discovery is the separate `rescanEnvironment` call, which the
   *  caller runs next and need not block its UI on: an unresponsive vCenter
   *  must not hold a dialog open on an environment that is already created. */
  createEnvironment(input: CreateEnvironmentInput): Promise<Environment | null>;
  editEnvironment(id: string, patch: EnvironmentEdit): Promise<void>;
  deleteEnvironment(id: string): Promise<EnvDeleteResult>;
  /** Re-scan an environment; resolves with the discovered VM count. */
  rescanEnvironment(id: string): Promise<{ vmCount: number } | null>;
  /** Fetch the next (older) page of run history and add it to `sessions`.
   *  A no-op when nothing older remains or a load is already running. */
  loadOlderSessions(): Promise<void>;
  startRestore(input: RestoreInput): Promise<string | null>;
  /** Real datastores/networks for a new-location restore's target picker,
   *  resolved from the restore point's source VM and the candidate targets —
   *  never free text. */
  getRestorePlacementOptions(restorePointId: string): Promise<RestorePlacementOptions>;
  /** Remove a backup chain, or — when `segmentId` is given — just one full
   *  backup and the incrementals chained onto it. There's no single-point
   *  delete; a point is never removed on its own, only as part of its segment. */
  deleteRestorePoint(chainId: string, segmentId?: string, force?: boolean): Promise<RestorePointDeleteResult>;
  /** Re-read every artifact in these backup chains and check it against what
   *  the catalog recorded. Starts the runs and resolves — the verification
   *  itself reports through the session feed like any other run. */
  verifyBackups(chainIds: string[]): Promise<VerifyBackupResult>;
  /** Merge a stored chain into a new full backup, without reading the source
   *  VM. Starts the run and resolves; the merge itself reports through the
   *  session feed like any other run, and lands as a new full restore point. */
  runSyntheticFull(input: SyntheticFullInput): Promise<SyntheticFullStartResult>;
  /** Apply a backup job's retention to every chain it wrote — or, with
   *  `dryRun`, report what that would remove and change nothing. Never
   *  rejects: a refusal comes back as `ok: false` with the appliance's words. */
  runRetention(jobId: string, dryRun: boolean): Promise<RetentionRunResult>;
  /* -------- repository lifecycle (advanced storage management) -------- */
  createRepository(input: CreateRepositoryInput): Promise<RepositoryWriteResult>;
  editRepository(id: string, patch: RepositoryEdit): Promise<RepositoryWriteResult>;
  deleteRepository(id: string): Promise<RepoDeleteResult>;
  rescanRepository(id: string): Promise<void>;
  setRepositoryMaintenance(id: string, maintenance: boolean): Promise<void>;
  /** Real S3 connectivity test before a repository exists — probes the given
   *  credentials/endpoint, it doesn't just check the fields are non-empty. */
  testS3Connection(config: S3RepositoryConfig): Promise<S3ConnectionTestResult>;
  /* ------------------- repository validation / Object Lock ------------- */
  /** Validate an existing repository end to end: reachable, Object Lock still
   *  as configured, and the backups it holds still consistent. */
  verifyRepository(id: string): Promise<RepositoryValidationResult>;
  /** Validate just the Object Lock configuration, by really writing a locked
   *  probe object and trying to delete it — and report what the current
   *  setting does and does not cover. */
  verifyRepositoryImmutability(id: string): Promise<RepositoryValidationResult>;
  /** Put the backups already stored in this repository under its current
   *  Object Lock setting. Changing the setting alone never touches them. */
  applyRepositoryImmutability(id: string): Promise<ApplyImmutabilityResult>;
  /* ----------------------- VM replication ------------------------ */
  failoverReplica(id: string, input: FailoverInput): Promise<void>;
  failbackReplica(id: string): Promise<void>;
  undoFailover(id: string): Promise<void>;
}

/** The mutation surface a driver provides; the facade store delegates to it. */
export type WorldActions = Pick<
  WorldState,
  | "runJob"
  | "stopSession"
  | "createJob"
  | "updateJob"
  | "setJobEnabled"
  | "deleteJob"
  | "markAllAlertsRead"
  | "markAlertRead"
  | "dismissThreat"
  | "createEnvironment"
  | "editEnvironment"
  | "deleteEnvironment"
  | "rescanEnvironment"
  | "loadOlderSessions"
  | "startRestore"
  | "getRestorePlacementOptions"
  | "deleteRestorePoint"
  | "verifyBackups"
  | "runSyntheticFull"
  | "runRetention"
  | "createRepository"
  | "editRepository"
  | "deleteRepository"
  | "rescanRepository"
  | "setRepositoryMaintenance"
  | "testS3Connection"
  | "verifyRepository"
  | "verifyRepositoryImmutability"
  | "applyRepositoryImmutability"
  | "failoverReplica"
  | "failbackReplica"
  | "undoFailover"
>;

/** Narrow store handle handed to drivers — no zustand types leak in. */
export interface WorldHandle {
  set(partial: Partial<WorldState> | ((s: WorldState) => Partial<WorldState>)): void;
  get(): WorldState;
}

export interface WorldDriver {
  readonly mode: WorldMode;
  readonly actions: WorldActions;
  /** Begin feeding the store. Live rejects when the appliance is unreachable. */
  start(): Promise<void>;
  stop(): void;
}

/** The shape every refused or unreachable retention run resolves with, so the
 *  dialog has a single result type to render. */
export function retentionRefused(jobId: string, dryRun: boolean, message: string): RetentionRunResult {
  return {
    ok: false,
    message,
    jobId,
    jobName: "",
    dryRun,
    retentionDays: 0,
    retentionMinFulls: 0,
    clockBlocked: null,
    summary: { chains: 0, points: 0, removed: 0, held: 0, failed: 0, skipped: 0, keptMinFulls: 0 },
    chains: [],
    ranAt: new Date().toISOString(),
  };
}

export const EMPTY_WORLD: WorldData = {
  environments: [],
  hosts: [],
  vms: [],
  jobs: [],
  sessions: [],
  sessionsTotal: 0,
  sessionsHasMore: false,
  sessionsLoadingMore: false,
  restorePoints: [],
  repositories: [],
  alerts: [],
  threats: [],
  auditEvents: [],
  metricsHistory: [],
  replicas: [],
};
