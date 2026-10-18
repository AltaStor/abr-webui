// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * AltaStor — domain model.
 * Every entity in the mock world is typed here; nothing in the app uses `any`.
 */

export type Hypervisor = "vmware" | "proxmox" | "hyperv";

export type EnvironmentType = "vcenter" | "esxi-standalone" | "proxmox" | "hyperv";

/** How a Hyper-V environment is reached over WinRM. */
export type WinrmProtocol = "https" | "http";

export interface Environment {
  id: string;
  name: string;
  type: EnvironmentType;
  hypervisor: Hypervisor;
  version: string;
  endpoint: string;
  port?: number;
  /** Hyper-V only; unset until an environment registered before the setting
   *  existed has been reached once. */
  protocol?: WinrmProtocol;
  /** Skip TLS certificate verification (self-signed lab certs). */
  insecure?: boolean;
  connected: boolean;
  /** Why the last discovery/rescan failed (e.g. a TLS certificate error), if
   *  `connected` is false because of one. Null once a scan succeeds again. */
  statusError?: string | null;
  hostCount: number;
  vmCount: number;
}

/** Payload for registering a hypervisor environment (POST /inventories). */
export interface CreateEnvironmentInput {
  name: string;
  type: EnvironmentType;
  /** Host / management address (vCenter, ESXi, or Hyper-V host). */
  endpoint: string;
  port?: number;
  /** Hyper-V only; the appliance defaults to HTTPS. */
  protocol?: WinrmProtocol;
  username: string;
  password: string;
  /** Bearer token — the Hyper-V agent's API token (alternative to user/pass). */
  token?: string;
  /** Skip TLS certificate verification (self-signed lab certs). */
  insecure?: boolean;
}

export type HostStatus = "online" | "maintenance" | "disconnected";

export interface Host {
  id: string;
  environmentId: string;
  name: string;
  cluster: string;
  status: HostStatus;
  cpuCores: number;
  memoryGB: number;
  vmCount: number;
}

export type PowerState = "running" | "stopped" | "suspended";

/** Protection status drives all of the green/amber/red coding across the app. */
export type ProtectionStatus = "protected" | "warning" | "unprotected";

/**
 * Guest-OS family, driving the VM glyph. "unknown" is a real state, not a
 * default: a powered-off Hyper-V VM reports no guest OS (integration-services
 * KVP is only live while it runs), so we must not guess — a Windows VM that's
 * merely switched off should never render as Linux.
 */
export type OsFamily = "windows" | "linux" | "macos" | "unknown";

export interface VM {
  id: string;
  name: string;
  environmentId: string;
  hostId: string;
  guestOs: string;
  osFamily: OsFamily;
  powerState: PowerState;
  vcpus: number;
  memoryGB: number;
  provisionedGB: number;
  usedGB: number;
  tags: string[];
  protection: ProtectionStatus;
  /** ISO timestamp of last successful backup, or null if never protected. */
  lastBackupAt: string | null;
  restorePointCount: number;
  ipAddress: string;
  /** Set when protection === "warning" / "unprotected" to explain why. */
  protectionNote?: string;
  /** Hyper-V VMs only: the configuration discovery read off the host. */
  hyperv?: HyperVVmDetails;
}

/** A Hyper-V VM's configuration, disks and adapters, as discovered. */
export interface HyperVVmDetails {
  /** 1 (BIOS) or 2 (UEFI). */
  generation: number | null;
  /** The VM configuration version, e.g. "10.0". */
  configurationVersion: string | null;
  checkpointCount: number;
  /** A role of a failover cluster, rather than a VM of one standalone host. */
  clustered: boolean;
  /** The node the VM runs on now. */
  ownerNode: string | null;
  disks: HyperVDisk[];
  networkAdapters: HyperVNetworkAdapter[];
}

export interface HyperVDisk {
  name: string;
  /** Controller slot, e.g. "SCSI0:1". */
  controller: string | null;
  /** The disk's current file; empty for a pass-through physical disk. */
  path: string | null;
  /** "VHDX", "VHD" or "VHDSet". */
  format: string | null;
  /** "Fixed", "Dynamic" or "Differencing". */
  type: string | null;
  capacityGB: number;
}

export interface HyperVNetworkAdapter {
  name: string;
  /** The virtual switch it is connected to; null when it is not connected. */
  switchName: string | null;
  mac: string | null;
}

export type ScheduleFrequency = "hourly" | "daily" | "weekly" | "custom";

export interface Schedule {
  frequency: ScheduleFrequency;
  /** For hourly: run every N hours. */
  everyHours?: number;
  /** "HH:mm" 24h local time, for daily/weekly. */
  atTime?: string;
  /** 0 (Sun) – 6 (Sat) for weekly. */
  daysOfWeek?: number[];
  cron?: string;
}

