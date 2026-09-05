// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The "live" world driver — the console as a client of the AltaStor appliance.
 *
 * Hydrates the full world over REST on every SSE (re)connect — the stream is
 * stateless, so a reconnect refetches whatever was missed — then keeps it
 * fresh from the event stream: per-entity fetches are coalesced per
 * (event type + id) so a burst collapses into one request per entity,
 * revision bumps are throttled to once per second so query invalidation
 * doesn't storm, and `session.log` lines stream straight into `liveLogs`
 * with no fetch at all. Mutations go through the HTTP API with optimistic
 * local patches wherever the sim driver was instant; SSE reconciles.
 */
import * as api from "@/services/api.http";
import type { ApplianceEventMessage } from "@/services/api.http";
import type { BackupJob, LogLine, Session, VM } from "@/types";
import type {
  BlockingJobRef,
  EnvDeleteResult,
  RepoDeleteResult,
  RestorePointDeleteResult,
  WorldActions,
  WorldDriver,
  WorldHandle,
} from "@/store/world.types";
import { applyReadState, persistAllAlertsRead, persistAlertRead } from "@/store/notifications.persist";
import { segmentChainPoints } from "@/lib/restore-points";
import { restoreRunName } from "@/lib/format";

/** Debounce window for per-(event, id) fetch coalescing. */
const COALESCE_MS = 300;
/** Minimum spacing between SSE-driven revision bumps (query invalidation). */
const REVISION_THROTTLE_MS = 1000;
/** Per-session live-log cap — matches the sim driver and the appliance. */
const LOG_CAP = 400;

/** Extracts the blocking-job list from a 409 `{error:{details:{jobs}}}` body
 *  (see remove_inventory_record / remove_repository_record in abr_v41.py). */
function blockingJobsFromApiError(body: unknown): BlockingJobRef[] {
  const details = (body as { error?: { details?: { jobs?: unknown } } } | null)?.error?.details;
  const rawJobs = details?.jobs;
  if (!Array.isArray(rawJobs)) return [];
  return rawJobs
    .filter((job): job is Record<string, unknown> => !!job && typeof job === "object")
    .map((job) => ({ id: String(job.id ?? ""), name: String(job.name ?? "") || "Job" }));
}

/* ------------------------------ log lines ------------------------------- */
/** Wire shape of a log line (`getSessionLog` and `session.log` events). */
interface RawLogLine {
  id: string;
  ts: string;
  level: string;
  message: string;
  vmName?: string;
}

const LOG_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error", "success"]);

function toLogLine(raw: RawLogLine): LogLine {
  return {
    id: raw.id,
    ts: raw.ts,
    level: LOG_LEVELS.has(raw.level) ? (raw.level as LogLine["level"]) : "info",
    message: raw.message,
    vmName: raw.vmName,
  };
}

function isRawLogLine(v: unknown): v is RawLogLine {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.ts === "string" &&
    typeof l.level === "string" &&
    typeof l.message === "string" &&
    (l.vmName === undefined || typeof l.vmName === "string")
  );
}

/** Read a string id field off an event payload without trusting the wire. */
function eventId(ev: ApplianceEventMessage, key: string): string | null {
  const v = ev[key];
  return typeof v === "string" ? v : null;
}

/**
 * Fallback naming for restore sessions the orchestrator couldn't name itself.
 *
 * A restore carries no job, so mapSession names it from the task's own
 * `vm_name`/`source_vm_name` (see _session_vm_names in abr_v41.py). Sessions
 * recorded before those fields existed have neither, and fall back to the
 * bare "Restore" label — for those, resolve the VM name from the hydrated
 * inventory here, where both the session and the vms list are in hand.
 *
 * Sessions the orchestrator DID name are left untouched: overwriting a real
 * target VM name ("testVM-restore") with the source VM's inventory name would
 * undo the correct naming mapSession already applied.
 */
function withRestoreVmName(session: Session, vms: VM[]): Session {
  if (session.type !== "restore") return session;
  const result = session.vmResults[0];
  if (result?.vmName && result.vmName !== result.vmId) return session;
  const vmName = vms.find((v) => v.id === result?.vmId)?.name;
  if (!vmName) return session;
  return {
    ...session,
    jobName: restoreRunName(vmName),
    vmResults: session.vmResults.map((r) => (r === result ? { ...r, vmName } : r)),
  };
}

