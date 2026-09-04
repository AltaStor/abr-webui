// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * AltaStor — domain model.
 * Every entity in the mock world is typed here; nothing in the app uses `any`.
 */

export type Hypervisor = "vmware" | "proxmox" | "hyperv";

export type EnvironmentType = "vcenter" | "esxi-standalone" | "proxmox" | "hyperv";

export interface Environment {
  id: string;
  name: string;
  type: EnvironmentType;
  hypervisor: Hypervisor;
  version: string;
  endpoint: string;
  port?: number;
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
export type OsFamily = "windows" | "linux" | "unknown";

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

export interface Retention {
  /** Days of short-term backups to keep before they age out (sent to the API as `retention_days`). */
  keepDays: number;
  gfs?: {
    weekly: number;
    monthly: number;
    yearly: number;
  };
}

export interface JobOptions {
  appAware: boolean;
  encryption: boolean;
  /** Zstd level 0 (fastest, no compression) – 9 (smallest, most CPU). Default 3. */
  compression: number;
  dedup: boolean;
  /** Backup window, "HH:mm-HH:mm" or undefined for anytime. */
  window?: string;
  throttleMBps?: number;
}

export type JobType = "backup" | "replication" | "backup-copy";
/** A session's run kind — everything a job can be, plus "restore" (restores have no job). */
export type SessionType = JobType | "restore";
export type JobRunState = "idle" | "running" | "disabled";

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
  retention: Retention;
  options: JobOptions;
  state: JobRunState;
  /** Last session status, for the list pill. */
  lastStatus: SessionStatus | null;
  lastRunAt: string | null;
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
  startedAt: string;
  finishedAt: string | null;
  durationSec: number;
  /** 0–100. */
  progress: number;
  processedGB: number;
  transferredGB: number;
  throughputMBps: number;
  vmCount: number;
  vmResults: VmRunResult[];
  /** Set for warning/failed. */
  message?: string;
  /**
   * Live stage caption for a *running* session (e.g. "Backing up disk 2/3:
   * 61%", "Storing changed blocks for disk 1/2: 40%") — the same text the CLI's
   * `--watch`/`--wait` prints, straight from the orchestrator's per-disk
   * progress reporting. Real backend only; the demo simulation never sets it.
   */
  stageMessage?: string;
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
  sizeGB: number;
  repositoryId: string;
  /** Zstd level 0–9 this point was written with, or null when unknown (older
   *  catalog entries predate the field). */
  compressionLevel: number | null;
  encrypted: boolean;
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
 * Placement choices for a new-location restore, resolved against the actual
 * source VM and the candidate target environments — not free text. Fetched
 * per restore point (the source VM's networks live on its manifest, not the
 * live inventory, so they must come from the point being restored).
 */
export interface RestorePlacementOptions {
  /** The source VM's real network adapters, one entry per NIC. */
  sourceNics: RestoreSourceNic[];
  datastores: RestoreDatastoreOption[];
  networks: RestoreNetworkOption[];
  /** VMs already registered in a candidate target environment, for a
   *  best-effort client-side name-uniqueness check. */
  existingVms: RestoreExistingVmOption[];
  /** The datastore the source VM lived on before backup — what "Automatic"
   *  resolves to when no target datastore is picked. */
  originalDatastore: string | null;
  /** The host the source VM lived on before backup — what "Automatic"
   *  resolves to when no target host is picked. */
  originalHost: string | null;
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
}

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
}

/** Payload for creating a repository (POST /repositories). */
export interface CreateRepositoryInput {
  name: string;
  type: RepositoryType;
  path: string;
  capacityGB: number;
  /** Present only when type is "object-lock-s3". */
  s3?: S3RepositoryConfig;
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