/**
 * When a job takes a full backup instead of its usual incremental: the
 * appliance's `active_full_schedule` / `synthetic_full_schedule`, which run
 * alongside the job's base {@link Schedule}.
 *
 * A separate type from `Schedule` because the appliance gives these a monthly
 * form and an `enabled` flag of their own. `enabled: false` suspends the
 * schedule and keeps its settings for later. The console edits daily, weekly
 * and monthly schedules. "periodic" and "cron" can only be set from the CLI,
 * so the console shows them and sends them back unchanged.
 */
export interface FullBackupSchedule {
  frequency: "daily" | "weekly" | "monthly" | "periodic" | "cron";
  /** "HH:mm" 24h, for daily/weekly/monthly. */
  atTime?: string;
  /** 0 (Sun) – 6 (Sat), for weekly. May hold several days. */
  daysOfWeek?: number[];
  /** 1–31, for monthly. A month without that day runs on its last day. */
  dayOfMonth?: number;
  /** For periodic. */
  everyMinutes?: number;
  /** For cron. */
  cron?: string;
  enabled: boolean;
  /** The timezone the appliance evaluates `atTime` in; absent means UTC. */
  timezone?: string;
}

export interface Retention {
  /** Days of short-term backups to keep before they age out (sent to the API as `retention_days`). */
  keepDays: number;
  gfs?: {
    weekly: number;
    monthly: number;
    yearly: number;
    /** Whether GFS archiving is actually applied. The appliance keeps this
     *  separate from the counts (`gfs.enabled` on the wire) so archiving can be
     *  suspended without losing the configured weekly/monthly/yearly figures —
     *  a suspended policy marks nothing, and its previously-marked points fall
     *  back under plain `keepDays` retention. Defaults to true. */
    enabled: boolean;
  };
}

export type QuiesceFailureAction = "fail" | "crash_consistent";

export type BackupConsistency = "quiesced" | "crash_consistent";

export interface JobOptions {
  appAware: boolean;
  onQuiesceFailure?: QuiesceFailureAction;
  /** AES-256 at rest. On its own this is all the appliance needs: a job that
   *  turns encryption on without a key of its own gets a 256-bit one minted
   *  server-side. */
  encryption: boolean;
  /** An operator-supplied key, when they chose one over the generated default.
   *  Write-only — the appliance never returns a stored key, so this is only
   *  ever what the console is about to send, never what a job reports. Left
   *  undefined to keep the appliance-managed key (see `optionsToTaskParams`). */
  encryptionKey?: string;
  /** Zstd level 0 (fastest, no compression) – 9 (smallest, most CPU). Default 3. */
  compression: number;
  dedup: boolean;
  /** Backup window, "HH:mm-HH:mm" or undefined for anytime. */
  window?: string;
  throttleMBps?: number;
  /** Hyper-V only: checkpoint consistency. "application" quiesces a running
   *  guest through VSS and falls back to crash-consistent when it cannot;
   *  undefined leaves the appliance default (application). */
  guestConsistency?: "application" | "crash";
}

/** One backup chain (job × VM × repository) as a retention pass saw it. */
export interface RetentionChainReport {
  vmId: string;
  vmName: string | null;
  repositoryId: string | null;
  repositoryName: string | null;
  /** Restore points in the chain when the pass started. */
  points: number;
  /** Ids removed — or, for a preview, the ids a real pass would remove. */
  removed: string[];
  /** Expired points kept because S3 Object Lock still holds their data. */
  held: { pointId: string; until: string }[];
  /** Expired points whose stored data could not be removed; kept for retry. */
  failed: string[];
  /** Expired points kept because a newer point they carry is held or failed. */
  keptForChain: string[];
  /** Set when the chain was left alone, e.g. a backup of the VM is running. */
  skippedReason: string | null;
}

/** POST /jobs/{id}/retention — what a retention pass removed or would remove. */
export interface RetentionRunResult {
  ok: boolean;
  /** The appliance's refusal, when ok is false. */
  message?: string;
  jobId: string;
  jobName: string;
  dryRun: boolean;
  retentionDays: number;
  summary: { chains: number; points: number; removed: number; held: number; failed: number; skipped: number };
  chains: RetentionChainReport[];
  ranAt: string;
}

export type JobType = "backup" | "replication" | "backup-copy";
/** A session's run kind — everything a job can be, plus the three the appliance
 *  runs without a job behind them: "restore", "verify" (an integrity check over
 *  one stored backup chain) and "delete" (removing a chain or one of its
 *  segments). The appliance reports each as a session of its own
 *  (`task_type`), and a console that doesn't know one of them files it under
 *  "backup" — which is how a deletion came to be listed as a full backup. */
export type SessionType = JobType | "restore" | "verify" | "delete";
export type JobRunState = "idle" | "running" | "disabled";

export type JobRunResult = "success" | "warning" | "failed" | "stopped" | "running";

export interface JobLastRunVm {
  vmId: string | null;
  vmName: string;
  result: JobRunResult;
  sessionIds: string[];
  message?: string;
}

/** The appliance's account of a job's last run over all of its VMs. */
export interface JobLastRun {
  id: string;
  result: JobRunResult;
  vmCount: number;
  succeeded: number;
  warning: number;
  failed: number;
  stopped: number;
  running: number;
  vms: JobLastRunVm[];
}