/** Only the CreateJobInput-shaped fields of a job patch go over the wire. */
function toJobPatchPayload(patch: Partial<BackupJob>): Partial<api.CreateJobPayload> {
  const out: Partial<api.CreateJobPayload> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.type !== undefined) out.type = patch.type;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.vmIds !== undefined) out.vmIds = patch.vmIds;
  if (patch.scopeSummary !== undefined) out.scopeSummary = patch.scopeSummary;
  if (patch.repositoryId !== undefined) out.repositoryId = patch.repositoryId;
  if (patch.schedule !== undefined) out.schedule = patch.schedule;
  if (patch.retention !== undefined) out.retention = patch.retention;
  if (patch.options !== undefined) out.options = patch.options;
  if (patch.accent !== undefined) out.accent = patch.accent;
  if (patch.replicaTarget !== undefined) out.replicaTarget = patch.replicaTarget;
  return out;
}

/* -------------------------------- driver -------------------------------- */
export function createLiveDriver(handle: WorldHandle): WorldDriver {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  const coalesceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let revisionTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRevisionAt = 0;
  let failureStreak = 0;
  let hydrateInFlight: Promise<void> | null = null;

  /**
   * The appliance only ever reports cumulative bytes transferred (see
   * mapSession's processed_bytes/transferred_bytes comment) — never a rate —
   * so live MB/s is derived here from consecutive samples as each session is
   * refetched (subscribeEvents is a poll, see api.http.ts, so this fires on
   * that cadence). First sample for a session has no prior point to diff
   * against and stays at mapSession's 0, matching the "no rate yet" state
   * ActiveRunPanel already renders as "preparing". Once a session finishes,
   * the instantaneous rate is replaced by the whole run's average — the same
   * transferredGB/durationSec math world.sim.ts uses at completion — so
   * LastRunSummary's "avg" figure and CreateJobPage's ETA estimate (both read
   * throughputMBps off finished sessions) get a real number instead of 0.
   *
   * The appliance updates `transferred_bytes` in bursts, not continuously —
   * `vcenter_backup.py` only recomputes it once a whole disk finishes writing,
   * which for a single large disk can be the entire run. Diffing consecutive
   * polls naively would show 0 MB/s for every poll in between and only a
   * single spike at the instant a disk completes, which reads as "stuck at
   * 0". Instead the sample anchor only advances when a real delta is seen, so
   * the eventual jump is averaged over the full time since the last one
   * (still an honest rate), and the computed rate is *held* — not reset to
   * mapSession's 0 — on ticks where no new bytes have landed yet.
   */
  interface RateSample {
    gb: number;
    at: number;
    mbps: number;
  }

  /**
   * One counter's running rate. The anchor in `samples` only advances when the
   * counter actually moves, so a jump is averaged over the whole time since it
   * last did (still an honest rate) and the previous rate is HELD on ticks
   * where nothing new landed. A first sample has nothing to diff and reads 0.
   */
  const advanceRate = (samples: Map<string, RateSample>, key: string, gb: number, now: number): number => {
    const prev = samples.get(key);
    if (!prev) {
      samples.set(key, { gb, at: now, mbps: 0 });
      return 0;
    }
    const deltaGB = gb - prev.gb;
    if (deltaGB <= 0) return prev.mbps;
    const dtSec = (now - prev.at) / 1000;
    const mbps = dtSec > 0 ? Math.round((deltaGB * 1024) / dtSec) : prev.mbps;
    samples.set(key, { gb, at: now, mbps });
    return mbps;
  };

  // Two independent counters, two independent rates — they measure different
  // stages and are NOT interchangeable: processedGB is guest bytes READ off the
  // source, transferredGB is what actually landed in the repository (smaller,
  // after compression + dedup). Labelling one with the other's number is how
  // "Guest read rate" ended up reporting the repo write rate.
  const throughputSamples = new Map<string, RateSample>();
  const guestReadSamples = new Map<string, RateSample>();
  const withThroughput = (session: Session): Session => {
    if (session.status !== "running") {
      throughputSamples.delete(session.id);
      guestReadSamples.delete(session.id);
      const finished: Session = { ...session };
      if (session.durationSec > 0) {
        if (session.transferredGB > 0) {
          finished.throughputMBps = Math.round((session.transferredGB * 1024) / session.durationSec);
        }
        if (session.processedGB > 0) {
          finished.guestReadMBps = Math.round((session.processedGB * 1024) / session.durationSec);
        }
      }
      return finished;
    }
    const now = Date.now();
    return {
      ...session,
      throughputMBps: advanceRate(throughputSamples, session.id, session.transferredGB, now),
      guestReadMBps: advanceRate(guestReadSamples, session.id, session.processedGB, now),
    };
  };

  /* --------------------------- bump plumbing ---------------------------- */
  const bumpTick = (): void => {
    handle.set((s) => ({ tickCount: s.tickCount + 1 }));
  };

  /** Throttled structural bump: at most one per REVISION_THROTTLE_MS. */
  const bumpRevision = (): void => {
    if (revisionTimer !== null) return; // a bump is already pending
    const wait = Math.max(0, lastRevisionAt + REVISION_THROTTLE_MS - Date.now());
    if (wait === 0) {
      lastRevisionAt = Date.now();
      handle.set((s) => ({ revision: s.revision + 1 }));
      return;
    }
    revisionTimer = setTimeout(() => {
      revisionTimer = null;
      lastRevisionAt = Date.now();
      handle.set((s) => ({ revision: s.revision + 1 }));
    }, wait);
  };

  /* ------------------------ connectivity tracking ----------------------- */
  const noteFetchOk = (): void => {
    failureStreak = 0;
  };

  /**
   * Network-level refresh failure. A single miss is retried on the next
   * event; two in a row mean the appliance is genuinely unreachable —
   * `onOpen`'s rehydrate flips `connected` back once SSE reconnects.
   */
  const noteFetchFailure = (): void => {
    failureStreak += 1;
    if (failureStreak >= 2 && !stopped) handle.set({ connected: false });
  };

  /** An ApiError means the appliance answered — connectivity is fine. */
  const fetchFailed = (err: unknown): void => {
    if (err instanceof api.ApiError) {
      noteFetchOk();
      return;
    }
    noteFetchFailure();
  };

  /* ----------------------------- coalescing ----------------------------- */
  const coalesce = (key: string, run: () => void): void => {
    const pending = coalesceTimers.get(key);
    if (pending !== undefined) clearTimeout(pending);
    coalesceTimers.set(
      key,
      setTimeout(() => {
        coalesceTimers.delete(key);
        run();
      }, COALESCE_MS),
    );
  };

  /* ------------------------------ hydrate ------------------------------- */
  const hydrate = async (): Promise<void> => {
    const [
      environments,
      hosts,
      vms,
      jobs,
      sessions,
      restorePoints,
      repositories,
      alerts,
      threats,
      auditEvents,
      metricsHistory,
      replicas,
    ] = await Promise.all([
      api.listEnvironments(),
      api.listHosts(),
      api.listVms(),
      api.listJobs(),
      api.listSessions(),
      api.listRestorePoints(),
      api.listRepositories(),
      api.listAlerts(),
      api.listThreats(),
      api.listAuditEvents({ limit: 500 }).catch(() => []),
      api.getMetricsHistory(90).catch(() => []),
      api.listReplicas().catch(() => []),
    ]);
    const namedSessions = sessions.map((s) => withThroughput(withRestoreVmName(s, vms)));
    // api.listJobs no longer fetches the session list itself (it used to, which
    // meant every poll pulled the whole history twice) — attach each job's run
    // history from the list this hydrate already has.
    const jobsWithRuns = api.withJobRunStats(jobs, namedSessions);
    // Logs only for sessions still running — finished ones lazy-load on demand.
    const running = namedSessions.filter((s) => s.status === "running");
    const logs = await Promise.all(
      running.map(async (s) => {
        const lines = await api
          .getSessionLog(s.id)
          .then((r) => r.lines.map(toLogLine))
          .catch(() => [] as LogLine[]); // one missing log must not fail hydrate
        return [s.id, lines] as const;
      }),
    );
    if (stopped) return;
    failureStreak = 0;
    handle.set((s) => {
      // Merge, don't replace: session.log events stream on the same connection
      // while hydrate is in flight — lines that landed after each snapshot was
      // fetched must survive, and finished sessions keep their buffered logs.
      const liveLogs: Record<string, LogLine[]> = { ...s.liveLogs };
      for (const [sessionId, lines] of logs) {
        const fetched = new Set(lines.map((l) => l.id));
        const streamed = (s.liveLogs[sessionId] ?? []).filter((l) => !fetched.has(l.id));
        liveLogs[sessionId] = [...lines, ...streamed].slice(-LOG_CAP);
      }
      return {
      environments,
      hosts,
      vms,
      jobs: jobsWithRuns,
      sessions: namedSessions,
      restorePoints,
      repositories,
      alerts: applyReadState(alerts),
      threats,
        auditEvents,
        metricsHistory,
        replicas,
        liveLogs,
        mode: "live" as const,
        connected: true,
        ready: true,
        revision: s.revision + 1,
      };
    });
  };

  /** Concurrent hydrate requests (start + first onOpen) share one flight. */
  const runHydrate = (): Promise<void> => {
    hydrateInFlight ??= hydrate().finally(() => {
      hydrateInFlight = null;
    });
    return hydrateInFlight;
  };

  /* ----------------------------- refreshers ----------------------------- */
  const refreshSession = async (sessionId: string): Promise<void> => {
    try {
      const rawSession = await api.getSession(sessionId);
      noteFetchOk();
      if (stopped) return;
      let prepended = false;
      handle.set((s) => {
        const session = withThroughput(withRestoreVmName(rawSession, s.vms));
        const idx = s.sessions.findIndex((x) => x.id === sessionId);
        if (idx === -1) {
          prepended = true; // a run started server-side — structural
          return { sessions: [session, ...s.sessions] };
        }
        const sessions = [...s.sessions];
        sessions[idx] = session;
        return { sessions };
      });
      if (prepended) bumpRevision();
      else bumpTick(); // progress on a known session is high-frequency
    } catch (err) {
      fetchFailed(err);
    }
  };

  const refreshJob = async (jobId: string): Promise<void> => {
    try {
      const job = await api.getJob(jobId);
      noteFetchOk();
      if (stopped) return;
      handle.set((s) => {
        const idx = s.jobs.findIndex((j) => j.id === jobId);
        if (idx === -1) return { jobs: [job, ...s.jobs] };
        const jobs = [...s.jobs];
        jobs[idx] = job;
        return { jobs };
      });
      bumpRevision();
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 404) {
        // Deleted server-side — the 404 is the deletion signal.
        noteFetchOk();
        if (stopped) return;
        handle.set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId) }));
        bumpRevision();
        return;
      }
      fetchFailed(err);
    }
  };

  const refreshVm = async (vmId: string): Promise<void> => {
    try {
      const vm = await api.getVM(vmId);
      noteFetchOk();
      if (stopped) return;
      handle.set((s) => {
        const idx = s.vms.findIndex((v) => v.id === vmId);
        if (idx === -1) return { vms: [...s.vms, vm] }; // e.g. a restore clone
        const vms = [...s.vms];
        vms[idx] = vm;
        return { vms };
      });
      bumpRevision();
    } catch (err) {
      fetchFailed(err);
    }
  };

  /** Replace one VM's restore points; every other VM's stay untouched. */
  const refreshVmRestorePoints = async (vmId: string): Promise<void> => {
    try {
      const points = await api.listRestorePoints(vmId);
      noteFetchOk();
      if (stopped) return;
      handle.set((s) => ({
        restorePoints: [...points, ...s.restorePoints.filter((p) => p.vmId !== vmId)],
      }));
      bumpRevision();
    } catch (err) {
      fetchFailed(err);
    }
  };

  const refreshRepositories = async (): Promise<void> => {
    try {
      const repositories = await api.listRepositories();
      noteFetchOk();
      if (stopped) return;
      // Usage ticks are high-frequency and the list is 4 rows — no invalidation.
      handle.set((s) => ({ repositories, tickCount: s.tickCount + 1 }));
    } catch (err) {
      fetchFailed(err);
    }
  };

  const refreshAlerts = async (): Promise<void> => {
    try {
      const alerts = await api.listAlerts();
      noteFetchOk();
      if (stopped) return;
      handle.set({ alerts: applyReadState(alerts) });
      bumpRevision();
    } catch (err) {
      fetchFailed(err);
    }
  };

  const refreshThreats = async (): Promise<void> => {
    try {
      const threats = await api.listThreats();
      noteFetchOk();
      if (stopped) return;
      handle.set({ threats });
      bumpRevision();
    } catch (err) {
      fetchFailed(err);
    }
  };

  const refreshAudit = async (): Promise<void> => {
    try {
      const auditEvents = await api.listAuditEvents({ limit: 500 });
      noteFetchOk();
      if (stopped) return;
      handle.set({ auditEvents });
      bumpRevision();
    } catch (err) {
      fetchFailed(err);
    }
  };

  const refreshReplicas = async (): Promise<void> => {
    try {
      const replicas = await api.listReplicas();
      noteFetchOk();
      if (stopped) return;
      // Replica sync state polls are high-frequency — no query invalidation, just a tick.
      handle.set((s) => ({ replicas, tickCount: s.tickCount + 1 }));
    } catch (err) {
      fetchFailed(err);
    }
  };

  const refreshEnvironments = async (): Promise<void> => {
    try {
      const [environments, hosts] = await Promise.all([api.listEnvironments(), api.listHosts()]);
      noteFetchOk();
      if (stopped) return;
      handle.set({ environments, hosts });
      bumpRevision();
    } catch (err) {
      fetchFailed(err);
    }
  };

  /** Refresh everything derived from inventory: environments, hosts, and VMs. */
  const refreshInventory = async (): Promise<void> => {
    try {
      const [environments, hosts, vms] = await Promise.all([
        api.listEnvironments(),
        api.listHosts(),
        api.listVms(),
      ]);
      noteFetchOk();
      if (stopped) return;
      handle.set({ environments, hosts, vms });
      bumpRevision();
    } catch (err) {
      fetchFailed(err);
    }
  };

  /* --------------------------- event dispatch --------------------------- */
  const onEvent = (ev: ApplianceEventMessage): void => {
    if (stopped) return;
    switch (ev.type) {
      case "session.log": {
        const sessionId = eventId(ev, "sessionId");
        const line: unknown = ev.line;
        if (sessionId === null || !isRawLogLine(line)) return;
        const logLine = toLogLine(line);
        handle.set((s) => ({
          liveLogs: {
            ...s.liveLogs,
            [sessionId]: [...(s.liveLogs[sessionId] ?? []), logLine].slice(-LOG_CAP),
          },
          tickCount: s.tickCount + 1,
        }));
        return;
      }
      case "session.updated": {
        const id = eventId(ev, "sessionId");
        if (id !== null) coalesce(`session:${id}`, () => void refreshSession(id));
        return;
      }
      case "job.updated": {
        const id = eventId(ev, "jobId");
        if (id !== null) coalesce(`job:${id}`, () => void refreshJob(id));
        return;
      }
      case "vm.updated": {
        const id = eventId(ev, "vmId");
        if (id !== null) coalesce(`vm:${id}`, () => void refreshVm(id));
        return;
      }
      case "restore-point.created":
      case "restore-point.updated": {
        const vmId = eventId(ev, "vmId");
        if (vmId !== null) coalesce(`rp:${vmId}`, () => void refreshVmRestorePoints(vmId));
        return;
      }
      case "restore-point.deleted": {
        const id = eventId(ev, "restorePointId");
        if (id === null) return;
        handle.set((s) => ({ restorePoints: s.restorePoints.filter((p) => p.id !== id) }));
        bumpRevision();
        return;
      }
      case "repository.updated": {
        coalesce("repositories", () => void refreshRepositories());
        return;
      }
      case "repository.deleted": {
        const id = eventId(ev, "repositoryId");
        if (id === null) return;
        handle.set((s) => ({ repositories: s.repositories.filter((r) => r.id !== id) }));
        bumpRevision();
        return;
      }
      case "audit.created": {
        coalesce("audit", () => void refreshAudit());
        return;
      }
      case "replica.updated": {
        coalesce("replicas", () => void refreshReplicas());
        return;
      }
      case "alert.created": {
        coalesce("alerts", () => void refreshAlerts());
        return;
      }
      case "threat.updated": {
        coalesce("threats", () => void refreshThreats());
        return;
      }
      case "environment.updated": {
        coalesce("environments", () => void refreshEnvironments());
        return;
      }
      default:
        // restore.updated / storage.* / tiering.move / provisioning.updated — no UI yet.
        return;
    }
  };

  /* ------------------------------ lifecycle ----------------------------- */
  const stop = (): void => {
    stopped = true;
    unsubscribe?.();
    unsubscribe = null;
    for (const t of coalesceTimers.values()) clearTimeout(t);
    coalesceTimers.clear();
    if (revisionTimer !== null) {
      clearTimeout(revisionTimer);
      revisionTimer = null;
    }
  };

  const start = async (): Promise<void> => {
    stopped = false;
    unsubscribe ??= api.subscribeEvents(
      onEvent,
      () => {
        // Every (re)connect rehydrates in full: the stream is stateless, so
        // this is how missed events are recovered and `connected` flips back.
        runHydrate().catch(() => {
          if (!stopped) handle.set({ connected: false });
        });
      },
      () => {
        // Stream dropped (appliance down / network). EventSource retries on
        // its own; surface the outage now — a silent stream means no fetches,
        // so nothing else would ever flip `connected` off.
        if (!stopped && handle.get().connected) handle.set({ connected: false });
      },
    );
    try {
      // Don't wait for onOpen — if the appliance is down, EventSource retries
      // silently forever; this direct hydrate is the reject-fast path.
      await runHydrate();
    } catch (err) {
      if (api.isVersionMismatchError(err)) {
        // Incompatible major API version — this can surface with any HTTP
        // status (whichever response happened to win the one-shot check),
        // so it must be tested before the 401 branch below or it risks being
        // mistaken for an ordinary "please sign in" case and shown no error.
        stop();
        throw err;
      }
      if (err instanceof api.ApiError && err.status === 401) {
        // The appliance answered — it just doesn't recognize this session
        // (no/expired token). That's not "unreachable": don't fall back to
        // the demo simulation and mask a real console behind fake data.
        // AppShell's auth gate sends the visitor to /login; the poller above
        // keeps retrying on its own cadence and will populate real data the
        // moment a session exists (login() also forces an immediate refresh
        // — see store/auth.ts — so this doesn't have to be fast).
        if (!stopped) handle.set({ ready: true, connected: true });
        return;
      }
      stop(); // facade falls back to sim
      throw err;
    }
  };

  /* ------------------------------- actions ------------------------------ */
  const actions: WorldActions = {
    runJob: async (jobId, _triggeredBy, forceFull) => {
      try {
        const { sessionId } = await api.runJob(jobId, { forceFull });
        // The sim and server worlds share entity ids — a continuation landing
        // after a mode switch would corrupt the successor world.
        if (stopped) return sessionId;
        handle.set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === jobId ? { ...j, state: "running" as const, lastStatus: "running" as const } : j,
          ),
          revision: s.revision + 1,
        }));
        return sessionId;
      } catch (err) {
        // Whatever the reason — 409 already-running, 404 unknown, 5xx, or a
        // dead network — the run did NOT start, and null is the call sites'
        // contract for that. Rethrowing would only produce unhandled
        // rejections in handlers that (correctly) don't expect network errors.
        console.warn("[world.live] runJob failed:", err);
        return null;
      }
    },

    createJob: async (input) => {
      const job = await api.createJob(input); // payload = input verbatim (incl. runNow)
      if (stopped) return job;
      handle.set((s) => ({
        jobs: [job, ...s.jobs.filter((j) => j.id !== job.id)],
        revision: s.revision + 1,
      }));
      return job;
    },

    updateJob: async (jobId, patch) => {
      const job = await api.updateJob(jobId, toJobPatchPayload(patch));
      if (stopped) return;
      handle.set((s) => ({
        jobs: s.jobs.map((j) => (j.id === jobId ? job : j)),
        revision: s.revision + 1,
      }));
    },

    setJobEnabled: async (jobId, enabled) => {
      const current = handle.get().jobs.find((j) => j.id === jobId);
      if (!current) return;
      // Optimistic flip; the server recomputes nextRunAt and job.updated
      // delivers it — until then a re-enabled job keeps its stale value.
      handle.set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                state: enabled ? ("idle" as const) : ("disabled" as const),
                nextRunAt: enabled ? j.nextRunAt : null,
              }
            : j,
        ),
        revision: s.revision + 1,
      }));
      try {
        await api.setJobEnabled(jobId, enabled, current.schedule);
      } catch (err) {
        if (!stopped) await refreshJob(jobId); // revert to server truth
        throw err;
      }
    },

    deleteJob: async (jobId) => {
      await api.deleteJob(jobId);
      if (stopped) return;
      // Job only — sessions and restore points stay (console promise).
      handle.set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId), revision: s.revision + 1 }));
    },

    markAllAlertsRead: async () => {
      persistAllAlertsRead(handle.get().alerts);
      handle.set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) }));
      try {
        await api.markAllAlertsRead();
      } catch {
        /* cosmetic — next alert refresh reconciles */
      }
    },

    markAlertRead: async (id) => {
      persistAlertRead(id);
      handle.set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) }));
      try {
        await api.markAlertRead(id);
      } catch {
        /* cosmetic — next alert refresh reconciles */
      }
    },

    dismissThreat: async (id) => {
      handle.set((s) => ({
        threats: s.threats.map((t) => (t.id === id ? { ...t, status: "dismissed" as const } : t)),
        revision: s.revision + 1,
      }));
      try {
        await api.setThreatStatus(id, "dismissed");
      } catch {
        void refreshThreats(); // revert to server truth
      }
    },

    /* --------------- hypervisor environment lifecycle --------------- */
    createEnvironment: async (input) => {
      const env = await api.createEnvironment(input);
      if (stopped) return env;
      handle.set((s) => ({
        environments: [...s.environments.filter((e) => e.id !== env.id), env],
        revision: s.revision + 1,
      }));
      // Discover its VMs/hosts, then reconcile all inventory-derived state.
      // A discovery failure (e.g. a TLS certificate error) does not fail
      // registration -- the environment record already exists -- but it is
      // not silently dropped either: refreshInventory() below re-fetches the
      // record, and the appliance persists the failure reason on it (see
      // rescan_inventory's last_scan_error), so the Environment this resolves
      // with carries the real post-scan status/statusError instead of the
      // "unknown" placeholder from the moment of creation.
      await api.refreshEnvironment(env.id).catch(() => undefined);
      await refreshInventory();
      if (stopped) return env;
      return handle.get().environments.find((e) => e.id === env.id) ?? env;
    },

    editEnvironment: async (id, patch) => {
      try {
        const env = await api.patchEnvironment(id, patch);
        if (stopped) return;
        handle.set((s) => ({
          environments: s.environments.map((e) => (e.id === id ? env : e)),
          revision: s.revision + 1,
        }));
      } catch (err) {
        if (!stopped) await refreshInventory(); // revert to server truth
        throw err;
      }
    },

    deleteEnvironment: async (id) => {
      try {
        await api.deleteEnvironment(id);
        if (!stopped) {
          handle.set((s) => ({
            environments: s.environments.filter((e) => e.id !== id),
            hosts: s.hosts.filter((h) => h.environmentId !== id),
            vms: s.vms.filter((v) => v.environmentId !== id),
            revision: s.revision + 1,
          }));
        }
        return { ok: true } as EnvDeleteResult;
      } catch (err) {
        if (err instanceof api.ApiError) {
          if (err.status === 409) {
            return { ok: false, reason: "jobs", jobs: blockingJobsFromApiError(err.body) };
          }
          return { ok: false, reason: "error", message: api.apiErrorMessage(err) ?? `Request failed (${err.status})` };
        }
        return { ok: false, reason: "error", message: "Appliance unreachable" };
      }
    },

    rescanEnvironment: async (id) => {
      try {
        const res = await api.refreshEnvironment(id);
        if (!stopped) await refreshInventory();
        return { vmCount: res.total };
      } catch (err) {
        if (!stopped) await refreshInventory();
        console.warn("[world.live] rescanEnvironment failed:", err);
        return null;
      }
    },

    startRestore: async (input) => {
      // ApiErrors (400/404/409 target_vm_exists/etc.) are left to propagate
      // with their body intact — RestorePage reads apiErrorMessage/apiErrorCode
      // off them to show the appliance's actual reason instead of a canned toast.
      const { sessionId } = await api.startRestore({
        vmId: input.vmId,
        restorePointId: input.restorePointId,
        target: {
          mode: input.destination === "original" ? "original" : "new",
          newName: input.newName?.trim() || undefined,
        },
        targetEnvironmentId:
          input.destination === "new-location" ? input.targetEnvId : undefined,
        targetHostId: input.destination === "new-location" ? input.targetHostId : undefined,
        datastore: input.destination === "new-location" ? input.datastore : undefined,
        networkMappings: input.destination === "new-location" ? input.networkMappings : undefined,
        powerOn: input.destination === "new-location" ? input.powerOn : undefined,
        force: input.destination === "original" ? input.force : undefined,
      });
      // Pull the session + its opening log lines right away so Activity
      // shows the restore immediately; SSE keeps it moving from there.
      try {
        const [session, log] = await Promise.all([
          api.getSession(sessionId),
          api.getSessionLog(sessionId),
        ]);
        if (!stopped) {
          handle.set((s) => {
            const fetched = log.lines.map(toLogLine);
            const seen = new Set(fetched.map((l) => l.id));
            // Keep any lines a racing session.log event already appended.
            const extra = (s.liveLogs[sessionId] ?? []).filter((l) => !seen.has(l.id));
            // We already know the source VM name from the request itself —
            // no need to wait on a vms lookup for the session we just started.
            const named: Session =
              session.type === "restore" && !session.vmResults.some((r) => r.vmName)
                ? {
                    ...session,
                    jobName: restoreRunName(input.vmName),
                    vmResults: session.vmResults.map((r) => ({ ...r, vmName: input.vmName })),
                  }
                : session;
            return {
              sessions: [named, ...s.sessions.filter((x) => x.id !== sessionId)],
              liveLogs: { ...s.liveLogs, [sessionId]: [...fetched, ...extra].slice(-LOG_CAP) },
              revision: s.revision + 1,
            };
          });
        }
      } catch {
        /* session.updated / session.log events will fill it in */
      }
      return sessionId;
    },

    getRestorePlacementOptions: async (restorePointId) => {
      try {
        return await api.getRestorePlacementOptions(restorePointId);
      } catch (err) {
        console.warn("[world.live] getRestorePlacementOptions failed:", err);
        return {
          sourceNics: [],
          datastores: [],
          networks: [],
          existingVms: [],
          originalDatastore: null,
          originalHost: null,
          defaultHostId: null,
          defaultDatastoreId: null,
          defaultEnvironmentId: null,
        };
      }
    },

    /* --------------------- repository lifecycle --------------------- */
    editRepository: async (id, patch) => {
      try {
        const repo = await api.patchRepository(id, patch);
        if (stopped) return;
        handle.set((s) => ({
          repositories: s.repositories.map((r) => (r.id === id ? repo : r)),
          revision: s.revision + 1,
        }));
      } catch (err) {
        if (!stopped) await refreshRepositories(); // revert to server truth
        throw err;
      }
    },

    deleteRestorePoint: async (chainId, segmentId) => {
      try {
        await api.deleteRestorePoint(chainId, segmentId);
        if (!stopped) {
          handle.set((s) => {
            if (segmentId === undefined) {
              return {
                restorePoints: s.restorePoints.filter((p) => p.chainId !== chainId),
                revision: s.revision + 1,
              };
            }
            const chainPoints = s.restorePoints.filter((p) => p.chainId === chainId);
            const segment = segmentChainPoints(chainPoints).find((seg) => seg.id === segmentId);
            const removeIds = new Set((segment?.points ?? []).map((p) => p.id));
            return {
              restorePoints: s.restorePoints.filter((p) => !removeIds.has(p.id)),
              revision: s.revision + 1,
            };
          });
        }
        return { ok: true } as RestorePointDeleteResult;
      } catch (err) {
        if (err instanceof api.ApiError) {
          if (err.status === 404) return { ok: false, reason: "not-found" };
          return { ok: false, reason: "error", message: api.apiErrorMessage(err) ?? `Request failed (${err.status})` };
        }
        return { ok: false, reason: "error", message: "Appliance unreachable" };
      }
    },

    createRepository: async (input) => {
      try {
        const repo = await api.createRepository(input);
        if (!stopped) {
          handle.set((s) => ({
            repositories: [...s.repositories, repo],
            revision: s.revision + 1,
          }));
        }
        return repo;
      } catch {
        return null;
      }
    },

    deleteRepository: async (id) => {
      try {
        await api.deleteRepository(id);
        if (!stopped) {
          handle.set((s) => ({
            repositories: s.repositories.filter((r) => r.id !== id),
            revision: s.revision + 1,
          }));
        }
        return { ok: true } as RepoDeleteResult;
      } catch (err) {
        if (err instanceof api.ApiError) {
          if (err.status === 409) {
            return { ok: false, reason: "jobs", jobs: blockingJobsFromApiError(err.body) };
          }
          return { ok: false, reason: "error", message: `Request failed (${err.status})` };
        }
        return { ok: false, reason: "error", message: "Appliance unreachable" };
      }
    },

    rescanRepository: async (id) => {
      // Server flips to "scanning" now and emits repository.updated when it
      // settles; the SSE handler refreshes the row — no optimistic patch needed.
      try {
        const repo = await api.rescanRepository(id);
        if (stopped) return;
        handle.set((s) => ({
          repositories: s.repositories.map((r) => (r.id === id ? repo : r)),
          revision: s.revision + 1,
        }));
      } catch {
        if (!stopped) await refreshRepositories();
      }
    },

    setRepositoryMaintenance: async (id, maintenance) => {
      try {
        const repo = await api.setRepositoryMaintenance(id, maintenance);
        if (stopped) return;
        handle.set((s) => ({
          repositories: s.repositories.map((r) => (r.id === id ? repo : r)),
          revision: s.revision + 1,
        }));
      } catch (err) {
        if (!stopped) await refreshRepositories();
        throw err;
      }
    },

    testS3Connection: async (config) => {
      try {
        return await api.testS3RepositoryConnection(config);
      } catch (err) {
        return {
          ok: false,
          message: api.apiErrorMessage(err) ?? "Appliance unreachable",
          checks: [],
        };
      }
    },

    /* --------------------------- replication --------------------------- */
    failoverReplica: async (id, input) => {
      try {
        await api.failoverReplica(id, input.planned, input.pointId);
      } finally {
        if (!stopped) await refreshReplicas();
      }
    },
    failbackReplica: async (id) => {
      try {
        await api.failbackReplica(id);
      } finally {
        if (!stopped) await refreshReplicas();
      }
    },
    undoFailover: async (id) => {
      try {
        await api.undoFailover(id);
      } finally {
        if (!stopped) await refreshReplicas();
      }
    },
  };

  return { mode: "live", actions, start, stop };
}
