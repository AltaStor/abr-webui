// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Real-backend client for the AltaStor console — wired to the Python FastAPI
 * orchestrator (the "v4.1" API under /api/v1/*).
 *
 * This is the single adapter seam between the console's domain model (@/types)
 * and the orchestrator's JSON. Every page reads from the zustand world store,
 * which the live driver (world.live.ts) hydrates purely through the functions
 * below — so wiring the whole console to VMware backup/restore is done here,
 * with no page changes.
 *
 * What is REAL (backed end-to-end for vSphere): environments/inventories, the
 * VM tree, backup jobs (CRUD + run + stop), sessions (poll + log + stop),
 * repositories (list/create/rescan/delete), restore points, and full-VM
 * out-of-place restore.
 *
 * What is a graceful STUB (no orchestrator support yet — surfaced in the UI as
 * "Work in progress"): replication, threats/ransomware, the world store's audit
 * event feed (the Logs page reads the real audit log with `listAuditRecords`),
 * metrics history, appliance settings, first-boot provisioning, and the
 * Hyper-V agent lifecycle. These keep their export signatures so the
 * WIP-gated pages still compile and render empty.
 *
 * Transport: same-origin `/api/v1/*` (the Vite dev server proxies to :443).
 * There is NO server-sent-event stream on this backend, so `subscribeEvents`
 * is a polling loop (see the bottom of the file).
 */
import { fileStamp } from "@/lib/download";
import { deleteRunName, restoreRunName, verifyRunName } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type {
  Alert,
  ApplianceSettings,
  ApplyImmutabilityResult,
  AuditEvent,
  BackupConsistency,
  BackupJob,
  CreateEnvironmentInput,
  CreateRepositoryInput,
  DashboardSummary,
  Environment,
  EnvironmentType,
  FullBackupSchedule,
  Host,
  Hypervisor,
  HyperVVmDetails,
  ImmutabilityEffect,
  ImmutabilityMode,
  JobLastRun,
  JobOptions,
  JobRunResult,
  JobType,
  LogLevel,
  LogLine,
  MetricSnapshot,
  OsFamily,
  PowerState,
  Replica,
  ReplicaTarget,
  Repository,
  RepositoryImmutability,
  RepositoryShareInput,
  RepositoryType,
  RepositoryValidationResult,
  RestorePlacementOptions,
  RestorePoint,
  RetentionRunResult,
  SystemClockStatus,
  Retention,
  S3ConnectionCheck,
  S3ConnectionTestResult,
  S3RepositoryConfig,
  Schedule,
  Session,
  SessionStatus,
  Threat,
  VM,
  WinrmProtocol,
} from "@/types";

/** Same-origin by default so the Vite `/api` proxy reaches the orchestrator. */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/**
 * The orchestrator's real error body is `{ error: { code, message, details? } }`
 * (see `api_errors.py::ApiError.to_payload`); some frontend-synthesized
 * `ApiError`s in this file instead use the shorthand `{ error: "message" }`.
 * Handles both. Returns null for anything else so callers can fall back to a
 * generic message.
 */
function apiErrorMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: unknown } | null;
  const e = body?.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return null;
}

/**
 * True for a major-version mismatch between this console build and the
 * appliance it's talking to (see `checkApiVersion` below and the matching
 * `api_version_incompatible` rejection in `api_version_middleware` server-side).
 * Callers use this instead of `ApiError.status` — that status is whichever
 * response happened to carry the version header first (often an unrelated
 * 401 during an unauthenticated boot hydrate), so it can't be trusted to
 * tell a version mismatch apart from a plain auth failure.
 */
function isVersionMismatchError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  const body = err.body as { error?: { code?: unknown } } | null;
  return body?.error?.code === "api_version_incompatible";
}

/** The orchestrator's structured error `code` (e.g. "target_vm_exists"), so
 *  callers can react to a specific failure instead of only its message text. */
function apiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: unknown } | null;
  const e = body?.error;
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return null;
}

/* --------------------------- auth: session token -------------------------- */
let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Set by the auth store on sign-in/out — every request below attaches it. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * Whether a console session token is currently held.
 *
 * Every endpoint but `/auth/*` is behind `require_session` server-side, so
 * without one there is nothing worth asking for: callers that would otherwise
 * fetch on a timer check this first rather than issue requests the appliance is
 * certain to answer 401. It is not a claim that the token is still VALID — only
 * a request can settle that, and `setUnauthorizedHandler` clears it when one
 * comes back 401.
 */
export function hasAuthSession(): boolean {
  return authToken !== null;
}