export interface BackupJob {
  id: string;
  name: string;
  type: JobType;
  description?: string;
  /** Resolved VM ids in scope (after selection rules applied). */
  vmIds: string[];
  /** Human label of how the scope was defined, e.g. "Tag: production". */
  scopeSummary: string;
  repositoryId: string;
  schedule: Schedule;
  /** Full backups that run on their own schedules alongside `schedule`
   *  (backup jobs only). When several fall due at once, the appliance runs one
   *  session and picks active full over synthetic full over incremental. */
  activeFullSchedule?: FullBackupSchedule | null;
  syntheticFullSchedule?: FullBackupSchedule | null;
  /** Next firing of each full schedule. Null while the schedule or the job is off. */
  activeFullNextRunAt?: string | null;
  syntheticFullNextRunAt?: string | null;
  retention: Retention;
  options: JobOptions;
  state: JobRunState;
  /** Last run status, for the list pill. */
  lastStatus: SessionStatus | null;
  /** The last run over all VMs; null for a job that has not run since the
   *  appliance started reporting runs. */
  lastRun?: JobLastRun | null;
  lastRunAt: string | null;
  clockWarnings?: string[];
  nextRunAt: string | null;
  createdAt: string;
  /** 0–100, success ratio over recent runs. */
  successRate: number;
  /** Recent run statuses, newest last — drives the sparkline. */
  recentRuns: SessionStatus[];
  accent: AccentKey;
  /** For replication jobs (type === "replication"): where the replica is kept. */
  replicaTarget?: ReplicaTarget;
}

export type AccentKey = "emerald" | "cyan" | "blue" | "violet" | "amber";

export type SessionStatus = "success" | "warning" | "failed" | "running" | "queued";

export interface VmRunResult {
  vmId: string;
  vmName: string;
  status: "success" | "warning" | "failed" | "running" | "pending";
  processedGB: number;
  transferredGB: number;
  durationSec: number;
  message?: string;
}

export interface Session {
  id: string;
  jobId: string;
  jobName: string;
  type: SessionType;
  status: SessionStatus;
  /** "full" | "incremental" — drives restore-point typing. */
  backupType: "full" | "incremental";
  /**
   * A `backupType: "full"` run that merged the existing chain in the repository
   * instead of re-reading the VM — the orchestrator's "SyntheticFull". Absent/
   * false for an active full. Kept as a separate flag rather than a third
   * `backupType` so everything that only cares "full or incremental" (run
   * history pills, chain segmentation, the sim's throughput model) keeps
   * working untouched.
   */
  synthetic?: boolean;
  startedAt: string;
  finishedAt: string | null;
  durationSec: number;
  /** 0–100. */
  progress: number;
  processedGB: number;
  transferredGB: number;
  throughputMBps: number;
  /**
   * Live guest READ rate (MB/s) — bytes pulled off the source, derived by
   * diffing `processedGB` across polls the way `throughputMBps` is derived
   * from `transferredGB`. The two are different stages and differ in size
   * (the repo write is post-compression/dedup), so a "guest read" readout must
   * use this one. Undefined until there are two samples to diff.
   */
  guestReadMBps?: number;
  vmCount: number;
  vmResults: VmRunResult[];
  /** Set for warning/failed. */
  message?: string;
  consistency?: BackupConsistency | null;
  consistencyReason?: string | null;
  /**
   * Live stage caption for a *running* session (e.g. "Backing up disk 2/3:
   * 61%", "Storing changed blocks for disk 1/2: 40%") — the same text the CLI's
   * `--watch`/`--wait` prints, straight from the orchestrator's per-disk
   * progress reporting. Real backend only; the demo simulation never sets it.
   */
  stageMessage?: string;
  /**
   * The appliance has accepted a stop for this run and is winding it down
   * (orchestrator state "stopping", see stop_session in abr_v41.py). It is
   * still a RUNNING session — `status` stays "running" until the engine
   * actually lets go — so this is the only thing that distinguishes a run
   * that was asked to stop from one that wasn't.
   */
  stopping?: boolean;
  triggeredBy: "schedule" | "manual" | "retry";
  /**
   * Which phase a *running* session is in. For agent-backed (real Hyper-V)
   * VMs the run isn't done when the guest read finishes — the bytes still
   * have to stream into the chunk store, which for a full disk takes minutes.
   * "storing" means the guest read is done and the session is now waiting on
   * (and reporting) the real repository ingest. Absent/"reading" is the normal
   * in-flight phase. Simulated VMs never leave "reading".
   */
  phase?: "reading" | "storing";
  /**
   * Live per-stage pipeline rates (MB/s) for the Veeam-style bottleneck view,
   * set only for agent-backed runs during the "storing" phase. Each is a REAL
   * measurement of a distinct stage, so they are not interchangeable:
   *  - sourceReadMBps: guest bytes read from the VM over the LAN (agent counter).
   *  - netMBps: bytes actually crossing the wire (compressed when gzip is on).
   *  - repoWriteMBps: PHYSICAL bytes landing in the repository after dedup +
   *    compression (datad stats delta) — the honest "written to repo" number,
   *    pool-wide under concurrency. Drives the live waveform.
   *  - logicalProcessedMBps: the reconstructed logical image streamed to the
   *    store. For an incremental this is dominated by the prior full re-emitted
   *    from datad over localhost, so it is NOT a wire or repo-write rate.
   * Undefined when not measured yet (render as "—", never 0).
   */
  pipeline?: {
    sourceReadMBps?: number;
    netMBps?: number;
    repoWriteMBps?: number;
    logicalProcessedMBps?: number;
    /** Total guest bytes pulled this run (GB) — the real off-host data moved. */
    sourcePulledGB?: number;
    /** True while the repo-write rate is a pool-wide figure (a second backup is
     * ingesting concurrently), so the UI can caveat it. */
    repoWritePooled?: boolean;
    /** The limiting stage, inferred from pipe back-pressure vs upstream starve
     * timing; null until there is enough signal. "target" = repository can't
     * absorb fast enough; "source" = guest read is the limiter; "network" = the
     * LAN is. */
    bottleneck?: "source" | "network" | "target" | null;
  };
}

