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
  AuditEvent,
  BackupJob,
  CreateEnvironmentInput,
  CreateRepositoryInput,
  Environment,
  Host,
  JobOptions,
  LogLine,
  MetricSnapshot,
  Replica,
  ReplicaTarget,
  Repository,
  RestorePlacementOptions,
  RestorePoint,
  Retention,
  S3ConnectionTestResult,
  S3RepositoryConfig,
  Schedule,
  Session,
  Threat,
  VM,
} from "@/types";

export type WorldMode = "live" | "sim";

export interface WorldData {
  environments: Environment[];
  hosts: Host[];
  vms: VM[];
  jobs: BackupJob[];
  sessions: Session[];
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
}

/** Editable environment fields for the edit dialog / world action. */
export interface EnvironmentEdit {
  name?: string;
  endpoint?: string;
  port?: number;
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
  | { ok: false; reason: "error"; message: string };

export interface CreateJobInput {
  name: string;
  type: BackupJob["type"];
  description?: string;
  vmIds: string[];
  scopeSummary: string;
  repositoryId: string;
  schedule: Schedule;
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
  /** Power the restored VM on once the restore completes. */
  powerOn?: boolean;
  /** Authorizes an in-place restore (destination "original" against a VM
   *  that still exists) — the appliance requires this explicitly since it
   *  destroys the live original once the replacement is fully written. Set
   *  once the wizard's typed-confirmation step is satisfied. */
  force?: boolean;
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
  createJob(input: CreateJobInput): Promise<BackupJob>;
  updateJob(jobId: string, patch: Partial<BackupJob>): Promise<void>;
  setJobEnabled(jobId: string, enabled: boolean): Promise<void>;
  deleteJob(jobId: string): Promise<void>;
  markAllAlertsRead(): Promise<void>;
  markAlertRead(id: string): Promise<void>;
  dismissThreat(id: string): Promise<void>;
  /* --------------- hypervisor environment lifecycle --------------- */
  /** Register a vSphere/ESXi/Hyper-V environment and discover its VMs. */
  createEnvironment(input: CreateEnvironmentInput): Promise<Environment | null>;
  editEnvironment(id: string, patch: EnvironmentEdit): Promise<void>;
  deleteEnvironment(id: string): Promise<EnvDeleteResult>;
  /** Re-scan an environment; resolves with the discovered VM count. */
  rescanEnvironment(id: string): Promise<{ vmCount: number } | null>;
  startRestore(input: RestoreInput): Promise<string | null>;
  /** Real datastores/networks for a new-location restore's target picker,
   *  resolved from the restore point's source VM and the candidate targets —
   *  never free text. */
  getRestorePlacementOptions(restorePointId: string): Promise<RestorePlacementOptions>;
  /** Remove a backup chain, or — when `segmentId` is given — just one full
   *  backup and the incrementals chained onto it. There's no single-point
   *  delete; a point is never removed on its own, only as part of its segment. */
  deleteRestorePoint(chainId: string, segmentId?: string): Promise<RestorePointDeleteResult>;
  /* -------- repository lifecycle (advanced storage management) -------- */
  createRepository(input: CreateRepositoryInput): Promise<Repository | null>;
  editRepository(id: string, patch: RepositoryEdit): Promise<void>;
  deleteRepository(id: string): Promise<RepoDeleteResult>;
  rescanRepository(id: string): Promise<void>;
  setRepositoryMaintenance(id: string, maintenance: boolean): Promise<void>;
  /** Real S3 connectivity test before a repository exists — probes the given
   *  credentials/endpoint, it doesn't just check the fields are non-empty. */
  testS3Connection(config: S3RepositoryConfig): Promise<S3ConnectionTestResult>;
  /* ----------------------- VM replication ------------------------ */
  failoverReplica(id: string, input: FailoverInput): Promise<void>;
  failbackReplica(id: string): Promise<void>;
  undoFailover(id: string): Promise<void>;
}

/** The mutation surface a driver provides; the facade store delegates to it. */
export type WorldActions = Pick<
  WorldState,
  | "runJob"
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
  | "startRestore"
  | "getRestorePlacementOptions"
  | "deleteRestorePoint"
  | "createRepository"
  | "editRepository"
  | "deleteRepository"
  | "rescanRepository"
  | "setRepositoryMaintenance"
  | "testS3Connection"
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

export const EMPTY_WORLD: WorldData = {
  environments: [],
  hosts: [],
  vms: [],
  jobs: [],
  sessions: [],
  restorePoints: [],
  repositories: [],
  alerts: [],
  threats: [],
  auditEvents: [],
  metricsHistory: [],
  replicas: [],
};