/**
 * Registered once by the auth store. The request layer has no router access,
 * so a 401 on an authenticated call (session expired/revoked server-side)
 * reports through this single hook instead — the store decides what a
 * sign-out means for the rest of the app.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

const API_VERSION_HEADER = "x-abr-api-version";
let apiVersionChecked = false;

function checkApiVersion(res: Response): void {
  if (apiVersionChecked) return;
  const serverHeader = res.headers.get(API_VERSION_HEADER);
  if (!serverHeader) return;
  apiVersionChecked = true;
  const [serverMajorStr, serverMinorStr] = serverHeader.split(".");
  const serverMajor = Number(serverMajorStr);
  const serverMinor = Number(serverMinorStr);
  if (!Number.isFinite(serverMajor) || !Number.isFinite(serverMinor)) return;
  if (serverMajor !== __ABR_API_MAJOR__) {
    throw new ApiError(res.status, {
      error: {
        code: "api_version_incompatible",
        message:
          `Incompatible API version: server speaks ${serverMajor}.${serverMinor}, ` +
          `console speaks ${__ABR_API_MAJOR__}.${__ABR_API_MINOR__}. Major versions must match ` +
          "— reload after the deployment finishes, or contact your administrator.",
      },
    });
  }
  if (serverMinor !== __ABR_API_MINOR__) {
    if (serverMinor > __ABR_API_MINOR__) {
      console.warn(
        `[AltaStor] Server API is newer (${serverMajor}.${serverMinor}) than this console build ` +
          `(${__ABR_API_MAJOR__}.${__ABR_API_MINOR__}) — reload to pick up the latest console assets.`,
      );
    } else {
      console.warn(
        `[AltaStor] Server API is older (${serverMajor}.${serverMinor}) than this console build ` +
          `(${__ABR_API_MAJOR__}.${__ABR_API_MINOR__}) — the server needs an upgrade.`,
      );
    }
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-client-type": "web",
    [API_VERSION_HEADER]: `${__ABR_API_MAJOR__}.${__ABR_API_MINOR__}`,
  };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  // Every read the console makes is a page load the live driver repeats on a
  // timer, not a command, so the appliance's audit log leaves it out (a read
  // the role does not allow is still logged as denied). Actions are audited.
  if ((init?.method ?? "GET").toUpperCase() === "GET") headers["x-abr-refresh"] = "1";
  const res = await fetch(`${BASE}/api/v1${path}`, { ...init, headers });
  checkApiVersion(res);
  if (res.status === 401 && authToken) {
    // A previously-valid session no longer is (expired or revoked elsewhere) —
    // drop it now so nothing keeps acting on the app's behalf as it.
    authToken = null;
    unauthorizedHandler?.();
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Unwrap the orchestrator's `{items:[...]}` / `{nodes:[...]}` list envelopes. */
async function collection<T>(path: string, key: "items" | "nodes" = "items"): Promise<T[]> {
  const raw = await request<Record<string, unknown> | T[]>(path);
  if (Array.isArray(raw)) return raw as T[];
  const inner = (raw as Record<string, unknown>)[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/* ====================================================================== */
/* Small shared coercers + enum mappers                                    */
/* ====================================================================== */

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const GB = 1_000_000_000;
/** Matches the appliance's DEFAULT_COMPRESSION_LEVEL (vcenter_backup.py). */
const DEFAULT_COMPRESSION_LEVEL = 3;

/** Deterministic accent so a job keeps the same colour across reloads. */
const ACCENTS = ["cyan", "blue", "emerald", "violet", "amber"] as const;
function accentFor(id: string): (typeof ACCENTS)[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function osFamilyOf(guest: string): OsFamily {
  const g = guest.toLowerCase();
  // macOS first: vSphere reports it as "darwin*Guest", and "darwin" would not
  // match the others, but "Mac OS X Server" contains no windows/linux token
  // either — checking it up front keeps both spellings off "unknown".
  if (/darwin|mac ?os|macintosh|osx/.test(g)) return "macos";
  if (/win|microsoft/.test(g)) return "windows";
  if (/linux|ubuntu|debian|centos|rhel|red hat|suse|fedora|oracle|rocky|alma|photon|coreos/.test(g))
    return "linux";
  return "unknown";
}

function powerStateOf(v: string): PowerState {
  const p = v.toLowerCase();
  if (/on|running|poweredon/.test(p)) return "running";
  if (/susp/.test(p)) return "suspended";
  return "stopped";
}

/** Orchestrator inventory `type` → console EnvironmentType / Hypervisor. */
function envTypeOf(t: string): { type: EnvironmentType; hypervisor: Hypervisor } {
  switch (t) {
    case "vsphere":
      return { type: "vcenter", hypervisor: "vmware" };
    case "hyper-v":
      return { type: "hyperv", hypervisor: "hyperv" };
    case "proxmox-ve":
      return { type: "proxmox", hypervisor: "proxmox" };
    default:
      return { type: "vcenter", hypervisor: "vmware" };
  }
}

function repoTypeOf(t: string): RepositoryType {
  switch (t) {
    case "s3":
      return "object-lock-s3";
    case "nfs":
      return "nfs";
    case "smb":
      return "smb";
    default:
      return "local";
  }
}

function sessionStatusOf(state: string, hasErrors: boolean): SessionStatus {
  switch (state) {
    case "queued":
      return "queued";
    case "running":
    case "stopping":
      return "running";
    case "completed":
      return hasErrors ? "warning" : "success";
    case "failed":
    case "stopped":
    case "canceled":
    case "cancelled":
      return "failed";
    default:
      return "queued";
  }
}

function durationSecOf(startedAt: string, finishedAt: string | null): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : 0;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Make orchestrator error text legible in the console (esp. non-VMware runs). */
function friendlyError(msg: string): string {
  if (/unsupported hypervisor kind/i.test(msg)) {
    return "This hypervisor’s backup engine isn’t wired up yet — registration and discovery work, but runs don’t.";
  }
  return msg;
}

/* ====================================================================== */
/* Mappers: orchestrator record  →  domain entity                          */
/* ====================================================================== */

function mapEnvironment(inv: Dict): Environment {
  const { type, hypervisor } = envTypeOf(str(inv.type));
  const conn = asDict(inv.connection);
  const discovery = asDict(inv.discovery);
  return {
    id: str(inv.id),
    name: str(inv.name) || str(inv.address) || "Environment",
    type,
    hypervisor,
    version: str(inv.version) || (type === "vcenter" ? "vSphere" : ""),
    endpoint: str(inv.endpoint) || str(inv.address) || str(conn.endpoint) || str(conn.address),
    port: conn.port === undefined || conn.port === null ? undefined : num(conn.port),
    protocol: conn.protocol === "https" || conn.protocol === "http" ? conn.protocol : undefined,
    insecure: Boolean(conn.insecure),
    connected: str(inv.status) === "available",
    statusError: strOrNull(discovery.last_scan_error),
    hostCount: num(inv.host_count),
    vmCount: num(inv.vm_count),
  };
}

function mapSession(s: Dict): Session {
  const job = asDict(s.job);
  const errors = Array.isArray(s.errors) ? (s.errors as Dict[]) : [];
  const startedAt = str(s.started_at);
  const finishedAt = strOrNull(s.finished_at);
  const state = str(s.state);
  const status = sessionStatusOf(state, errors.length > 0);
  const resolvedBackupType = str(s.resolved_backup_type);
  const backupType = /inc/i.test(resolvedBackupType) ? "incremental" : "full";
  // A full that merged the stored chain instead of re-reading the VM. Only
  // meaningful on a full, and only the orchestrator knows which kind it
  // resolved to (see resolve_job_execution in abr_v41.py).
  const synthetic = /synthetic/i.test(resolvedBackupType);
  const vmId = str(s.vm_id);
  const isRestore = str(s.type) === "restore";
  // An integrity check over one stored chain. Like a restore it has no job
  // behind it, so it too has to name itself after the VM it acts on rather
  // than fall through to the "—" a missing job.name leaves.
  const isVerify = str(s.type) === "verify";
  // Removing a chain (or one segment of it) is a session too, and like a verify
  // it has no job behind it. Until the console knew the type it fell through to
  // "backup" and inherited the default "full" below, so a deletion was listed
  // as a full backup of a job named "—".
  const isDelete = str(s.type) === "delete";
  // The VM this run acts on, by name, straight from the orchestrator (see
  // _session_vm_names in abr_v41.py). For a restore that's the VM being
  // created; source_vm_name is where the point came from.
  const vmName = str(s.vm_name);
  const sourceVmName = str(s.source_vm_name);
  // Restore tasks have no job (job_id is null), so there is no job.name to
  // fall back to — name the run after the VM it restores instead of leaving
  // the placeholder, so the feed's RUN column identifies it at a glance.
  // world.live.ts still resolves a name from inventory when the orchestrator
  // couldn't supply one (older sessions predating the vm_name field).
  const jobName = isRestore
    ? restoreRunName(vmName || sourceVmName)
    : isVerify
      ? verifyRunName(vmName)
      : isDelete
        ? deleteRunName(vmName)
        : str(job.name) || "—";
  const message = errors.length ? friendlyError(str(errors[0].message)) : undefined;
  // The orchestrator's `message` field carries the live per-disk stage caption
  // while a session is running (see _emit_progress in vcenter_backup.py /
  // vcenter_restore.py — the same text the CLI's --watch prints) and the
  // terminal error text once it isn't — `message` above already covers the
  // latter, so only pull this while still running.
  const stageMessage = status === "running" ? strOrNull(s.message) ?? undefined : undefined;
  // Folded into "running" by sessionStatusOf (it IS still running), so the
  // distinction has to travel on its own field or the console can't tell a run
  // that has been asked to stop from one that hasn't.
  const stopping = state === "stopping";
  const progress = num(s.progress);
  const resultStatus =
    status === "success" || status === "warning" || status === "failed" || status === "running"
      ? status
      : "pending";
  return {
    id: str(s.id),
    jobId: str(job.id),
    jobName,
    type: isRestore ? "restore" : isVerify ? "verify" : isDelete ? "delete" : "backup",
    status,
    backupType,
    synthetic,
    startedAt,
    finishedAt,
    durationSec: durationSecOf(startedAt, finishedAt),
    progress,
    // Best-effort — the orchestrator only reports these for real vCenter
    // backups (see run_vcenter_backup's processed_bytes/transferred_bytes);
    // restores and non-vCenter engines have no byte telemetry and stay 0,
    // which the UI renders as "—" rather than a false "0 B".
    processedGB: num(s.processed_bytes) / GB,
    transferredGB: num(s.transferred_bytes) / GB,
    // The orchestrator has no rate field, only cumulative bytes — a single
    // session record can't derive a rate on its own. world.live.ts fills
    // this in by diffing transferredGB across consecutive samples.
    throughputMBps: 0,
    vmCount: 1,
    vmResults: vmId
      ? [
          {
            vmId,
            // The real VM name — NOT jobName, which named the *job* here and
            // made the per-VM breakdown read "nightly-backup" instead of the
            // machine it backed up. Sessions predating the orchestrator's
            // vm_name field carry neither name; they fall back to the raw id,
            // which is opaque but honest, and which world.live.ts recognises
            // as "unnamed" and resolves against the hydrated inventory.
            vmName: vmName || sourceVmName || vmId,
            status: resultStatus,
            processedGB: num(s.processed_bytes) / GB,
            transferredGB: num(s.transferred_bytes) / GB,
            durationSec: durationSecOf(startedAt, finishedAt),
            message,
          },
        ]
      : [],
    message,
    consistency: consistencyOf(s.consistency),
    consistencyReason: strOrNull(s.consistency_reason),
    stageMessage,
    stopping,
    // Only the JobScheduler's own runs report "schedule" — Run now/Run full
    // backup, restores and backup-copy sessions are all "manual" (see
    // session_to_dto in abr_v41.py).
    triggeredBy: str(s.triggered_by) === "schedule" ? "schedule" : "manual",
  };
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function daysOfWeekOf(sched: Dict): number[] {
  if (Array.isArray(sched.weekdays)) return sched.weekdays as number[];
  if (Array.isArray(sched.days)) {
    return (sched.days as string[])
      .map((d) => DAY_NAMES.indexOf(String(d).toLowerCase()))
      .filter((i) => i >= 0);
  }
  return [1];
}

/** Orchestrator schedule DTO (`{type, time, days, interval_minutes, …}`). */
function mapSchedule(sched: Dict): Schedule {
  const kind = str(sched.type) || str(sched.kind);
  const time = str(sched.time) || str(sched.start_time) || "00:00";
  switch (kind) {
    case "weekly":
      return { frequency: "weekly", atTime: time, daysOfWeek: daysOfWeekOf(sched) };
    case "periodic": {
      const mins = num(sched.interval_minutes, 60);
      return { frequency: "hourly", everyHours: Math.max(1, Math.round(mins / 60)) };
    }
    case "monthly":
      return { frequency: "custom", atTime: time };
    case "cron":
      return { frequency: "custom", cron: str(sched.expression) };
    default:
      return { frequency: "daily", atTime: time };
  }
}

/**
 * An active/synthetic full schedule DTO (`_schedule_dto`), or null when the job
 * has none. Unlike the base schedule, every kind is kept as it is, so that a
 * periodic or cron schedule set from the CLI can be shown and sent back
 * unchanged.
 */
function mapFullSchedule(raw: unknown): FullBackupSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const sched = raw as Dict;
  const kind = str(sched.type) || str(sched.kind);
  const common = {
    // The appliance defaults a missing flag to on (`schedule.get("enabled", True)`).
    enabled: sched.enabled !== false,
    timezone: str(sched.timezone) || undefined,
  };
  const atTime = str(sched.time) || str(sched.start_time) || "00:00";
  switch (kind) {
    case "daily":
      return { ...common, frequency: "daily", atTime };
    case "weekly":
      return { ...common, frequency: "weekly", atTime, daysOfWeek: daysOfWeekOf(sched) };
    case "monthly":
      return { ...common, frequency: "monthly", atTime, dayOfMonth: num(sched.day_of_month, 1) };
    case "periodic":
      return { ...common, frequency: "periodic", everyMinutes: num(sched.interval_minutes, 60) };
    case "cron":
      return { ...common, frequency: "cron", cron: str(sched.expression) };
    default:
      return null;
  }
}

function consistencyOf(value: unknown): BackupConsistency | null {
  return value === "quiesced" || value === "crash_consistent" ? value : null;
}

function mapJobOptions(params: Dict, compressionLevel?: unknown, encryption?: Dict): JobOptions {
  const level = Math.round(num(compressionLevel, DEFAULT_COMPRESSION_LEVEL));
  return {
    appAware: Boolean(params.app_aware ?? params.application_aware ?? params.quiesce),
    // The job DTO's own `encryption` block is what the appliance actually acts
    // on; task_parameters is the fallback for payloads that predate it. Note
    // the key is `encryption_enabled` there — reading a bare `encryption` off
    // task_parameters is what let a job report itself encrypted while its
    // restore points were written in the clear.
    encryption: Boolean(encryption?.enabled ?? params.encryption_enabled),
    compression: Math.min(9, Math.max(0, level)),
    dedup: params.dedup === undefined ? true : Boolean(params.dedup),
    guestConsistency:
      params.hyperv_consistency === "crash" || params.hyperv_consistency === "application"
        ? params.hyperv_consistency
        : undefined,
    onQuiesceFailure: params.on_quiesce_failure === "crash_consistent" ? "crash_consistent" : "fail",
  };
}

function mapRetention(job: Dict): Retention {
  const gfs = asDict(job.gfs);
  const keep = num(job.retention_days, 7);
  const out: Retention = { keepDays: keep, minFulls: num(job.retention_min_fulls, 0) };
  if (gfs.weekly || gfs.monthly || gfs.yearly) {
    out.gfs = {
      weekly: num(gfs.weekly),
      monthly: num(gfs.monthly),
      yearly: num(gfs.yearly),
      // The appliance defaults this to true (`_coerce_gfs_enabled`), and an
      // older record has no key at all — absent must not read as "suspended".
      enabled: gfs.enabled === undefined ? true : Boolean(gfs.enabled),
    };
  }
  return out;
}

/**
 * The three job fields derived from its run history: the last-12 outcome strip,
 * the success ratio, and the pill's last status.
 *
 * Split out of `mapJob` so a caller that already holds the session list can
 * attach these without `mapJob` refetching it — see `withJobRunStats`.
 */
const RUN_RESULTS: JobRunResult[] = ["success", "warning", "failed", "stopped", "running"];

function mapLastRun(raw: unknown): JobLastRun | null {
  const run = asDict(raw);
  const result = str(run.result) as JobRunResult;
  if (!str(run.id) || !RUN_RESULTS.includes(result)) return null;
  return {
    id: str(run.id),
    result,
    vmCount: num(run.vm_count),
    succeeded: num(run.succeeded),
    warning: num(run.warning),
    failed: num(run.failed),
    stopped: num(run.stopped),
    running: num(run.running),
    vms: (Array.isArray(run.vms) ? run.vms : []).map((item) => {
      const vm = asDict(item);
      const vmResult = str(vm.result) as JobRunResult;
      return {
        vmId: strOrNull(vm.vm_id),
        vmName: str(vm.vm_name) || str(vm.vm_id),
        result: RUN_RESULTS.includes(vmResult) ? vmResult : "running",
        sessionIds: Array.isArray(vm.session_ids) ? vm.session_ids.map((id) => str(id)) : [],
        message: str(vm.message) || undefined,
      };
    }),
  };
}

/** A stopped run is shown like a stopped session: failed. */
function runStatusOf(result: JobRunResult): SessionStatus {
  return result === "stopped" ? "failed" : result;
}

function jobRunStats(
  jobSessions: Session[],
  lastRun?: JobLastRun | null,
): Pick<BackupJob, "recentRuns" | "successRate" | "lastStatus"> {
  const mine = [...jobSessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const recentRuns = mine.slice(-12).map((s) => s.status);
  const finished = mine.filter((s) => s.status === "success" || s.status === "warning" || s.status === "failed");
  return {
    recentRuns,
    successRate: finished.length
      ? Math.round((finished.filter((s) => s.status === "success").length / finished.length) * 100)
      : 100,
    lastStatus: lastRun ? runStatusOf(lastRun.result) : mine.length ? mine[mine.length - 1].status : null,
  };
}

/**
 * Attach run history to already-mapped jobs.
 *
 * `listJobs` deliberately does NOT fetch sessions: hydrate pulls the session
 * list once for the store, and having `listJobs` pull it again meant every
 * poll fetched the whole session history twice. The live driver calls this
 * with the list it already has.
 */
export function withJobRunStats(jobs: BackupJob[], sessions: Session[]): BackupJob[] {
  const byJob = new Map<string, Session[]>();
  for (const session of sessions) {
    const bucket = byJob.get(session.jobId);
    if (bucket) bucket.push(session);
    else byJob.set(session.jobId, [session]);
  }
  return jobs.map((job) => ({ ...job, ...jobRunStats(byJob.get(job.id) ?? [], job.lastRun) }));
}

/** Build a job from its DTO, enriched with run history from `sessions` (may be
 *  empty — `withJobRunStats` can fill it in later). */
function mapJob(job: Dict, sessions: Session[]): BackupJob {
  const id = str(job.id);
  const repo = asDict(job.repository);
  const inventory = asDict(job.inventory);
  const jobType = str(job.job_type);
  const type: JobType = jobType === "backup-copy" ? "backup-copy" : "backup";
  const vmIds = Array.isArray(job.vm_ids) ? (job.vm_ids as string[]) : [];
  const vmCount = num(job.vm_count, vmIds.length);
  const activeCount = num(job.active_session_count);
  const enabled = job.enabled !== false && str(job.status) !== "disabled";

  const lastRun = mapLastRun(job.last_run);
  const { recentRuns, successRate, lastStatus } = jobRunStats(sessions.filter((s) => s.jobId === id), lastRun);

  const scopeSummary =
    (str(inventory.name) ? `${str(inventory.name)} · ` : "") +
    `${vmCount} VM${vmCount === 1 ? "" : "s"}`;

  return {
    id,
    name: str(job.name) || "Job",
    type,
    description: str(job.description) || undefined,
    vmIds,
    scopeSummary,
    repositoryId: str(repo.id),
    schedule: mapSchedule(asDict(job.schedule)),
    activeFullSchedule: mapFullSchedule(job.active_full_schedule),
    syntheticFullSchedule: mapFullSchedule(job.synthetic_full_schedule),
    // The appliance keeps these stamps while the job is disabled, but nothing
    // fires then, so they are hidden like `nextRunAt`.
    activeFullNextRunAt: enabled ? strOrNull(job.active_full_next_run_at) : null,
    syntheticFullNextRunAt: enabled ? strOrNull(job.synthetic_full_next_run_at) : null,
    retention: mapRetention(job),
    options: mapJobOptions(asDict(job.task_parameters ?? job.backup_options), job.compression_level, asDict(job.encryption)),
    state: activeCount > 0 ? "running" : enabled ? "idle" : "disabled",
    lastStatus,
    lastRun,
    lastRunAt: strOrNull(job.last_run_at),
    clockWarnings: (Array.isArray(job.clock_anomalies) ? job.clock_anomalies : [])
      .map((anomaly) => str(asDict(anomaly).message))
      .filter(Boolean),
    nextRunAt: enabled ? strOrNull(job.next_run_at) : null,
    createdAt: str(job.created_at) || new Date(0).toISOString(),
    successRate,
    recentRuns,
    accent: accentFor(id),
  };
}

function mapRepository(r: Dict): Repository {
  const storage = asDict(r.storage);
  const capacityGB = num(storage.capacity_bytes) / GB;
  const usedGB = num(storage.used_bytes) / GB;
  const status = str(r.status);
  return {
    id: str(r.id),
    name: str(r.name) || "Repository",
    type: repoTypeOf(str(r.type)),
    path: str(r.path) || str(r.address) || str(r.location),
    capacityGB,
    usedGB,
    dedupRatio: 1,
    status:
      status === "available" ? "healthy" : status === "unavailable" || status === "error" ? "offline" : "warning",
    usageTrend: [usedGB, usedGB],
    lastScanAt: strOrNull(r.last_scan_at),
    immutability: mapImmutability(r.immutability),
    supportsImmutability: Boolean(asDict(r.capabilities).supports_immutability),
    supportsSyntheticFull: Boolean(asDict(r.capabilities).supports_synthetic_full),
    share:
      str(r.type) === "smb" && str(r.server) && str(r.share)
        ? { server: str(r.server), share: str(r.share), username: strOrNull(r.username) }
        : null,
  };
}

function mapRestorePointFromChainPoint(chain: Dict, point: Dict): RestorePoint {
  const vm = asDict(chain.vm);
  const job = asDict(chain.job);
  const repo = asDict(chain.repository);
  const execType = str(point.execution_type);
  return {
    id: str(point.id),
    chainId: str(chain.id),
    vmId: str(point.vm_id) || str(vm.id),
    vmName: str(point.vm_name) || str(vm.name),
    jobId: str(job.id),
    jobName: str(job.name),
    createdAt: str(point.created_at),
    type: /inc/i.test(execType) ? "incremental" : "full",
    sizeGB: num(point.size_bytes) / GB,
    repositoryId: str(point.repository_id) || str(repo.id),
    logicalGB: point.logical_size_bytes == null ? null : num(point.logical_size_bytes) / GB,
    compressionRatio: point.compression_ratio == null ? null : num(point.compression_ratio),
    compressionLevel: point.compression_level == null ? null : num(point.compression_level),
    encrypted: typeof point.encryption_enabled === "boolean" ? point.encryption_enabled : null,
    consistency: consistencyOf(point.consistency),
    consistencyReason: strOrNull(point.consistency_reason),
    gfsProtected: Boolean(point.gfs_protected),
    // "SyntheticFull" is a full point (the /inc/ test above already types it
    // as one) that was merged from the chain rather than read off the VM.
    synthetic: /synthetic/i.test(execType),
  };
}

const LOG_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error", "success"]);

/** Anything the appliance can't name is "info" — a line with an unknown level
 *  is still a line, and dropping or reddening it would both be lies. */
function logLevelOf(level: string): LogLevel {
  return LOG_LEVELS.has(level) ? (level as LogLevel) : "info";
}

function mapLogLines(logs: unknown): LogLine[] {
  if (!Array.isArray(logs)) return [];
  return logs.map((raw, i) => {
    const l = asDict(raw);
    return {
      id: `${str(l.timestamp) || i}-${i}`,
      ts: str(l.timestamp) || new Date().toISOString(),
      level: logLevelOf(str(l.level)),
      message: str(l.message),
      vmName: str(l.vm_name) || undefined,
      component: str(l.component) || undefined,
    };
  });
}

/* ====================================================================== */
/* VM tree → VMs + Hosts                                                    */
/* ====================================================================== */

interface TreeNode extends Dict {
  kind?: string;
  children?: TreeNode[];
}

function walkTree(nodes: TreeNode[], visit: (n: TreeNode) => void): void {
  for (const n of nodes) {
    visit(n);
    if (Array.isArray(n.children)) walkTree(n.children, visit);
  }
}

/** Fetch the VM tree once and derive both hosts and VMs from it. */
async function fetchInventoryTree(): Promise<{ vms: VM[]; hosts: Host[] }> {
  const nodes = await collection<TreeNode>("/inventories/vms/tree", "nodes").catch(() => [] as TreeNode[]);
  const hosts: Host[] = [];
  const vms: VM[] = [];
  walkTree(nodes, (n) => {
    if (n.kind === "host") {
      const hs = str(n.host_status).toLowerCase();
      hosts.push({
        id: str(n.host_id) || str(n.id),
        environmentId: str(n.inventory_id),
        name: str(n.host_name) || str(n.label) || "host",
        cluster: str(n.cluster_name),
        status: hs.includes("maint") ? "maintenance" : hs.includes("disconn") ? "disconnected" : "online",
        cpuCores: num(n.cpu_count),
        memoryGB: Math.round(num(n.memory_mb) / 1024),
        vmCount: num(n.vm_count),
      });
    } else if (n.kind === "vm") {
      const guest = str(n.guest_os);
      vms.push({
        id: str(n.vm_id) || str(n.id),
        name: str(n.label) || str(n.vm_id) || "vm",
        environmentId: str(n.inventory_id),
        hostId: str(n.host_id),
        guestOs: guest || "Unknown",
        osFamily: osFamilyOf(guest),
        powerState: powerStateOf(str(n.power_state)),
        vcpus: num(n.cpu_count),
        memoryGB: Math.round(num(n.memory_mb) / 1024),
        // Sum of the VM's discovered disks; usedGB is filled in from real
        // restore-point sizes once backup coverage is overlaid (applyProtection).
        provisionedGB: num(n.disk_capacity_bytes) / GB,
        usedGB: 0,
        tags: [],
        protection: "unprotected",
        lastBackupAt: null,
        restorePointCount: 0,
        ipAddress: str(n.ip_address),
        hyperv: n.hyperv ? mapHyperVDetails(asDict(n.hyperv)) : undefined,
      });
    }
  });
  return { vms, hosts };
}

function mapHyperVDetails(d: Dict): HyperVVmDetails {
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(asDict) : []);
  return {
    generation: d.generation == null ? null : num(d.generation),
    configurationVersion: strOrNull(d.configuration_version),
    checkpointCount: num(d.checkpoint_count),
    clustered: Boolean(d.clustered),
    ownerNode: strOrNull(d.owner_node),
    disks: list(d.disks).map((disk) => ({
      name: str(disk.name),
      controller: strOrNull(disk.controller),
      path: strOrNull(disk.path),
      format: strOrNull(disk.format),
      type: strOrNull(disk.type),
      capacityGB: num(disk.capacity_bytes) / GB,
    })),
    networkAdapters: list(d.network_adapters).map((nic) => ({
      name: str(nic.name),
      // Discovery reports the switch even for an adapter that is switched off
      // from it; only a connected one is on that switch.
      switchName: nic.connected === false ? null : strOrNull(nic.switch),
      mac: strOrNull(nic.mac),
    })),
  };
}

/** Overlay restore-point coverage onto VMs so protection status is real. */
function applyProtection(vms: VM[], points: RestorePoint[]): VM[] {
  const byVm = new Map<string, RestorePoint[]>();
  for (const p of points) {
    const list = byVm.get(p.vmId) ?? [];
    list.push(p);
    byVm.set(p.vmId, list);
  }
  const DAY = 86_400_000;
  return vms.map((vm) => {
    const pts = byVm.get(vm.id);
    if (!pts || pts.length === 0) return vm;
    const latest = pts.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
    const fresh = Date.now() - new Date(latest.createdAt).getTime() < DAY;
    // A full restore point captures the VM's real data footprint — use the most
    // recent one as "used" so the size column isn't stuck at 0 in live mode.
    const latestFull = pts
      .filter((p) => p.type === "full")
      .reduce<RestorePoint | null>(
        (a, b) => (!a || new Date(b.createdAt) > new Date(a.createdAt) ? b : a),
        null,
      );
    return {
      ...vm,
      restorePointCount: pts.length,
      lastBackupAt: latest.createdAt,
      usedGB: (latestFull ?? latest).sizeGB,
      protection: fresh ? "protected" : "warning",
      protectionNote: fresh ? undefined : "Last backup is older than 24h",
    };
  });
}

/* ====================================================================== */
/* Auth — console sign-in (POST /auth/login, /auth/logout,                 */
/* /auth/change-password), added alongside the rest of the v4.1 API.       */
/* ====================================================================== */

export interface AuthUser {
  id: string;
  name: string;
  fullName: string;
  /** The user's one role, by role ID ("backup_operator"). Null from an
   *  appliance that predates roles. */
  role: string | null;
  enabled: boolean;
  createdAt: string | null;
  /** True when the account's password fails the security policy (e.g. the
   * bootstrap admin's default password) — the console forces a change before
   * anything else. */
  passwordPolicyExempt: boolean;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: AuthUser;
  /** The function IDs the user's role allows; null from an appliance that
   *  predates roles, where everything is allowed. */
  permissions: string[] | null;
}

function mapAuthUser(u: Dict): AuthUser {
  return {
    id: str(u.id),
    name: str(u.name),
    fullName: str(u.fullName),
    role: strOrNull(u.role),
    enabled: u.enabled !== false,
    createdAt: strOrNull(u.created_at),
    passwordPolicyExempt: Boolean(u.passwordPolicyExempt),
  };
}

const strListOrNull = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((item): item is string => typeof item === "string") : null;

export async function login(name: string, password: string, durationSeconds?: number): Promise<LoginResult> {
  const body: Dict = { name, password };
  if (durationSeconds !== undefined) body.duration_seconds = durationSeconds;
  const res = asDict(await request<Dict>("/auth/login", { method: "POST", body: JSON.stringify(body) }));
  return {
    token: str(res.token),
    expiresAt: str(res.expires_at),
    user: mapAuthUser(asDict(res.user)),
    permissions: strListOrNull(res.permissions),
  };
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string;
}

export interface WhoAmI {
  user: AuthUser;
  role: RoleSummary | null;
  permissions: string[];
}

function mapRoleSummary(r: Dict): RoleSummary {
  return { id: str(r.id), name: str(r.name), description: str(r.description) };
}

/** The signed-in user, their role and what it allows (GET /auth/me). Null
 *  from an appliance that predates roles (404), where everything is allowed. */
export async function whoami(): Promise<WhoAmI | null> {
  try {
    const res = asDict(await request<Dict>("/auth/me"));
    return {
      user: mapAuthUser(asDict(res.user)),
      role: res.role ? mapRoleSummary(asDict(res.role)) : null,
      permissions: strListOrNull(res.permissions) ?? [],
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/* ---- Users and roles (Settings -> Users) ---- */

export async function listUsers(): Promise<AuthUser[]> {
  return (await collection<Dict>("/users")).map(mapAuthUser);
}

export interface CreateUserInput {
  name: string;
  fullName: string;
  role: string;
  password: string;
}

export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  return mapAuthUser(asDict(await request<Dict>("/users", { method: "POST", body: JSON.stringify(input) })));
}

/** A change to a user. A new `name` keeps the password; a `password` signs
 *  the user out everywhere, and is refused for the caller's own, which needs
 *  the current one (`changePassword`). */
export type UserPatch = Partial<Pick<AuthUser, "name" | "fullName" | "role" | "enabled">> & { password?: string };

export async function updateUser(id: string, patch: UserPatch): Promise<AuthUser> {
  return mapAuthUser(
    asDict(await request<Dict>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })),
  );
}

export const deleteUser = (id: string) => request<Dict>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });

export interface RoleInfo extends RoleSummary {
  /** False for a role an Administrator made; the built-in ones can't be
   *  changed or deleted. */
  builtIn: boolean;
  /** Function IDs this role allows; every other function is disabled. */
  allowedFunctions: string[];
  /** How many users hold it; null from an appliance that doesn't say. */
  userCount: number | null;
  clonedFrom: { id: string; name: string } | null;
}

export interface ProductFunction {
  id: string;
  name: string;
  category: string;
  /** Every role allows it, a custom one too (signing in and out, one's own
   *  password and session). */
  alwaysAllowed: boolean;
}

function mapRoleInfo(r: Dict): RoleInfo {
  const source = r.cloned_from ? asDict(r.cloned_from) : null;
  return {
    ...mapRoleSummary(r),
    builtIn: r.built_in !== false,
    allowedFunctions: strListOrNull(r.allowed_functions) ?? [],
    userCount: typeof r.user_count === "number" ? r.user_count : null,
    clonedFrom: source ? { id: str(source.id), name: str(source.name) } : null,
  };
}

export async function listRoles(): Promise<RoleInfo[]> {
  return (await collection<Dict>("/roles")).map(mapRoleInfo);
}

export async function listFunctions(): Promise<ProductFunction[]> {
  return (await collection<Dict>("/functions")).map((f) => ({
    id: str(f.id),
    name: str(f.name),
    category: str(f.category),
    alwaysAllowed: f.always_allowed === true,
  }));
}

/** A new custom role: from scratch with `allowedFunctions`, or a clone of
 *  `cloneFrom`, whose functions and description are then the defaults. */
export interface RoleInput {
  name?: string;
  description?: string;
  allowedFunctions?: string[];
  cloneFrom?: string;
}

function roleBody(input: RoleInput): Dict {
  const body: Dict = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;
  if (input.allowedFunctions !== undefined) body.allowed_functions = input.allowedFunctions;
  if (input.cloneFrom !== undefined) body.clone_from = input.cloneFrom;
  return body;
}

export async function createRole(input: RoleInput): Promise<RoleInfo> {
  return mapRoleInfo(asDict(await request<Dict>("/roles", { method: "POST", body: JSON.stringify(roleBody(input)) })));
}

/** A change to a custom role; `allowedFunctions` is the whole new list. */
export async function updateRole(id: string, patch: Omit<RoleInput, "cloneFrom">): Promise<RoleInfo> {
  return mapRoleInfo(
    asDict(
      await request<Dict>(`/roles/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(roleBody(patch)) }),
    ),
  );
}

export const deleteRole = (id: string) => request<Dict>(`/roles/${encodeURIComponent(id)}`, { method: "DELETE" });

/* ---- Audit log (Logs -> Audit) ---- */

export type AuditResult = "allowed" | "denied" | "failed";

export interface AuditRecord {
  id: string;
  /** UTC, ISO 8601. */
  timestamp: string;
  user: string;
  /** The role the user held when the record was written. */
  role: string | null;
  functionId: string;
  target: { type: string; id: string | null; name: string | null } | null;
  result: AuditResult;
  sessionId: string | null;
  /** "web", "cli" or "api". */
  interface: string;
  command: string | null;
  client: string | null;
  error: { code: string; message: string } | null;
  /** The request, with credentials masked by the appliance. */
  parameters: Dict | null;
  details: Dict | null;
}

export interface AuditLogQuery {
  limit?: number;
  offset?: number;
  user?: string;
  /** A function ID, or an area with a trailing dot ("job.") for all of it. */
  function?: string;
  result?: AuditResult;
  since?: string;
}

function mapAuditRecord(r: Dict): AuditRecord {
  const target = r.target ? asDict(r.target) : null;
  const error = r.error ? asDict(r.error) : null;
  const result = str(r.result);
  return {
    id: str(r.id),
    timestamp: str(r.timestamp),
    user: str(r.user),
    role: strOrNull(r.role),
    functionId: str(r.function_id),
    target: target ? { type: str(target.type), id: strOrNull(target.id), name: strOrNull(target.name) } : null,
    result: result === "denied" || result === "failed" ? result : "allowed",
    sessionId: strOrNull(r.session_id),
    interface: str(r.interface, "api"),
    command: strOrNull(r.command),
    client: strOrNull(r.client),
    error: error ? { code: str(error.code), message: str(error.message) } : null,
    parameters: r.parameters ? asDict(r.parameters) : null,
    details: r.details ? asDict(r.details) : null,
  };
}

export async function listAuditRecords(q: AuditLogQuery = {}): Promise<{ items: AuditRecord[]; total: number }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  const res = asDict(await request<Dict>(`/audit${query ? `?${query}` : ""}`));
  const items = Array.isArray(res.items) ? (res.items as Dict[]).map(mapAuditRecord) : [];
  return { items, total: num(res.total, items.length) };
}

/** True when the appliance refused the request because the signed-in user's
 *  role does not allow it. */
export function isPermissionDenied(err: unknown): boolean {
  return apiErrorCode(err) === "permission_denied";
}

export const logout = () => request<void>("/auth/logout", { method: "POST", body: "{}" });

/** Adjusts the current session's absolute expiry in place (Settings ->
 *  Security's token-lifetime slider) -- takes effect immediately rather than
 *  waiting for the next login. Resolves the new `expiresAt` ISO timestamp. */
export async function extendSession(durationSeconds: number): Promise<string> {
  const res = asDict(
    await request<Dict>("/auth/session/duration", {
      method: "PUT",
      body: JSON.stringify({ duration_seconds: durationSeconds }),
    }),
  );
  return str(res.expires_at);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  const res = await request<Dict>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  return mapAuthUser(asDict(res));
}

/* ====================================================================== */
/* Reads (same signatures the world driver + pages expect)                 */
/* ====================================================================== */

/** All restore points, flattened from the backup chains catalog. */
export async function listRestorePoints(vmId?: string): Promise<RestorePoint[]> {
  const chains = await collection<Dict>("/backups");
  const points: RestorePoint[] = [];
  for (const chain of chains) {
    const rps = Array.isArray(chain.restore_points) ? (chain.restore_points as Dict[]) : [];
    for (const p of rps) points.push(mapRestorePointFromChainPoint(chain, p));
  }
  return vmId ? points.filter((p) => p.vmId === vmId) : points;
}

export async function listEnvironments(): Promise<Environment[]> {
  const items = await collection<Dict>("/inventories");
  return items.map(mapEnvironment);
}

/** Console EnvironmentType → orchestrator inventory `type`. */
function inventoryTypeOf(t: EnvironmentType): string {
  switch (t) {
    case "hyperv":
      return "hyper-v";
    case "proxmox":
      return "proxmox-ve";
    default:
      // vcenter + esxi-standalone both register as vSphere; the backend probes
      // whether it's a vCenter or a standalone host.
      return "vsphere";
  }
}

export async function createEnvironment(input: CreateEnvironmentInput): Promise<Environment> {
  const body: Dict = {
    name: input.name,
    type: inventoryTypeOf(input.type),
    address: input.endpoint,
    username: input.username,
    password: input.password,
    insecure: Boolean(input.insecure),
  };
  if (input.token) body.token = input.token;
  if (input.port) body.port = input.port;
  if (input.protocol) body.protocol = input.protocol;
  return mapEnvironment(asDict(await request<Dict>("/inventories", { method: "POST", body: JSON.stringify(body) })));
}

export interface EnvironmentPatch {
  name?: string;
  /** Host / management address (vCenter, ESXi, or Hyper-V host). */
  endpoint?: string;
  port?: number;
  protocol?: WinrmProtocol;
  username?: string;
  password?: string;
  /** Skip TLS certificate verification (self-signed lab certs). */
  insecure?: boolean;
}

export async function patchEnvironment(id: string, patch: EnvironmentPatch): Promise<Environment> {
  const body: Dict = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.endpoint !== undefined) body.address = patch.endpoint;
  if (patch.port !== undefined) body.port = patch.port;
  if (patch.protocol !== undefined) body.protocol = patch.protocol;
  if (patch.username !== undefined) body.username = patch.username;
  if (patch.password !== undefined) body.password = patch.password;
  if (patch.insecure !== undefined) body.insecure = patch.insecure;
  return mapEnvironment(
    asDict(await request<Dict>(`/inventories/${id}`, { method: "PATCH", body: JSON.stringify(body) })),
  );
}

export const deleteEnvironment = (id: string) => request<void>(`/inventories/${id}`, { method: "DELETE" });

export async function listHosts(): Promise<Host[]> {
  return (await fetchInventoryTree()).hosts;
}

export async function listVms(): Promise<VM[]> {
  const [{ vms }, points] = await Promise.all([fetchInventoryTree(), listRestorePoints().catch(() => [])]);
  return applyProtection(vms, points);
}

export async function getVM(id: string): Promise<VM> {
  const vms = await listVms();
  const vm = vms.find((v) => v.id === id);
  if (!vm) throw new ApiError(404, { error: "vm not found" });
  return vm;
}

/**
 * Sessions per request. The appliance keeps one session per VM per run, so an
 * appliance a few months old has thousands: at 1000 they came back as a single
 * ~1.8 MB response, which the poll loop below refetches every 2.5 s while
 * anything is running.
 *
 * Paging that response was only half the fix. Walking every page on each poll
 * moved the same megabytes in more envelopes — so the console now fetches *one*
 * page, the newest, and treats older history as something to ask for rather
 * than something to carry. `total` says how much more there is; `loadOlder`
 * below fetches the next page when a screen actually needs it.
 *
 * The server caps `limit` at 500 (SESSION_PAGE_LIMIT_MAX in abr_v41.py).
 */
export const SESSION_PAGE_SIZE = 100;

/** One page of sessions, newest first, with the envelope that locates it. */
export interface SessionPage {
  items: Session[];
  /** Match count *before* limit/offset — how many exist, not how many arrived. */
  total: number;
  /** Whether a further (older) page follows this one. */
  hasNext: boolean;
  /** 1-based position of this page, and how many there are in total. */
  page: number;
  pages: number;
}

export async function listSessionsPage(
  opts: { limit?: number; offset?: number } = {},
): Promise<SessionPage> {
  const limit = opts.limit ?? SESSION_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  const res = asDict(await request<Dict>(`/sessions?limit=${limit}&offset=${offset}`));
  const items = Array.isArray(res.items) ? (res.items as Dict[]).map(mapSession) : [];
  // An appliance predating the envelope ignores the params and sends everything
  // with no `total`: falling back to the page length makes that look like a
  // single complete page, which is exactly what it is.
  const total = num(res.total, items.length);
  return {
    items,
    total,
    hasNext:
      typeof res.has_next === "boolean" ? res.has_next : offset + items.length < total,
    page: num(res.page, Math.floor(offset / limit) + 1),
    pages: num(res.pages, Math.max(1, Math.ceil(total / Math.max(1, limit)))),
  };
}

export async function getSession(id: string): Promise<Session> {
  return mapSession(asDict(await request<Dict>(`/sessions/${id}`)));
}

/** This job's runs out of the history the console already holds — the same
 *  source `getJob` reads, so asking for one job's runs never re-fetches the
 *  session list. */
export async function getJobSessions(jobId: string): Promise<Session[]> {
  return useWorldStore.getState().sessions.filter((s) => s.jobId === jobId);
}

/** Jobs without run history — the caller attaches it via `withJobRunStats`
 *  from the session list it already holds (see hydrate in world.live.ts). */
export async function listJobs(): Promise<BackupJob[]> {
  return (await collection<Dict>("/jobs")).map((j) => mapJob(j, []));
}

/**
 * Run history here comes from the world the live driver already hydrated, not
 * from a fresh list: this runs on every job-changed event, and refetching the
 * entire session history to compute one job's 12-run strip is what made the
 * session list the console's heaviest traffic.
 */
export async function getJob(id: string): Promise<BackupJob> {
  const job = asDict(await request<Dict>(`/jobs/${id}`));
  return mapJob(job, useWorldStore.getState().sessions);
}

export async function listRepositories(): Promise<Repository[]> {
  const items = await collection<Dict>("/repositories");
  return items.map(mapRepository);
}

/* ---- Appliance system log (the server's own log file) ---- */

/** One parsed line of `server.log` (see services/system_log_service.py). */
export interface SystemLogRow {
  id: string;
  /** ISO-8601 with the appliance's UTC offset — the file itself is local time. */
  ts: string;
  level: LogLevel;
  /** The emitting module, e.g. "job_scheduler" — what the Logs page groups by. */
  source: string;
  /** Full Python logger name behind `source`, e.g. "python.srv.core.job_scheduler". */
  logger: string;
  message: string;
}

export interface SystemLogPage {
  entries: SystemLogRow[];
  /** Older lines exist beyond the window the appliance read. */
  hasMore: boolean;
  /** Log files actually read — empty when the appliance found none. */
  files: string[];
  /** Where it looked. Only interesting when `files` is empty. */
  searched: string[];
}

/**
 * The appliance's OWN log, newest-first (GET /system/logs).
 *
 * Not a session log: that is `getSessionLog`, and it only ever covers one run.
 * This is the server process — scheduler, TLS, database, API — which is the
 * half of "what happened last night" no per-session view can answer.
 */
export async function listSystemLog(
  opts: { limit?: number; level?: "debug" | "info" | "warn" | "error" } = {},
): Promise<SystemLogPage> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.level) params.set("level", opts.level);
  const query = params.toString();
  const res = asDict(await request<Dict>(`/system/logs${query ? `?${query}` : ""}`));
  const rows = Array.isArray(res.entries) ? (res.entries as Dict[]) : [];
  return {
    entries: rows.map((row, index) => ({
      id: str(row.id) || `syslog-${index}`,
      ts: str(row.ts),
      level: logLevelOf(str(row.level)),
      source: str(row.source) || "srv",
      logger: str(row.logger),
      message: str(row.message),
    })),
    hasMore: Boolean(res.has_more),
    files: Array.isArray(res.files) ? (res.files as unknown[]).map(String) : [],
    searched: Array.isArray(res.searched) ? (res.searched as unknown[]).map(String) : [],
  };
}

export const getSessionLog = async (sessionId: string) => {
  const res = asDict(await request<Dict>(`/sessions/${sessionId}/log`));
  return { lines: mapLogLines(res.logs) };
};

/**
 * Dashboard summary. The console computes the rich summary client-side from the
 * hydrated world (see services/api.ts), so this thin mapping of the backend's
 * summary endpoint exists only to satisfy the export contract.
 */
export async function getDashboard(): Promise<DashboardSummary> {
  const s = asDict(await request<Dict>("/dashboard/summary").catch(() => ({})));
  return {
    totalVms: num(s.protected_vms),
    protectedVms: num(s.protected_vms),
    warningVms: 0,
    unprotectedVms: 0,
    protectionCoverage: 0,
    successRate24h: null,
    sessions24h: 0,
    failed24h: 0,
    totalRestorePoints: 0,
    capacityGB: 0,
    usedGB: 0,
    activeThreats: 0,
    dataProtectedGB: num(s.recent_backups_size_tb) * 1000,
    activityTimeline: [],
  };
}

/** System-health "alerts" derived from the dashboard's problem-areas list. */
export async function listAlerts(): Promise<Alert[]> {
  const s = asDict(await request<Dict>("/dashboard/summary").catch(() => ({})));
  const problems = Array.isArray(s.problem_areas) ? (s.problem_areas as Dict[]) : [];
  const now = new Date().toISOString();
  return problems.map((p) => ({
    id: str(p.id) || `alert-${Math.abs(hashString(str(p.message)))}`,
    severity: str(p.type) === "error" ? "critical" : "warning",
    category: "system",
    title: str(p.message).slice(0, 64) || "System notice",
    message: str(p.message),
    createdAt: now,
    read: false,
  }));
}

/* ---- Reads with no orchestrator backing yet (WIP features) ---- */
export const listReplicas = async (): Promise<Replica[]> => [];
export const listThreats = async (): Promise<Threat[]> => [];
export const getMetricsHistory = async (_days = 90): Promise<MetricSnapshot[]> => [];
export const listAuditEvents = async (_q: AuditQuery = {}): Promise<AuditEvent[]> => [];

/* ====================================================================== */
/* Mutations — jobs                                                        */
/* ====================================================================== */

export interface CreateJobPayload {
  name: string;
  type?: BackupJob["type"];
  description?: string;
  vmIds: string[];
  scopeSummary: string;
  repositoryId: string;
  schedule: Schedule;
  /** Omitted: leave the job's schedule as it is. null: remove it. */
  activeFullSchedule?: FullBackupSchedule | null;
  syntheticFullSchedule?: FullBackupSchedule | null;
  retention: Retention;
  options: JobOptions;
  accent?: BackupJob["accent"];
  runNow?: boolean;
  replicaTarget?: ReplicaTarget;
}

/** Domain Schedule → orchestrator schedule dict. */
function scheduleToWire(s: Schedule): Dict {
  const timezone = "UTC";
  switch (s.frequency) {
    case "weekly":
      // The API validates weekdays as "Mon".."Sun" names (DAY_ALIASES in
      // abr_v41.py) and 422s on raw numbers — convert from the domain's
      // 0 (Sun) – 6 (Sat) indices before sending.
      return {
        schedule_type: "weekly",
        start_time: s.atTime ?? "00:00",
        weekdays: (s.daysOfWeek ?? [1]).map((d) => DAY_NAMES[d]).filter(Boolean),
        timezone,
      };
    case "hourly":
      return { schedule_type: "periodic", interval_minutes: (s.everyHours ?? 1) * 60, timezone };
    case "custom":
      return s.cron
        ? { schedule_type: "cron", expression: s.cron, timezone }
        : { schedule_type: "daily", start_time: s.atTime ?? "00:00", timezone };
    default:
      return { schedule_type: "daily", start_time: s.atTime ?? "00:00", timezone };
  }
}

/** Domain full schedule → the dict `normalize_schedule_payload` reads. */
function fullScheduleToWire(s: FullBackupSchedule): Dict {
  const common = { enabled: s.enabled, timezone: s.timezone || "UTC" };
  const time = s.atTime ?? "00:00";
  switch (s.frequency) {
    case "weekly":
      return {
        ...common,
        type: "weekly",
        time,
        // Sorted so the same days picked in a different order compare equal
        // in `fullScheduleKey`.
        days: [...new Set(s.daysOfWeek ?? [])]
          .sort((a, b) => a - b)
          .map((d) => DAY_NAMES[d])
          .filter(Boolean),
      };
    case "monthly":
      return { ...common, type: "monthly", time, day_of_month: s.dayOfMonth ?? 1 };
    case "periodic":
      return { ...common, type: "periodic", interval_minutes: s.everyMinutes ?? 60 };
    case "cron":
      return { ...common, type: "cron", expression: s.cron ?? "" };
    case "daily":
    default:
      return { ...common, type: "daily", time };
  }
}

/** A stable key for a full schedule as the appliance would store it, so the
 *  edit form can tell whether one actually changed. Re-sending an unchanged
 *  schedule is not harmless: the appliance recalculates its next run from
 *  the moment of the edit, which pushes a periodic full further out. */
export function fullScheduleKey(s: FullBackupSchedule | null | undefined): string {
  return s ? JSON.stringify(fullScheduleToWire(s)) : "none";
}

function optionsToTaskParams(o: JobOptions): Dict {
  const params: Dict = {
    app_aware: o.appAware,
    // The appliance reads `encryption_enabled` (+ `encryption_key`) and
    // ignores every other spelling, so anything else here silently produces
    // unencrypted backups for a job the UI shows as encrypted.
    encryption_enabled: o.encryption,
    compression_level: o.compression,
    dedup: o.dedup,
    on_quiesce_failure: o.onQuiesceFailure ?? "fail",
  };
  // null clears any stored key on the way back off (see
  // _merge_task_parameters), so no stale key outlives the setting.
  if (!o.encryption) params.encryption_key = null;
  // A key is only ever sent when the operator typed or generated one. Omitting
  // it is what lets the appliance mint its own on create, and what carries the
  // stored key through untouched on an edit — sending a key here REPLACES the
  // job's, so it must never be sent speculatively.
  else if (o.encryptionKey) params.encryption_key = o.encryptionKey;
  // Hyper-V policy: only sent once chosen, so a VMware job never grows it.
  if (o.guestConsistency) params.hyperv_consistency = o.guestConsistency;
  return params;
}

/**
 * The create wizard collects VMs but not an inventory (a VM knows its
 * environment). The orchestrator needs the inventory, so resolve it from the
 * selected VMs via the world store and pass VM names alongside ids.
 */
function resolveJobScope(vmIds: string[]): { inventoryId: string; vmNames: string[] } {
  const vms = useWorldStore.getState().vms;
  const selected = vms.filter((v) => vmIds.includes(v.id));
  const inventoryId = selected[0]?.environmentId ?? "";
  return { inventoryId, vmNames: selected.map((v) => v.name) };
}

function createJobBody(payload: Partial<CreateJobPayload>): Dict {
  const vmIds = payload.vmIds ?? [];
  const { inventoryId, vmNames } = resolveJobScope(vmIds);
  const body: Dict = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (vmIds.length) {
    body.vms = vmIds;
    body.vm_ids = vmIds;
    body.vm_names = vmNames;
  }
  if (inventoryId) body.inventory_id = inventoryId;
  if (payload.repositoryId) body.repo_id = payload.repositoryId;
  if (payload.schedule) body.schedule = scheduleToWire(payload.schedule);
  // null is meaningful here: it removes the schedule (and any legacy
  // `*_full_days` behind it). Only an omitted key leaves the job's schedule alone.
  if (payload.activeFullSchedule !== undefined) {
    body.active_full_schedule = payload.activeFullSchedule && fullScheduleToWire(payload.activeFullSchedule);
  }
  if (payload.syntheticFullSchedule !== undefined) {
    body.synthetic_full_schedule =
      payload.syntheticFullSchedule && fullScheduleToWire(payload.syntheticFullSchedule);
  }
  if (payload.retention) {
    body.retention_days = payload.retention.keepDays;
    // Create (CreateJobRequest) reads a nested `gfs` object; update
    // (UpdateJobRequest, PATCH) only reads flat gfs_weekly/monthly/yearly —
    // send both shapes so this body works unmodified for either endpoint.
    const gfs = payload.retention.gfs ?? { weekly: 0, monthly: 0, yearly: 0, enabled: true };
    body.gfs = gfs;
    body.gfs_weekly = gfs.weekly;
    body.gfs_monthly = gfs.monthly;
    body.gfs_yearly = gfs.yearly;
    // Archiving on/off is a separate switch from the counts on both endpoints:
    // create reads it inside the nested object, PATCH as a flat `gfs_enabled`.
    body.gfs_enabled = gfs.enabled;
    if (payload.retention.minFulls !== undefined) body.retention_min_fulls = payload.retention.minFulls;
  }
  if (payload.options) body.task_parameters = optionsToTaskParams(payload.options);
  return body;
}

export async function createJob(payload: CreateJobPayload): Promise<BackupJob> {
  const created = asDict(
    await request<Dict>("/jobs", { method: "POST", body: JSON.stringify(createJobBody(payload)) }),
  );
  if (payload.runNow && created.id) {
    await request(`/jobs/${str(created.id)}/start`, { method: "POST", body: "{}" }).catch(() => undefined);
  }
  return mapJob(created, useWorldStore.getState().sessions);
}

export async function updateJob(id: string, patch: Partial<CreateJobPayload>): Promise<BackupJob> {
  const updated = asDict(
    await request<Dict>(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify(createJobBody(patch)) }),
  );
  return mapJob(updated, useWorldStore.getState().sessions);
}

export const deleteJob = (id: string) => request<void>(`/jobs/${id}`, { method: "DELETE" });

export interface RunJobOptions {
  /** Re-read the whole VM: the orchestrator's "ActiveFull". */
  forceFull?: boolean;
  /**
   * Merge the stored chain into a new full instead of reading the VM at all —
   * the orchestrator's "SyntheticFull". Mutually exclusive with `forceFull`
   * (the appliance 422s on both: "A run is either an active full or a
   * synthetic full, not both"), which is why the two are separate flags rather
   * than one that callers could set twice.
   */
  forceSynthetic?: boolean;
  /**
   * Where the merged full should land. Synthetic-full runs only — the
   * appliance rejects it otherwise ("A target repository is only used by a
   * synthetic full"). Omitted, the merge is written to the job's own
   * repository, which is also where the chain is read from.
   */
  targetRepositoryId?: string;
}

/**
 * Start one run of a job (POST /jobs/{id}/start).
 *
 * The appliance fans this out to one session PER VM in the job (see
 * `start_job_record` in abr_v41.py) and answers with all of them. The single
 * `sessionId` returned here is the first, kept for the existing "run now"
 * call sites that only have one VM in view; `runJobSessions` below hands back
 * the whole set for callers that need to follow every VM the run touched.
 */
export async function runJob(id: string, opts?: RunJobOptions): Promise<{ sessionId: string }> {
  const { sessionIds, lastSessionId } = await runJobSessions(id, opts);
  return { sessionId: sessionIds[0] || lastSessionId };
}

/** Every session `POST /jobs/{id}/start` created — one per VM the job covers. */
export async function runJobSessions(
  id: string,
  opts?: RunJobOptions,
): Promise<{ sessionIds: string[]; lastSessionId: string }> {
  const body: Dict = {};
  if (opts?.forceFull) body.force_full = true;
  if (opts?.forceSynthetic) body.force_synthetic = true;
  // Only ever sent alongside force_synthetic — on its own the appliance
  // refuses it, and silently dropping it would write the merge somewhere the
  // operator didn't pick.
  if (opts?.forceSynthetic && opts.targetRepositoryId) {
    body.target_repository_id = opts.targetRepositoryId;
  }
  const res = asDict(await request<Dict>(`/jobs/${id}/start`, { method: "POST", body: JSON.stringify(body) }));
  const items = Array.isArray(res.items) ? (res.items as Dict[]) : [];
  return {
    sessionIds: items.map((item) => str(item.id)).filter(Boolean),
    lastSessionId: str(res.last_session_id),
  };
}

function mapRetentionRun(res: Dict): RetentionRunResult {
  const summary = asDict(res.summary);
  const chains = Array.isArray(res.chains) ? (res.chains as Dict[]) : [];
  const ids = (value: unknown) => (Array.isArray(value) ? value.map((item) => str(item)).filter(Boolean) : []);
  return {
    ok: true,
    jobId: str(res.job_id),
    jobName: str(res.job_name),
    dryRun: Boolean(res.dry_run),
    retentionDays: num(res.retention_days),
    retentionMinFulls: num(res.retention_min_fulls),
    clockBlocked: str(res.clock_blocked) || null,
    summary: {
      chains: num(summary.chains),
      points: num(summary.points),
      removed: num(summary.removed),
      held: num(summary.held),
      failed: num(summary.failed),
      skipped: num(summary.skipped),
      keptMinFulls: num(summary.kept_min_fulls),
    },
    chains: chains.map((chain) => ({
      vmId: str(chain.vm_id),
      vmName: str(chain.vm_name) || null,
      repositoryId: str(chain.repository_id) || null,
      repositoryName: str(chain.repository_name) || null,
      points: num(chain.points),
      removed: ids(chain.removed),
      held: (Array.isArray(chain.held) ? (chain.held as Dict[]) : []).map((item) => ({
        pointId: str(asDict(item).point_id),
        until: str(asDict(item).until),
      })),
      failed: ids(chain.failed),
      keptForChain: ids(chain.kept_for_chain),
      skippedReason: str(chain.skipped_reason) || null,
      keptMinFulls: ids(chain.kept_min_fulls),
      clockBlocked: str(chain.clock_blocked) || null,
    })),
    ranAt: str(res.ran_at),
  };
}

/**
 * Apply a backup job's retention to every chain it wrote — or, with
 * `dryRun`, report what that would remove without removing anything
 * (`POST /jobs/{id}/retention`). Retention also runs after every backup on
 * the appliance; this is the operator's "now", and the preview behind it.
 */
export async function runJobRetention(id: string, dryRun: boolean): Promise<RetentionRunResult> {
  const res = asDict(
    await request<Dict>(`/jobs/${id}/retention`, { method: "POST", body: JSON.stringify({ dry_run: dryRun }) }),
  );
  return mapRetentionRun(res);
}

export const setJobEnabled = (id: string, enabled: boolean) =>
  request<void>(`/jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });

export interface StopSessionResult {
  /** The session's state as the appliance reports it back: "stopping" for a
   *  run it is now winding down, "stopped" for one cancelled before it started,
   *  or an already-terminal state when the run finished first. */
  state: string;
  message: string;
}

/**
 * Ask the appliance to stop one run (POST /sessions/{id}/stop).
 *
 * The stop is a REQUEST, not a kill: `stop_session` flags the task and the
 * engine unwinds at its next checkpoint, so a run that answers here is
 * "stopping", not stopped. Stopping a finished session is accepted and
 * answers with its terminal state — the caller doesn't have to race the poll.
 */
export async function stopSession(
  id: string,
  opts: { force?: boolean } = {},
): Promise<StopSessionResult> {
  const res = asDict(
    await request<Dict>(`/sessions/${id}/stop`, {
      method: "POST",
      body: JSON.stringify(opts.force ? { force: true } : {}),
    }),
  );
  return { state: str(res.state), message: str(res.message) };
}

/**
 * Stop every active session of a job (no per-job stop route on the backend).
 *
 * The job DTO already reports its queued/running sessions (`active_sessions`,
 * built by _active_sessions_for_job in abr_v41.py), so this reads them from
 * the one job it is stopping instead of scanning the whole session history.
 */
export async function stopJob(id: string): Promise<void> {
  const job = asDict(await request<Dict>(`/jobs/${id}`));
  // `active_sessions` is exactly {queued, running, stopping} — the same set the
  // old whole-history scan covered, since sessionStatusOf folds "stopping" into
  // "running". Re-stopping one already stopping is a no-op server-side.
  const active = Array.isArray(job.active_sessions) ? (job.active_sessions as Dict[]) : [];
  await Promise.all(active.map((s) => stopSession(str(s.id)).catch(() => undefined)));
}

/* ====================================================================== */
/* Mutations — restore                                                     */
/* ====================================================================== */

/**
 * Placement options for a new-location restore: the source VM's real NICs
 * (from its manifest) and the candidate target environments' real datastores
 * and networks (from live inventory) — everything the wizard needs to offer
 * dropdowns instead of free text, and to auto-suggest a target network whose
 * name matches the source. Datastores and networks each carry the hosts they
 * are reachable from, so picking a host narrows both lists to what that host
 * can actually serve.
 */

/**
 * The storage location a Hyper-V disk path is on, as the host reports its
 * storage: "C:\ClusterStorage\Volume1" for a Cluster Shared Volume,
 * "\\fs01\vms" for an SMB share, "D:" for a local drive. Mirrors
 * `_parse_windows_storage_path` in abr-core, which keys `datastore_map` by the
 * same names. Null for anything that isn't a Windows path.
 */
export function windowsStorageLocation(path: string): string | null {
  const value = path.trim().replace(/\//g, "\\");
  const csv = /^([A-Za-z]:\\ClusterStorage\\[^\\]+)(?:\\|$)/i.exec(value);
  if (csv) return csv[1][0].toUpperCase() + csv[1].slice(1);
  const unc = /^(\\\\[^\\]+\\[^\\]+)(?:\\|$)/.exec(value);
  if (unc) return unc[1];
  const drive = /^([A-Za-z]:)(?:\\|$)/.exec(value);
  return drive ? drive[1].toUpperCase() : null;
}
export async function getRestorePlacementOptions(restorePointId: string): Promise<RestorePlacementOptions> {
  const res = asDict(
    await request<Dict>(`/restore/context?restore_point_id=${encodeURIComponent(restorePointId)}`),
  );
  const sourceVm = asDict(res.source_vm);
  const nics = Array.isArray(sourceVm.nics) ? (sourceVm.nics as Dict[]) : [];
  // One entry per real adapter — never deduped by network name, so two NICs
  // on the same source network still show (and map) as separate rows.
  const sourceNics = nics.map((n, i) => ({
    id: str(n.id) || `nic-${i}`,
    label: str(n.label) || `Network adapter ${i + 1}`,
    sourceNetwork: str(n.source_network).trim() || null,
    connected: n.connected !== false,
  }));
  /* "[datastore1] folder/disk.vmdk" — the datastore a disk lived on is the part
   * in brackets, which is also the name `datastore_map` takes on the way back
   * (`_source_disk_datastore` parses the same path server-side). A Hyper-V disk
   * is a Windows path instead, and its storage location is the Cluster Shared
   * Volume, share or drive it is on (`_parse_windows_storage_path`). */
  const sourceDatastoreOf = (datastorePath: string): string | null => {
    const match = /^\s*\[([^\]]+)\]/.exec(datastorePath);
    if (match) return match[1].trim() || null;
    return windowsStorageLocation(datastorePath);
  };
  const disks = Array.isArray(sourceVm.disks) ? (sourceVm.disks as Dict[]) : [];
  const sourceDisks = disks.map((d, i) => ({
    id: str(d.id) || `disk-${i}`,
    label: str(d.label) || `Hard disk ${i + 1}`,
    capacityBytes: d.capacity_bytes == null ? null : num(d.capacity_bytes),
    usedBytes: d.used_bytes == null ? null : num(d.used_bytes),
    provisioning: str(d.provisioning).trim() || null,
    sourceDatastore: sourceDatastoreOf(str(d.datastore_path)),
  }));
  const originalDatastore = str(sourceVm.original_datastore).trim() || null;
  const originalHost = str(sourceVm.original_host).trim() || null;

  const targets = asDict(res.targets);
  const datastores = (Array.isArray(targets.datastores) ? (targets.datastores as Dict[]) : []).map((d) => ({
    id: str(d.id),
    environmentId: str(d.inventory_id),
    name: str(d.name),
    hostIds: (Array.isArray(d.host_ids) ? d.host_ids : []).map((h) => String(h)),
    freeBytes: d.free_bytes == null ? null : num(d.free_bytes),
    capacityBytes: d.capacity_bytes == null ? null : num(d.capacity_bytes),
  }));
  const networks = (Array.isArray(targets.networks) ? (targets.networks as Dict[]) : []).map((n) => ({
    id: str(n.id),
    environmentId: str(n.inventory_id),
    name: str(n.name),
    hostIds: (Array.isArray(n.host_ids) ? n.host_ids : []).map((h) => String(h)),
  }));
  const existingVms = (Array.isArray(targets.existing_vms) ? (targets.existing_vms as Dict[]) : []).map((v) => ({
    id: str(v.id),
    environmentId: str(v.inventory_id),
    name: str(v.name),
  }));

  const defaults = asDict(res.defaults);

  const defaultDatastoreMappings = (
    Array.isArray(defaults.datastore_mappings) ? (defaults.datastore_mappings as Dict[]) : []
  )
    .map((m) => ({
      sourceDatastore: str(m.source_datastore).trim(),
      targetDatastoreId: str(m.target_datastore_id).trim(),
    }))
    .filter((m) => m.sourceDatastore !== "");

  return {
    sourceNics,
    sourceDisks,
    datastores,
    networks,
    existingVms,
    originalDatastore,
    originalHost,
    defaultHostId: str(defaults.target_host_id).trim() || null,
    defaultDatastoreId: str(defaults.target_datastore_id).trim() || null,
    defaultEnvironmentId: str(defaults.target_inventory_id).trim() || null,
    defaultDatastoreMappings,
  };
}

/**
 * Start a full-VM restore. The wizard's "New location" picks host/datastore/
 * name explicitly and always restores out-of-place ("new_vm"). "Original
 * location" restores in place ("in_place") — the orchestrator forces target
 * host/datastore/name to the source VM's own original placement server-side,
 * so none of those are sent for it; it destroys the still-live original once
 * every disk is fully written, so it requires `force: true`, set only once
 * the wizard's typed confirmation has been completed.
 */
export async function startRestore(payload: {
  vmId: string;
  restorePointId: string;
  target: { mode: "original" | "new"; newName?: string };
  targetEnvironmentId?: string;
  targetHostId?: string;
  datastore?: string;
  /** Per-adapter mapping — `target` is a target network *id*, not a name, so
   *  two source NICs sharing a network name can still map independently
   *  (see `_resolve_restore_network_selection`'s `source_nic_id` branch). */
  networkMappings?: { nicId: string; target: string }[];
  /** Per source datastore — `target` is a target datastore *id*. Sent for a
   *  new-location restore only: an in-place restore keeps every disk on its own
   *  datastore and the appliance refuses a mapping for it. */
  datastoreMappings?: { sourceDatastore: string; target: string }[];
  powerOn?: boolean;
  /** Authorizes an in-place restore — required by the backend whenever
   *  `target.mode` is "original"; ignored otherwise. */
  force?: boolean;
  /** Overrides the key the appliance would resolve from its own catalog. */
  encryptionKey?: string;
}): Promise<{ restoreId: string; sessionId: string }> {
  const isInPlace = payload.target.mode === "original";
  const body: Dict = {
    point_id: payload.restorePointId,
    restore_mode: isInPlace ? "in_place" : "new_vm",
    power_on_after_restore: Boolean(payload.powerOn),
    connect_nics: true,
  };
  if (isInPlace) {
    if (payload.force) body.force = true;
  } else {
    if (payload.target.newName) body.target_vm_name = payload.target.newName;
    if (payload.targetEnvironmentId) body.target_inventory_id = payload.targetEnvironmentId;
    if (payload.targetHostId) body.target_host = payload.targetHostId;
    if (payload.datastore) body.target_datastore = payload.datastore;
    /* `target_datastore` above is the default every disk falls back to; this
     * places the disks of each SOURCE datastore individually, which is what a
     * VM spread over several datastores needs (see
     * `_resolve_restore_datastore_placement`). */
    if (payload.datastoreMappings?.length) {
      body.datastore_mappings = payload.datastoreMappings.map((m) => ({
        source_datastore: m.sourceDatastore,
        target_datastore_id: m.target,
      }));
    }
  }
  if (payload.networkMappings?.length) {
    body.network_mappings = payload.networkMappings.map((m) => ({
      source_nic_id: m.nicId,
      target_network_id: m.target,
    }));
  }
  // Only when the operator typed one: `restore_start` prefers an explicit key
  // over everything the catalog knows, so an empty string here would be sent
  // as a key and fail a restore the appliance could have resolved by itself.
  if (payload.encryptionKey) body.encryption_key = payload.encryptionKey;
  const res = asDict(await request<Dict>("/restore/start", { method: "POST", body: JSON.stringify(body) }));
  const sessionId = str(res.restore_session_id) || str(res.id);
  return { restoreId: sessionId, sessionId };
}

/** Deletes a backup chain, or — when `segmentId` is given — just one full
 *  backup and the incrementals chained onto it (`RestorePointSegment.id`).
 *  `chainId` is `RestorePoint.chainId`, which the orchestrator's `/backups/{id}`
 *  DELETE resolves as a chain id; `segmentId` maps to its `?segment=` param. */
export const deleteRestorePoint = (chainId: string, segmentId?: string, force = false) => {
  const params = new URLSearchParams();
  if (segmentId) params.set("segment", segmentId);
  if (force) params.set("force", "true");
  const query = params.toString();
  return request<void>(`/backups/${chainId}${query ? `?${query}` : ""}`, { method: "DELETE" });
};

/**
 * Starts an integrity check over one stored backup chain
 * (`POST /backups/{id}/verify`) and returns the session it runs under.
 *
 * `wait=false` deliberately: with `wait=true` the appliance re-reads every
 * artifact in the chain before it answers, which is minutes of a held-open
 * request for a large chain — long enough for a proxy to give up on it. The
 * run is a normal session either way, so the console follows it the way it
 * follows a backup: through the session feed.
 */
export async function verifyBackupChain(chainId: string): Promise<{ sessionId: string }> {
  const res = asDict(
    await request<Dict>(`/backups/${chainId}/verify?wait=false`, { method: "POST", body: "{}" }),
  );
  return { sessionId: str(res.session_id) || str(res.id) };
}

/* ====================================================================== */
/* Mutations — repositories                                                */
/* ====================================================================== */

/** Wire shape for the orchestrator's nested `s3` config object, read in
 *  _normalize_s3_configuration (bucket/region/keys/etc.) — shared by create
 *  and the pre-create connection test so both send identical settings. */
function s3ConfigWireBody(s3: S3RepositoryConfig): Dict {
  return {
    bucket: s3.bucket,
    prefix: s3.prefix ?? "",
    region: s3.region ?? "",
    endpoint_url: s3.endpointUrl ?? "",
    access_key: s3.accessKey ?? "",
    secret_key: s3.secretKey ?? "",
    profile: s3.profile ?? "",
    path_style: s3.pathStyle ?? Boolean(s3.endpointUrl),
    verify_tls: s3.verifyTls ?? true,
    // The appliance pairs these strictly (_validate_s3_configuration): mode
    // "none" demands 0 days, and any other mode demands at least 1. Sending an
    // explicitly-zeroed "none" is what lets the dialog turn the lock back off.
    immutability: {
      mode: s3.immutability?.mode ?? "none",
      retention_days:
        s3.immutability && s3.immutability.mode !== "none" ? s3.immutability.retentionDays : 0,
    },
  };
}

/** Wire `immutability` block → the console shape. Absent for a backend that has
 *  no Object Lock at all, which is not the same as one that has it switched off. */
function mapImmutability(raw: unknown): RepositoryImmutability | null {
  if (!raw || typeof raw !== "object") return null;
  const config = asDict(raw);
  const mode = str(config.mode) as ImmutabilityMode;
  const known: ImmutabilityMode[] = ["none", "governance", "compliance"];
  return {
    mode: known.includes(mode) ? mode : "none",
    retentionDays: num(config.retention_days),
  };
}

/** Wire `checks` array → the console shape. Every repository-validation
 *  endpoint returns the same list of probes, so they all read it through here. */
function mapChecks(raw: unknown): S3ConnectionCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const check = asDict(c);
    return {
      name: str(check.name),
      status: str(check.status, "failed") as S3ConnectionCheck["status"],
      message: strOrNull(check.message) ?? undefined,
    };
  });
}