/* ------------------------------------------------------------------ */
/* Cross-hypervisor restore — disk-format + guest conversion planning   */
/* ------------------------------------------------------------------ */

/** Native virtual-disk format of each platform (+ the intermediate raw image). */
export type DiskFormat = "vhdx" | "vmdk" | "qcow2" | "raw";

export type ConversionConfidence = "high" | "medium" | "low";

export interface ConversionStep {
  /** Stable key for progress mapping: reconstruct | convert-format | adapt-guest | provision. */
  key: string;
  label: string;
  detail: string;
}

/**
 * The plan for restoring a VM captured on one hypervisor onto a different one:
 * which disk-format conversion runs, how the guest is adapted (drivers/firmware),
 * and how confident we are the result boots. Computed identically on the console
 * (to preview) and the appliance (to execute) via `@/lib/conversion`.
 */
export interface ConversionPlan {
  crossPlatform: boolean;
  sourcePlatform: Hypervisor;
  targetPlatform: Hypervisor;
  sourceFormat: DiskFormat;
  targetFormat: DiskFormat;
  formatChange: boolean;
  firmware: "bios" | "uefi";
  osFamily: OsFamily;
  /** Human description of the driver/boot adaptation. */
  driverStrategy: string;
  confidence: ConversionConfidence;
  steps: ConversionStep[];
  warnings: string[];
}

export type RestorePointType = "full" | "incremental";

export interface RestorePoint {
  id: string;
  /** The backup chain (job + VM + repository) this point belongs to. Deletion
   *  is chain-granular — every point sharing a chainId is removed together,
   *  never a single point on its own. */
  chainId: string;
  vmId: string;
  vmName: string;
  jobId: string;
  jobName: string;
  createdAt: string;
  type: RestorePointType;
  /** What this point occupies in the repository, after compression. */
  sizeGB: number;
  repositoryId: string;
  /** The real, uncompressed data behind `sizeGB` — what a restore writes back.
   *  null when the appliance has no figure: points written before the data
   *  mover reported one. */
  logicalGB: number | null;
  /** `sizeGB` ÷ `logicalGB`, as the mover measured it: 0.36 means the point
   *  occupies 36% of the data it came from. Lower is better; null when
   *  unknown. */
  compressionRatio: number | null;
  /** Zstd level 0–9 this point was written with, or null when unknown (older
   *  catalog entries predate the field). */
  compressionLevel: number | null;
  /** Whether the point's data is encrypted at rest, as the appliance recorded
   *  it when the point was written. null when it didn't say: that is "unknown",
   *  and reading it as "not encrypted" would be a claim nobody made. */
  encrypted: boolean | null;
  consistency?: BackupConsistency | null;
  consistencyReason?: string | null;
  gfsProtected: boolean;
  /**
   * This full point was produced by merging an existing chain (a synthetic
   * full), not by reading the VM again (an active full). Both are `type:
   * "full"` and both restore identically and anchor the incrementals that
   * follow — the distinction is where the bytes came from, which is what makes
   * it worth showing: a synthetic full moved no data off the source host.
   * From the orchestrator's `execution_type` ("SyntheticFull").
   */
  synthetic: boolean;
}

/** A target-environment datastore, scoped to the hosts it's actually mounted on. */
export interface RestoreDatastoreOption {
  id: string;
  environmentId: string;
  name: string;
  hostIds: string[];
  /** Free/total space in bytes, or null when the appliance hasn't reported it
   *  (inventory scanned before capacity collection, or the plugin can't see it). */
  freeBytes: number | null;
  capacityBytes: number | null;
}

/** A target-environment network / virtual switch a restored VM's NIC can land on. */
export interface RestoreNetworkOption {
  id: string;
  environmentId: string;
  name: string;
  /** Hosts whose virtual switches expose this network. Empty means the scope is
   *  unknown (inventory discovered before per-host networks were collected), in
   *  which case the network is offered on every host rather than hidden. */
  hostIds: string[];
}

/** One of the source VM's own network adapters — kept distinct (not deduped
 *  by network name) so two NICs on the same source network still map as
 *  separate, individually-targetable rows in the restore wizard. */
export interface RestoreSourceNic {
  id: string;
  label: string;
  sourceNetwork: string | null;
  connected: boolean;
}

/** A VM already present in a candidate target environment — used to flag a
 *  restored-VM name that would collide before the appliance rejects it. */
export interface RestoreExistingVmOption {
  id: string;
  environmentId: string;
  name: string;
}

/**
 * One of the source VM's virtual disks, as the restore point records it.
 *
 * A VM's disks do not all live on one datastore — a system disk on flash and a
 * database on bulk storage is the ordinary case — so a restore to a new
 * location has to be told where each SOURCE datastore goes, and how much space
 * that takes on each target. Both figures are here because which one applies
 * depends on the disk: a thin disk needs only what the backup actually holds,
 * a thick one needs its whole provisioned size (`_restore_disk_target_is_thin`
 * in abr-core).
 */
export interface RestoreSourceDisk {
  id: string;
  label: string;
  /** Provisioned size. Null when the point never recorded it. */
  capacityBytes: number | null;
  /** What the backup holds — only known for a point that holds the whole disk. */
  usedBytes: number | null;
  /** The source disk type ("vmfs_thin", …), which decides which of the two
   *  figures above a restore of it needs. */
  provisioning: string | null;
  /** The datastore the disk lived on, from its "[datastore] folder/disk.vmdk"
   *  path. Null when the point recorded no path for it. */
  sourceDatastore: string | null;
}

/** Where one of the source VM's datastores is restored to. `targetDatastoreId`
 *  is a target datastore's id, never its name. */
export interface RestoreDatastoreMapping {
  sourceDatastore: string;
  targetDatastoreId: string;
}

/**
 * Placement choices for a new-location restore, resolved against the actual
 * source VM and the candidate target environments — not free text. Fetched
 * per restore point (the source VM's networks live on its manifest, not the
 * live inventory, so they must come from the point being restored).
 */
export interface RestorePlacementOptions {
  /** The source VM's real network adapters, one entry per NIC. */
  sourceNics: RestoreSourceNic[];
  /** The source VM's disks, in the order the restore point lists them. */
  sourceDisks: RestoreSourceDisk[];
  datastores: RestoreDatastoreOption[];
  networks: RestoreNetworkOption[];
  /** VMs already registered in a candidate target environment, for a
   *  best-effort client-side name-uniqueness check. */
  existingVms: RestoreExistingVmOption[];
  /** The datastore the source VM lived on before backup. Only a starting
   *  point for "Automatic" — it means nothing on a target host that doesn't
   *  mount it, so never show it as the resolved value without checking. */
  originalDatastore: string | null;
  /** The host the source VM lived on before backup — see `originalDatastore`
   *  for the same caveat about a different target environment. */
  originalHost: string | null;
  /** Host id the appliance itself resolves "Automatic" to, and the datastore
   *  id it pairs with that host (`defaults.target_host_id` /
   *  `target_datastore_id`). Computed for the restore point's own environment
   *  only, so they don't apply once a different target is chosen. */
  defaultHostId: string | null;
  defaultDatastoreId: string | null;
  /** Environment the two defaults above were resolved against. */
  defaultEnvironmentId: string | null;
  /** The appliance's own starting mapping — every source datastore paired with
   *  the default target (`defaults.datastore_mappings`). Like the two defaults
   *  above it is resolved for the restore point's own environment only. */
  defaultDatastoreMappings: RestoreDatastoreMapping[];
}

export type RepositoryType =
  | "hardened-immutable"
  | "object-lock-s3"
  | "local"
  | "nfs";

export interface Repository {
  id: string;
  name: string;
  type: RepositoryType;
  path: string;
  capacityGB: number;
  usedGB: number;
  dedupRatio: number;
  status: "healthy" | "warning" | "offline";
  /** Recent daily usage in GB, oldest→newest, for the trend sparkline. */
  usageTrend: number[];