/** The appliance attaches the probes it ran to a 422 it raises over them
 *  (`_assert_immutability_is_usable` passes `checks=` into `api_error`), so a
 *  rejected create/edit can say WHICH check refused instead of one summary
 *  line. Anything else yields an empty list and the message stands alone. */
export function apiErrorChecks(err: unknown): S3ConnectionCheck[] {
  if (!(err instanceof ApiError)) return [];
  const body = err.body as { error?: { details?: unknown } } | null;
  const details = body?.error?.details;
  if (!details || typeof details !== "object") return [];
  return mapChecks((details as Dict).checks);
}

/** Wire `immutability_effect` → the console shape. Null when the endpoint
 *  reported none, which is every non-S3 repository. */
function mapImmutabilityEffect(raw: unknown): ImmutabilityEffect | null {
  if (!raw || typeof raw !== "object") return null;
  const effect = asDict(raw);
  const lines = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((v) => str(v)).filter(Boolean) : [];
  return {
    previous: mapImmutability(effect.previous) ?? { mode: "none", retentionDays: 0 },
    current: mapImmutability(effect.current) ?? { mode: "none", retentionDays: 0 },
    changed: Boolean(effect.changed),
    existingRestorePoints: num(effect.existing_restore_points),
    existingDataProtected: Boolean(effect.existing_data_protected),
    effect: lines(effect.effect),
    limitations: lines(effect.limitations),
    warnings: lines(effect.warnings),
  };
}