  /* ---- Advanced storage management (optional; live mode may omit) ---- */
  /** Repository is in maintenance — reads only, jobs paused. */
  maintenanceMode?: boolean;
  /** Sealed read-only (e.g. being decommissioned). */
  readOnly?: boolean;
  /** Last integrity scan / health check timestamp (ISO), null if never run. */
  lastScanAt?: string | null;
  /** Result of the last integrity scan. */
  integrityStatus?: "verified" | "scanning" | "issues" | "never";
  /** On-disk fragmentation, 0–100. */
  fragmentationPct?: number;
  /** Write throttle in MB/s; 0/undefined = unthrottled. */
  ioThrottleMBps?: number;
  /** Max concurrent tasks writing to this repository. */
  maxConcurrentTasks?: number;
  /** Underlying RAID level for local/hardened repos, e.g. "RAID-6". */
  raidLevel?: string;
  /** Backing drive model / media descriptor. */
  driveModel?: string;
  /** Per-repo default compression for new points. */
  compression?: "none" | "optimal" | "high";
  /** Physical bytes (GB) deleted but not yet reclaimed by GC. */
  pendingGcGB?: number;
  /** Object Lock as the appliance reports it back. Null for a repository whose
   *  backend has no such concept; mode "none" for one that could but doesn't. */
  immutability?: RepositoryImmutability | null;
  /** Whether this repository's backend can lock backups at all
   *  (`capabilities.supports_immutability` — object storage only today). */
  supportsImmutability?: boolean;
  /** Whether this repository's backend can merge a backup chain into a
   *  synthetic full (`capabilities.supports_synthetic_full`). The appliance
   *  decides it — a repository's `metadata.supports_synthetic_full` when set,
   *  otherwise whether it is an AltaStor-native local/S3 repository — and
   *  refuses a synthetic full against anything else with a 422, so this is the
   *  authority for which repositories the dialog may offer. Undefined for a
   *  world that doesn't report it (the demo simulation). */
  supportsSyntheticFull?: boolean;
  /** Local repositories only: the SMB share Hyper-V hosts reach its folder by
   *  (abr-vhdx-tool writes Hyper-V backups there from the host). Null when it
   *  has none, which leaves the repository to VMware jobs. */
  share?: RepositoryShare | null;
}

/** A local repository's folder as Windows sees it: \\server\share, where
 *  `share` may go on into a folder of the share. */
export interface RepositoryShare {
  server: string;
  share: string;
  /** The account the hosts open it with; null leaves it to the account the
   *  Hyper-V inventory signs in with. */
  username: string | null;
}

/** A share as it is written: the password only travels this way, and an
 *  empty one on an edit keeps the stored one. */
export interface RepositoryShareInput extends RepositoryShare {
  password?: string;
}

/**
 * S3 Object Lock retention modes the appliance accepts (`IMMUTABILITY_MODES`
 * on the orchestrator).
 *
 * - "governance" — a principal holding `s3:BypassGovernanceRetention` can lift
 *   a lock early. The usual choice: ransomware-proof against a compromised
 *   backup account, still recoverable by a deliberate admin.
 * - "compliance" — nobody, including the account root, can shorten or remove a
 *   lock before it expires. Storage is paid for until then, whatever happens.
 */
export type ImmutabilityMode = "none" | "governance" | "compliance";

/** Object Lock settings on an S3 repository. */
export interface RepositoryImmutability {
  mode: ImmutabilityMode;
  /** Days a written backup stays locked. Always 0 when mode is "none", and at
   *  least 1 otherwise — the appliance rejects any other pairing. */
  retentionDays: number;
}

/** The orchestrator's ceiling on a lock (MAX_IMMUTABILITY_RETENTION_DAYS). */
export const MAX_IMMUTABILITY_RETENTION_DAYS = 36500;

/** S3 connection settings for an object-storage repository. Required when a
 *  repository is created with type "object-lock-s3". */
export interface S3RepositoryConfig {
  bucket: string;
  prefix?: string;
  region?: string;
  endpointUrl?: string;
  accessKey?: string;
  secretKey?: string;
  profile?: string;
  /** Path-style addressing (host/bucket) instead of virtual-hosted. Defaults
   *  to true when a custom endpoint is set (MinIO/Ceph/Wasabi). */
  pathStyle?: boolean;
  /** Verify the endpoint's TLS certificate. Defaults to true. */
  verifyTls?: boolean;
  /** Object Lock retention applied to every backup written here. Omitted or
   *  mode "none" leaves backups deletable. */
  immutability?: RepositoryImmutability;
}

/** Payload for creating a repository (POST /repositories). */
export interface CreateRepositoryInput {
  name: string;
  type: RepositoryType;
  path: string;
  capacityGB: number;
  /** Present only when type is "object-lock-s3". */
  s3?: S3RepositoryConfig;
  /** Local repositories only: the share Hyper-V hosts write through. */
  share?: RepositoryShareInput;
}

/** One probe run by the appliance's real S3 connectivity test. */
export interface S3ConnectionCheck {
  name: string;
  status: "ok" | "failed" | "skipped";
  message?: string;
}

/** Result of testing S3 credentials/connectivity before a repository exists —
 *  a real round trip through the appliance's native storage tool, not a
 *  client-side format check. */
export interface S3ConnectionTestResult {
  ok: boolean;
  message: string;
  checks: S3ConnectionCheck[];
}

/**
 * What a repository's Object Lock configuration does to the data in it — the
 * appliance's own `immutability_effect` block, returned by repository create,
 * patch and `POST /repositories/{id}/verify-immutability`.
 *
 * The split matters: `effect` describes what happens to backups written FROM
 * NOW ON, `limitations` what the configuration cannot reach — above all the
 * restore points already stored, which keep whatever retention they were
 * written with until `applyRepositoryImmutability` puts them under the current
 * one. `warnings` are mismatches against the jobs that write here (a lock
 * shorter than a job's retention leaves a window where its backups are still
 * needed but deletable; a lock longer than it holds storage the job wanted
 * freed).
 */
export interface ImmutabilityEffect {
  previous: RepositoryImmutability;
  current: RepositoryImmutability;
  /** Whether this report describes a change, or just restates the setting. */
  changed: boolean;
  /** Restore points already in the repository when the change was made. */
  existingRestorePoints: number;
  /** Whether those points are covered by `current`. Always false until
   *  `applyRepositoryImmutability` has been run against them. */
  existingDataProtected: boolean;
  effect: string[];
  limitations: string[];
  warnings: string[];
}

/** Result of validating a repository that already exists — `POST
 *  /repositories/{id}/verify` (the whole repository) or `.../verify-immutability`
 *  (its Object Lock configuration, with the effect report attached). */
export interface RepositoryValidationResult {
  ok: boolean;
  message: string;
  checks: S3ConnectionCheck[];
  /** Only from the immutability endpoint. */
  immutabilityEffect?: ImmutabilityEffect | null;
}

/** Result of `POST /repositories/{id}/apply-immutability`: putting the backups
 *  ALREADY stored in a repository under its current Object Lock setting. */
export interface ApplyImmutabilityResult {
  ok: boolean;
  message: string;
  immutability: RepositoryImmutability;
  restorePointCount: number;
  updatedRestorePoints: number;
  failedRestorePoints: number;
  /** The lock periods actually written. A point's lock covers the repository's
   *  configured period plus its job's full-backup cycle, so a repository with
   *  several jobs writing to it yields several figures. */
  actualRetentionDays: number[];
}

/* ------------------------------------------------------------------ */
/* Async VM replication                                                 */
/* ------------------------------------------------------------------ */

/**
 * Where a replication job maintains its replica. Unlike a backup (which writes
 * restore points to a repository), replication keeps a ready-to-run copy of the
 * VM on a target host.
 */
export interface ReplicaTarget {
  environmentId: string;
  hostId?: string;
  /** Prefix for the replica VM name, e.g. "replica-". */
  namePrefix: string;
}

export type ReplicaState =
  | "seeding" // initial full copy in progress
  | "ready" // in sync, powered off, waiting to fail over
  | "syncing" // an incremental sync is running
  | "failover" // powered on and serving (DR active)
  | "failback" // returning control to the source
  | "error";

export interface ReplicaPoint {
  id: string;
  createdAt: string;
  type: RestorePointType;
}

/** A ready-to-run replica of a source VM, maintained on a target host. */
export interface Replica {
  id: string;
  jobId: string;
  jobName: string;
  sourceVmId: string;
  sourceVmName: string;
  guestOs: string;
  osFamily: OsFamily;
  sourcePlatform: Hypervisor;
  targetEnvironmentId: string;
  targetEnvironmentName: string;
  targetHostId: string | null;
  targetHostName: string | null;
  targetPlatform: Hypervisor;
  replicaName: string;
  state: ReplicaState;
  /** ISO of the last successful sync, or null while seeding. */
  lastSyncAt: string | null;
  /** Recovery points kept on the replica, newest last. */
  points: ReplicaPoint[];
  /** The recovery point the replica is running from after a failover. */
  activePointId: string | null;
  sizeGB: number;
  createdAt: string;
  /** True while the replica VM is powered on (during failover). */
  poweredOn: boolean;
}

export type AlertSeverity = "info" | "success" | "warning" | "critical";
export type AlertCategory = "job" | "threat" | "system" | "capacity";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  entityType?: "vm" | "job" | "repository" | "session";
  entityId?: string;
}

export type ThreatType =
  | "change-rate"
  | "encryption-pattern"
  | "mass-deletion"
  | "new-extension"
  | "honeypot";

export type ThreatStatus = "active" | "investigating" | "contained" | "dismissed";