export async function createRepository(
  input: CreateRepositoryInput,
): Promise<{ repository: Repository; immutabilityEffect: ImmutabilityEffect | null }> {
  const wireType =
    input.type === "object-lock-s3" ? "s3" : input.type === "nfs" || input.type === "smb" ? input.type : "local";
  const body: Dict = { name: input.name, type: wireType, address: input.path, description: "" };
  // Without it the backend rejects the create with "S3 bucket is required".
  if (wireType === "s3" && input.s3) {
    body.s3 = s3ConfigWireBody(input.s3);
  }
  // An SMB repository's address is its share; the path is where the
  // appliance mounts it.
  if (wireType === "smb" && input.share) {
    delete body.address;
    Object.assign(body, { path: input.path }, shareWireFields(input.share));
  }
  const created = asDict(await request<Dict>("/repositories", { method: "POST", body: JSON.stringify(body) }));
  // Creating an S3 repository with Object Lock on comes back with the same
  // effect report an edit does — what the setting does to data written from
  // now on, and what it cannot reach. Worth showing: a bucket that already
  // held backups now has some under lock and some not.
  return {
    repository: mapRepository(created),
    immutabilityEffect: mapImmutabilityEffect(created.immutability_effect),
  };
}

/** Real pre-create S3 connectivity test — probes the given settings through
 *  the appliance's native storage tool via POST /repositories/test-s3
 *  without persisting a repository record. */
export async function testS3RepositoryConnection(s3: S3RepositoryConfig): Promise<S3ConnectionTestResult> {
  const body: Dict = { type: "s3", s3: s3ConfigWireBody(s3) };
  const res = asDict(
    await request<Dict>("/repositories/test-s3", { method: "POST", body: JSON.stringify(body) }),
  );
  return {
    ok: str(res.status) === "success",
    message: str(res.message) || (str(res.status) === "success" ? "S3 connection succeeded" : "S3 connection failed"),
    checks: mapChecks(res.checks),
  };
}

/**
 * Pre-create Object Lock test (POST /repositories/test-immutability).
 *
 * A different question from `testS3RepositoryConnection`: that one asks whether
 * the bucket is reachable and writable, this one asks whether it will actually
 * hold a backup under the requested retention — it reads the bucket's default
 * retention rule, writes a probe object, reads its lock back, and tries to
 * delete it. Both are worth running, so the dialog runs both.
 */
export async function testS3RepositoryImmutability(
  s3: S3RepositoryConfig,
): Promise<S3ConnectionTestResult> {
  const body: Dict = { type: "s3", s3: s3ConfigWireBody(s3) };
  const res = asDict(
    await request<Dict>("/repositories/test-immutability", { method: "POST", body: JSON.stringify(body) }),
  );
  return {
    ok: str(res.status) === "success",
    message: str(res.message) || (str(res.status) === "success" ? "Immutability verified" : "Immutability check failed"),
    checks: mapChecks(res.checks),
  };
}