export interface Threat {
  id: string;
  type: ThreatType;
  severity: "low" | "medium" | "high";
  status: ThreatStatus;
  vmId: string;
  vmName: string;
  detectedAt: string;
  title: string;
  description: string;
  /** e.g. "+412% change rate" — short metric chip. */
  metric: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "success";

export interface LogLine {
  id: string;
  ts: string;
  level: LogLevel;
  message: string;
  vmName?: string;
  /** The orchestrator component that emitted the line (e.g. "engine",
   *  "session", "copy") — see `_append_task_log` on the backend. */
  component?: string;
}

export interface ActivityPoint {
  /** ISO date (day granularity). */
  date: string;
  success: number;
  warning: number;
  failed: number;
}

export interface DashboardSummary {
  totalVms: number;
  protectedVms: number;
  warningVms: number;
  unprotectedVms: number;
  /** % of VMs protected. */
  protectionCoverage: number;
  /** Success rate across last-24h sessions. Null when no sessions ran in the window — not vacuously 100%. */
  successRate24h: number | null;
  sessions24h: number;
  failed24h: number;
  totalRestorePoints: number;
  /** Aggregate repo capacity. */
  capacityGB: number;
  usedGB: number;
  activeThreats: number;
  dataProtectedGB: number;
  activityTimeline: ActivityPoint[];
}

/* ------------------------------------------------------------------ */
/* Appliance settings (server-backed in live mode, localStorage in sim) */
/* ------------------------------------------------------------------ */

export type Density = "comfortable" | "compact";
export type MailEncryption = "none" | "starttls" | "ssl";
export type WebhookKind = "slack" | "teams" | "discord" | "generic";
export type UpdateChannel = "stable" | "beta";
export type UserRole = "admin" | "operator" | "viewer";
export type UserStatus = "active" | "invited" | "disabled";
export type Compression = "none" | "optimal" | "high";

export interface GeneralSettings {
  applianceName: string;
  hostname: string;
  organization: string;
  contactEmail: string;
  timezone: string;
  timeFormat: "12h" | "24h";
  dateFormat: "iso" | "us" | "eu";
}

/** Console UI languages. The single source of truth for the set of codes is
 *  `src/i18n/languages.ts`; this mirrors it for typing. */
export type Language = "en" | "de" | "fr" | "es";

/** Browser-local presentation prefs — never sent to the appliance. */
export interface AppearanceSettings {
  density: Density;
  reduceMotion: boolean;
  accent: AccentKey;
  sidebarAutoCollapse: boolean;
  language: Language;
}

export interface EmailSettings {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  encryption: MailEncryption;
  username: string;
  fromAddress: string;
  recipients: string[];
}

export interface Webhook {
  id: string;
  name: string;
  kind: WebhookKind;
  url: string;
  enabled: boolean;
}

export interface NotificationEvents {
  jobFailure: boolean;
  jobSuccess: boolean;
  capacityWarning: boolean;
  restoreCompleted: boolean;
}

export interface NotificationSettings {
  email: EmailSettings;
  webhooks: Webhook[];
  events: NotificationEvents;
}

export interface SecuritySettings {
  mfaRequired: boolean;
  /** How long a web console sign-in stays active, in seconds. Sent as
   *  `duration_seconds` to `POST /auth/login` (bounded by the appliance's
   *  `web_session_ttl_min/max_seconds()`, 300–7200). */
  sessionDurationSec: number;
  passwordMinLength: number;
  auditRetentionDays: number;
  autoLockThreatResponse: boolean;
}

export interface StorageDefaults {
  compression: Compression;
  dedup: boolean;
  gcSchedule: "hourly" | "daily" | "weekly";
  capacityWarnPct: number;
  capacityCriticalPct: number;
  archiveTierEnabled: boolean;
  archiveAfterDays: number;
  globalThrottleMBps: number;
}

export interface NetworkSettings {
  ipMode: "dhcp" | "static";
  address: string;
  gateway: string;
  dns: string[];
  ntpServers: string[];
  proxyUrl: string;
  managementPort: number;
}

export interface UpdateSettings {
  channel: UpdateChannel;
  autoCheck: boolean;
  autoInstall: boolean;
  maintenanceWindow: string; // "HH:mm-HH:mm"
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  mfaEnabled: boolean;
  lastActiveAt: string | null;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: "read-only" | "full-access";
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AppSettings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  notifications: NotificationSettings;
  security: SecuritySettings;
  storageDefaults: StorageDefaults;
  network: NetworkSettings;
  updates: UpdateSettings;
  users: UserAccount[];
  apiTokens: ApiToken[];
}

/**
 * The appliance-persisted subset of settings — everything except `appearance`,
 * which is a per-browser presentation preference. GET/PUT /settings round-trips
 * this shape; the client keeps `appearance` local and merges the rest.
 */
export type ApplianceSettings = Omit<AppSettings, "appearance">;

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export type AuditCategory =
  | "auth"
  | "job"
  | "repository"
  | "restore"
  | "settings"
  | "user"
  | "storage"
  | "system";

export type AuditSeverity = "info" | "notice" | "warning" | "critical";

export interface AuditActor {
  name: string;
  email: string;
  role: UserRole;
}

export interface AuditEvent {
  id: string;
  ts: string;
  actor: AuditActor;
  action: string;
  category: AuditCategory;
  target?: string;
  detail: string;
  severity: AuditSeverity;
  ip: string;
}

/* ------------------------------------------------------------------ */
/* Metrics history (Reports time-series)                               */
/* ------------------------------------------------------------------ */

/** One daily snapshot of estate-wide metrics, appended by the appliance. */
export interface MetricSnapshot {
  /** ISO date (day granularity). */
  date: string;
  usedGB: number;
  capacityGB: number;
  logicalGB: number;
  storedGB: number;
  success: number;
  warning: number;
  failed: number;
  throughputMBps: number;
}