export interface RepositoryPatch {
  name?: string;
  capacityGB?: number;
  compression?: "none" | "optimal" | "high";
  ioThrottleMBps?: number;
  maxConcurrentTasks?: number;
  maintenanceMode?: boolean;
  /** Object Lock. Sent as the appliance's strictly-paired block — mode "none"
   *  with 0 days turns it off, any other mode needs at least 1 day. */
  immutability?: RepositoryImmutability;
  /** An SMB repository's share. */
  share?: RepositoryShareInput;
}

/** An SMB repository's share as the appliance takes it: its server, share,
 *  username and password fields, where an empty username leaves the share to
 *  the inventory's account. The password goes only when one was typed, so an
 *  edit that leaves it blank keeps the stored one. */
function shareWireFields(share: RepositoryShareInput): Dict {
  const fields: Dict = { server: share.server, share: share.share, username: share.username ?? "" };
  if (share.password) fields.password = share.password;
  return fields;
}

export async function patchRepository(
  id: string,
  patch: RepositoryPatch,
): Promise<{ repository: Repository; immutabilityEffect: ImmutabilityEffect | null }> {
  // Name and Object Lock round-trip to the backend; the storage-management
  // fields (throttle, maintenance) have no orchestrator support yet.
  const body: Dict = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.immutability !== undefined) {
    body.immutability = {
      mode: patch.immutability.mode,
      retention_days:
        patch.immutability.mode === "none" ? 0 : patch.immutability.retentionDays,
    };
  }
  if (patch.share !== undefined) Object.assign(body, shareWireFields(patch.share));
  const updated = asDict(
    await request<Dict>(`/repositories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  );
  return {
    repository: mapRepository(updated),
    immutabilityEffect: mapImmutabilityEffect(updated.immutability_effect),
  };
}

export const deleteRepository = (id: string) => request<void>(`/repositories/${id}`, { method: "DELETE" });

export async function rescanRepository(id: string): Promise<Repository> {
  await request(`/repositories/${id}/rescan`, { method: "POST", body: "{}" }).catch(() => undefined);
  return mapRepository(asDict(await request<Dict>(`/repositories/${id}`)));
}

/**
 * Validate a repository that already exists — `POST /repositories/{id}/verify`.
 *
 * The whole repository, not just its lock: reachability, then (for S3 with
 * Object Lock on) that the bucket still supports the configured mode and
 * period, then a block-consistency pass over the backups it holds. This is
 * what "Repository validation results are displayed to the user" reads from.
 */
export async function verifyRepository(id: string): Promise<RepositoryValidationResult> {
  const res = asDict(await request<Dict>(`/repositories/${id}/verify`, { method: "POST", body: "{}" }));
  return {
    ok: str(res.status) === "success",
    message: str(res.message) || (str(res.status) === "success" ? "Repository verified" : "Repository check failed"),
    checks: mapChecks(res.checks),
  };
}

/**
 * Validate just the Object Lock configuration of an existing repository —
 * `POST /repositories/{id}/verify-immutability`.
 *
 * A stricter question than `verifyRepository` asks: this one WRITES a probe
 * object under the configured retention, reads its lock back and tries to
 * delete it, so it answers "will this bucket really hold a backup immutable"
 * rather than "does its configuration look right". It also returns the effect
 * report, which is where the console gets its account of what the current
 * setting does and does not cover.
 */
export async function verifyRepositoryImmutability(id: string): Promise<RepositoryValidationResult> {
  const res = asDict(
    await request<Dict>(`/repositories/${id}/verify-immutability`, { method: "POST", body: "{}" }),
  );
  return {
    ok: str(res.status) === "success",
    message:
      str(res.message) ||
      (str(res.status) === "success" ? "Immutability verified" : "Immutability check failed"),
    checks: mapChecks(res.checks),
    immutabilityEffect: mapImmutabilityEffect(res.immutability_effect),
  };
}

/**
 * Put the backups ALREADY stored in a repository under its current Object Lock
 * setting — `POST /repositories/{id}/apply-immutability`.
 *
 * This is the answer to "a repository containing existing backups without
 * immutability can be configured for immutability": changing the setting only
 * governs what is written after it, so without this the existing points stay
 * deletable forever. The lock it writes runs from NOW, not from each point's
 * own creation time.
 */
export async function applyRepositoryImmutability(id: string): Promise<ApplyImmutabilityResult> {
  const res = asDict(
    await request<Dict>(`/repositories/${id}/apply-immutability`, { method: "POST", body: "{}" }),
  );
  const days = Array.isArray(res.actual_retention_days) ? res.actual_retention_days : [];
  return {
    ok: str(res.status) === "success",
    message: str(res.message),
    immutability: mapImmutability(res.immutability) ?? { mode: "none", retentionDays: 0 },
    restorePointCount: num(res.restore_point_count),
    updatedRestorePoints: num(res.updated_restore_points),
    failedRestorePoints: num(res.failed_restore_points),
    actualRetentionDays: days.map((d) => num(d)).filter((d) => d > 0),
  };
}

export async function setRepositoryMaintenance(_id: string, _maintenance: boolean): Promise<Repository> {
  throw new ApiError(501, { error: "Repository maintenance mode is not available yet" });
}

/* ====================================================================== */
/* Mutations — alerts / threats / replication (WIP stubs)                  */
/* ====================================================================== */

export const markAlertRead = async (_id: string): Promise<void> => undefined;
export const markAllAlertsRead = async (): Promise<void> => undefined;
export const setThreatStatus = async (_id: string, _status: Threat["status"]): Promise<Threat> => {
  throw new ApiError(501, { error: "Threat management is not available yet" });
};
export const failoverReplica = async (_id: string, _planned: boolean, _pointId?: string): Promise<{ ok: true }> => {
  throw new ApiError(501, { error: "Replication is not available yet" });
};
export const failbackReplica = async (_id: string): Promise<{ ok: true }> => {
  throw new ApiError(501, { error: "Replication is not available yet" });
};
export const undoFailover = async (_id: string): Promise<{ ok: true }> => {
  throw new ApiError(501, { error: "Replication is not available yet" });
};

/* ====================================================================== */
/* Appliance settings / system ops (WIP stubs — no orchestrator support)   */
/* ====================================================================== */

const EMPTY_SETTINGS: ApplianceSettings = {
  general: {
    applianceName: "AltaStor",
    hostname: "altastor",
    organization: "",
    contactEmail: "",
    timezone: "UTC",
    timeFormat: "24h",
    dateFormat: "iso",
  },
  notifications: {
    email: {
      enabled: false,
      smtpHost: "",
      smtpPort: 587,
      encryption: "starttls",
      username: "",
      fromAddress: "",
      recipients: [],
    },
    webhooks: [],
    events: {
      jobFailure: true,
      jobSuccess: false,
      capacityWarning: true,
      restoreCompleted: true,
    },
  },
  security: {
    mfaRequired: false,
    sessionDurationSec: 3600,
    passwordMinLength: 12,
    auditRetentionDays: 90,
    autoLockThreatResponse: false,
  },
  storageDefaults: {
    compression: "optimal",
    dedup: true,
    gcSchedule: "daily",
    capacityWarnPct: 80,
    capacityCriticalPct: 92,
    archiveTierEnabled: false,
    archiveAfterDays: 30,
    globalThrottleMBps: 0,
  },
  network: { ipMode: "dhcp", address: "", gateway: "", dns: [], ntpServers: [], proxyUrl: "", managementPort: 443 },
  updates: { channel: "stable", autoCheck: true, autoInstall: false, maintenanceWindow: "02:00-04:00" },
  users: [],
  apiTokens: [],
};

/**
 * True while `getSettings`/`putSettings` below are stand-ins rather than real
 * calls — there is no settings endpoint on the orchestrator yet.
 *
 * This exists so the console can *say so*. Without it the two stubs are
 * indistinguishable from a working round trip: `getSettings` resolves, the
 * store records `syncStatus: "synced"`, and the page presents the constant
 * below as this appliance's configuration — an organization name, an SMTP
 * relay, a management port. `putSettings` then echoes its argument, so every
 * Save reports success and nothing leaves the browser; a reload silently
 * restores the constant. Flip this to `false` in the same commit that wires
 * the real endpoints and every notice keyed off it disappears.
 */
// Annotated `boolean` rather than left to infer the literal `true`: consumers
// branch on it, and a literal type makes the not-yet-live half of every branch
// look like dead code to the compiler.
export const SETTINGS_ARE_LOCAL_ONLY: boolean = true;

export const getSettings = async (): Promise<ApplianceSettings> => EMPTY_SETTINGS;
export const putSettings = async (settings: ApplianceSettings): Promise<ApplianceSettings> => settings;

/**
 * True while the appliance has no notification delivery at all — no relay, no
 * webhook dispatch, nothing that turns a stored preference into a message.
 * `testNotification` below refuses for exactly this reason.
 *
 * This exists so the Notifications section can *say so*. The per-event
 * switches read as a subscription — flip "Job failure" on and you have been
 * told a failure will reach you — when in truth the choice is only recorded.
 * Flip this to `false` in the same commit that wires real delivery and every
 * notice keyed off it disappears.
 */
export const NOTIFICATIONS_ARE_NOT_DELIVERED = true;

export interface TestNotificationResult {
  channel: "email" | "webhook";
  ok: boolean;
  detail: string;
  status?: number;
}
export const testNotification = async (
  channel: "email" | "webhook",
  _webhookId?: string,
): Promise<TestNotificationResult> => ({
  channel,
  ok: false,
  detail: "Notifications are not available yet",
});

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  upToDate: boolean;
  source: string;
  checkedAt: string;
  note?: string;
}
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const v = asDict(await request<Dict>("/system/version").catch(() => ({})));
  return {
    current: str(v.version) || "4.1.0",
    latest: null,
    upToDate: true,
    source: "orchestrator",
    checkedAt: new Date().toISOString(),
    note: "Update checks are not available yet",
  };
}
export const restartControlPlane = async (): Promise<{ ok: boolean; detail: string }> => ({
  ok: false,
  detail: "Not available yet",
});
export const resetAppliance = async (): Promise<{ status: string }> => ({ status: "unavailable" });
export async function getSupportBundle(): Promise<{ blob: Blob; filename: string }> {
  const res = asDict(await request<Dict>("/system/support-bundle", { method: "POST", body: "{}" }));
  const archiveBase64 = str(res.archive_base64);
  if (!archiveBase64) {
    throw new ApiError(502, { error: "The appliance returned an empty support bundle" });
  }
  const binary = atob(archiveBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return {
    blob: new Blob([bytes], { type: "application/zip" }),
    filename: `support-bundle-${fileStamp()}.zip`,
  };
}

/**
 * A password-encrypted copy of the appliance's catalog and configuration
 * (`POST /system/catalog-snapshot`).
 *
 * This is the console's key-escrow path. Job records and restore points carry
 * their encryption keys, and the snapshot carries the records — so an archive
 * taken today can hand the keys back after the appliance and its database are
 * gone, which is exactly the recovery the keys' normal home cannot survive.
 * The appliance never returns a bare key, and this does not either: the keys
 * are inside an archive only `password` opens.
 *
 * The password minimum matches the appliance's own (`MIN_PASSWORD_LENGTH`) —
 * it is all that protects the credentials in the archive.
 */
export async function exportCatalogSnapshot(
  password: string,
): Promise<{ blob: Blob; filename: string; counts: Record<string, number> }> {
  const res = asDict(
    await request<Dict>("/system/catalog-snapshot", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  );
  const archiveBase64 = str(res.archive_base64);
  if (!archiveBase64) {
    throw new ApiError(502, { error: "The appliance returned an empty catalog export" });
  }
  const binary = atob(archiveBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const manifest = asDict(res.manifest);
  const rawCounts = asDict(manifest.counts);
  const counts: Record<string, number> = {};
  for (const [table, value] of Object.entries(rawCounts)) counts[table] = num(value, 0);
  return {
    blob: new Blob([bytes], { type: "application/octet-stream" }),
    filename: `altastor-catalog-${fileStamp()}.abrsnap`,
    counts,
  };
}

export interface AuditQuery {
  category?: string;
  severity?: string;
  actor?: string;
  limit?: number;
}

/* ---- Setup / provisioning (WIP: no first-boot flow on this backend) ---- */

export interface ApplianceServiceInfo {
  name: string;
  status: "running" | "degraded" | "stopped";
  pid: number;
  uptimeSec: number;
}
export interface ApplianceInfo {
  hostname: string;
  version: string;
  os: string;
  kernel: string;
  mgmtIp: string;
  uptimeSec: number;
  cpuCores: number;
  memoryGB: number;
  cpuUsagePct: number;
  memUsagePct: number;
  services: ApplianceServiceInfo[];
  ntpSynced: boolean;
}
export type ProvisioningStage =
  | "unconfigured"
  | "network"
  | "storage-layout"
  | "pool"
  | "repository"
  | "hypervisors"
  | "policies"
  | "complete";
export interface ProvisioningStatus {
  stage: ProvisioningStage;
  completedStages: ProvisioningStage[];
  manifestApplied: boolean;
  progress: number;
  startedAt: string | null;
  finishedAt: string | null;
  log: LogLine[];
}
export type DiskMedia = "nvme" | "ssd" | "hdd";
export type DiskStatus = "healthy" | "failing" | "failed" | "spare" | "unassigned";
export interface PhysicalDisk {
  id: string;
  slot: string;
  model: string;
  serial: string;
  media: DiskMedia;
  capacityGB: number;
  status: DiskStatus;
  arrayId: string | null;
  temperatureC: number;
  powerOnHours: number;
  smartErrors: number;
}
export type RaidLevel = "raid1" | "raid5" | "raid6" | "raid10";
export interface ManifestArraySpec {
  name: string;
  level: RaidLevel;
  media: DiskMedia;
  diskCount: number;
  spares: number;
}
export interface ApplianceManifest {
  hostname: string;
  network: { mode: "dhcp" } | { mode: "static"; address: string; gateway: string; dns: string[] };
  storage: { layout: "auto" | ManifestArraySpec[] };
  repository: {
    name: string;
    encryption: boolean;
  };
  hypervisors: Array<{ type: EnvironmentType; endpoint: string; username: string; credentialRef: string }>;
  defaultPolicy: { scheduleAt: string; keepPoints: number; tag?: string } | null;
}

function mapSystemClock(res: Dict): SystemClockStatus {
  return {
    blocked: res.blocked === true,
    serverTime: str(res.server_time),
    lastKnownAt: str(res.last_known_at) || null,
    detectedAt: str(res.detected_at) || null,
    lastTrustedAt: str(res.last_trusted_at) || null,
    jumpSeconds: num(res.jump_seconds),
    source: str(res.source) || null,
    thresholdHours: num(res.threshold_hours),
    confirmedAt: str(res.confirmed_at) || null,
    confirmedBy: str(res.confirmed_by) || null,
    message: str(res.message) || null,
  };
}

export async function getSystemClock(): Promise<SystemClockStatus> {
  return mapSystemClock(asDict(await request<Dict>("/system/clock")));
}

export async function confirmSystemClock(): Promise<SystemClockStatus> {
  return mapSystemClock(asDict(await request<Dict>("/system/clock/confirm", { method: "POST" })));
}

export async function getSystemInfo(): Promise<ApplianceInfo> {
  const res = asDict(await request<Dict>("/system/info"));
  return {
    hostname: str(res.hostname),
    version: str(res.version) || "4.1.0",
    os: str(res.os),
    kernel: str(res.kernel),
    mgmtIp: "",
    uptimeSec: num(res.uptime_sec),
    cpuCores: num(res.cpu_cores),
    memoryGB: num(res.memory_gb),
    cpuUsagePct: 0,
    memUsagePct: 0,
    services: [],
    ntpSynced: true,
  };
}

/* ---------------------------- HTTPS certificate --------------------------- */

/** Something about the served certificate a browser would object to. `code`
 *  is what the console translates; `message` is the appliance's own English
 *  wording, the fallback for a code this build doesn't know. */
export interface TlsCertificateWarning {
  code: string;
  message: string;
  daysRemaining?: number;
  applianceNames?: string[];
}

/** The certificate the console and REST API are served over HTTPS with
 *  (`GET /system/tls-certificate`). */
export interface TlsCertificate {
  /** "generated": the appliance's own self-signed certificate, renewed
   *  automatically. "administrator": installed by an administrator (or placed
   *  over the certificate files by hand) and never renewed or replaced. */
  source: "generated" | "administrator";
  autoRenew: boolean;
  subject: string;
  commonName: string | null;
  issuer: string;
  issuerCommonName: string | null;
  selfSigned: boolean;
  dnsNames: string[];
  ipAddresses: string[];
  serialNumber: string;
  fingerprintSha256: string;
  keyType: string;
  notBefore: string;
  notAfter: string;
  daysRemaining: number;
  expired: boolean;
  /** Certificates in the served file: the server certificate plus intermediates. */
  chainLength: number;
  installedAt: string | null;
  installedBy: string | null;
  /** The server can swap certificates without a restart. False only when the
   *  API runs without its HTTPS entry point (dev setups). */
  liveReload: boolean;
  /** Set on install/revert: the new certificate is already being served. */
  reloaded?: boolean;
  warnings: TlsCertificateWarning[];
}

export interface TlsCertificateInput {
  certificate: string;
  privateKey: string;
  passphrase?: string;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function mapTlsCertificate(raw: unknown): TlsCertificate {
  const r = asDict(raw);
  return {
    source: r.source === "administrator" ? "administrator" : "generated",
    autoRenew: Boolean(r.auto_renew),
    subject: str(r.subject),
    commonName: strOrNull(r.common_name),
    issuer: str(r.issuer),
    issuerCommonName: strOrNull(r.issuer_common_name),
    selfSigned: Boolean(r.self_signed),
    dnsNames: strList(r.dns_names),
    ipAddresses: strList(r.ip_addresses),
    serialNumber: str(r.serial_number),
    fingerprintSha256: str(r.fingerprint_sha256),
    keyType: str(r.key_type),
    notBefore: str(r.not_before),
    notAfter: str(r.not_after),
    daysRemaining: num(r.days_remaining),
    expired: Boolean(r.expired),
    chainLength: num(r.chain_length, 1),
    installedAt: strOrNull(r.installed_at),
    installedBy: strOrNull(r.installed_by),
    liveReload: Boolean(r.live_reload),
    reloaded: typeof r.reloaded === "boolean" ? r.reloaded : undefined,
    warnings: (Array.isArray(r.warnings) ? r.warnings : []).map((w) => {
      const d = asDict(w);
      return {
        code: str(d.code),
        message: str(d.message),
        daysRemaining: typeof d.days_remaining === "number" ? d.days_remaining : undefined,
        applianceNames: Array.isArray(d.appliance_names) ? strList(d.appliance_names) : undefined,
      };
    }),
  };
}

export async function getTlsCertificate(): Promise<TlsCertificate> {
  return mapTlsCertificate(await request<Dict>("/system/tls-certificate"));
}

/** Replace the served certificate. A 422 names the offending input in
 *  `error.details.field` ("certificate" | "private_key" | "passphrase"). */
export async function installTlsCertificate(input: TlsCertificateInput): Promise<TlsCertificate> {
  const body: Dict = { certificate: input.certificate, private_key: input.privateKey };
  if (input.passphrase) body.passphrase = input.passphrase;
  return mapTlsCertificate(
    await request<Dict>("/system/tls-certificate", { method: "PUT", body: JSON.stringify(body) }),
  );
}

/** Drop the administrator's certificate; the appliance generates a self-signed one. */
export async function revertTlsCertificate(): Promise<TlsCertificate> {
  return mapTlsCertificate(await request<Dict>("/system/tls-certificate", { method: "DELETE" }));
}

/** The input field a certificate install was refused over, when the appliance said. */
export function tlsCertificateErrorField(err: unknown): "certificate" | "privateKey" | "passphrase" | null {
  if (!(err instanceof ApiError)) return null;
  const details = asDict(asDict(asDict(err.body).error).details);
  switch (details.field) {
    case "certificate":
      return "certificate";
    case "private_key":
      return "privateKey";
    case "passphrase":
      return "passphrase";
    default:
      return null;
  }
}

// The console is already provisioned against a running orchestrator, so the
// setup wizard never engages (stage is always "complete").
export const getProvisioning = async (): Promise<ProvisioningStatus> => ({
  stage: "complete",
  completedStages: ["network", "storage-layout", "pool", "repository", "hypervisors", "policies", "complete"],
  manifestApplied: true,
  progress: 100,
  startedAt: null,
  finishedAt: null,
  log: [],
});
export const getProvisionPlan = async (): Promise<{ layout: ManifestArraySpec[]; notes?: string[] }> => ({ layout: [] });
export const applyProvisioning = async (_manifest: ApplianceManifest): Promise<{ status: string }> => ({
  status: "complete",
});
export const listStorageDisks = async (): Promise<PhysicalDisk[]> => [];

/** Re-scan a vSphere inventory (maps to the orchestrator's rescan). */
export async function refreshEnvironment(
  envId: string,
): Promise<{ status: string; added: number; removed: number; total: number }> {
  const res = asDict(await request<Dict>(`/inventories/${envId}/rescan`, { method: "POST", body: "{}" }));
  const discovery = asDict(res.discovery);
  return { status: "ok", added: 0, removed: 0, total: num(discovery.vm_count) };
}

/**
 * One cheap request whose only job is to answer "is an appliance there, and is
 * its API version compatible with this console".
 *
 * Used on the sign-in screen, where there is no session and so no data the
 * console is allowed to fetch — but where reachability still has to be settled,
 * because an unreachable appliance is what sends the console to the demo world
 * (and a demo world is the only place the sign-in form can be answered at all).
 *
 * A 401 is a SUCCESSFUL probe: the appliance answered, it just doesn't know
 * this caller. `checkApiVersion` reads the version header off that same 401
 * response, so an incompatible build is still caught here and rethrown.
 */
export async function probeAppliance(): Promise<void> {
  try {
    await request<Dict>("/system/version");
  } catch (err) {
    // A version mismatch is raised as an ApiError too, and it is the one kind
    // the caller must NOT read as a clean probe — the console and the appliance
    // cannot work together, which is a standing condition, not a 401.
    if (err instanceof ApiError && !isVersionMismatchError(err)) return;
    throw err; // incompatible, or network/DNS/TLS — nothing usable is listening
  }
}

/* ====================================================================== */
/* Live events → polling (no SSE on this backend)                          */
/* ====================================================================== */

export interface ApplianceEventMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Poll-based stand-in for the appliance event stream. The Python orchestrator
 * exposes no SSE, so instead of relaying push events we re-hydrate the whole
 * world on a cadence: `onOpen` (which the live driver wires to a full
 * re-hydrate) fires immediately, then repeats — fast while any session is
 * active, slow when idle. `onEvent` is unused (there is nothing to push).
 */
export function subscribeEvents(
  onEvent: (ev: ApplianceEventMessage) => void,
  onOpen?: () => void,
  onError?: () => void,
): () => void {
  void onEvent;
  const ACTIVE_MS = 2500;
  const IDLE_MS = 8000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = (): void => {
    if (stopped) return;
    try {
      onOpen?.();
    } catch {
      onError?.();
    }
    const sessions = useWorldStore.getState().sessions;
    const active = sessions.some((s) => s.status === "running" || s.status === "queued");
    timer = setTimeout(tick, active ? ACTIVE_MS : IDLE_MS);
  };

  // Kick off on the next macrotask so the driver finishes wiring first.
  timer = setTimeout(tick, 0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

export { ApiError, apiErrorMessage, apiErrorCode, isVersionMismatchError };
