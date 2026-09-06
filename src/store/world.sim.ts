// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The "sim" world driver — the original in-browser demo world.
 *
 * Ports the full simulation from the legacy zustand store: seeded data plus a
 * 1.2 s tick loop that advances running sessions, streams phase-templated log
 * lines, and applies completion effects (restore points, VM protection,
 * alerts, job bookkeeping, the SQL-hourly auto re-run). All state flows
 * through the shared `WorldHandle`; every mutation resolves immediately.
 */
import { clamp, pick, seededRandom } from "@/lib/utils";
import { createSeedWorld, type World } from "@/mock/seed";
import { applyReadState, persistAllAlertsRead, persistAlertRead } from "@/store/notifications.persist";
import { segmentChainPoints, simChainId, simCompressionRatio } from "@/lib/restore-points";
import type {
  Alert,
  BackupJob,
  Environment,
  EnvironmentType,
  Host,
  Hypervisor,
  LogLine,
  Repository,
  RestoreDatastoreOption,
  RestoreExistingVmOption,
  RestoreNetworkOption,
  RestorePoint,
  RestoreSourceNic,
  Schedule,
  Session,
  SessionStatus,
  VM,
  VmRunResult,
} from "@/types";
import type {
  BlockingJobRef,
  EnvDeleteResult,
  RepoDeleteResult,
  RestorePointDeleteResult,
  WorldActions,
  WorldDriver,
  WorldHandle,
} from "@/store/world.types";

/* --------------------------- id / time helpers -------------------------- */
let _id = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(_id++).toString(36)}`;
const nowIso = () => new Date().toISOString();
const TICK_MS = 1200;
const TICK_SECONDS = TICK_MS / 1000;

function makeLog(level: LogLine["level"], message: string, vmName?: string): LogLine {
  return { id: uid("log"), ts: nowIso(), level, message, vmName };
}

function computeNextRun(schedule: Schedule): string {
  const now = new Date();
  if (schedule.frequency === "hourly") {
    return new Date(now.getTime() + (schedule.everyHours ?? 1) * 3600_000).toISOString();
  }
  if (schedule.frequency === "weekly") {
    return new Date(now.getTime() + 7 * 86_400_000).toISOString();
  }
  // daily / custom → next occurrence of atTime
  const [h, m] = (schedule.atTime ?? "22:00").split(":").map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

/* ------------------ restore placement (networks/datastores) ------------------
 * Neither is stored on Environment/Host/VM — the real appliance resolves them
 * on demand from separate inventory resources (get_restore_context in
 * abr_v41.py), not from the host/VM records themselves. This mirrors that: a
 * deterministic catalog keyed by id, computed on request rather than seeded
 * once, so it stays in sync with whatever environments/hosts exist. */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

/** Port groups / virtual switches known to an environment. A standard vSwitch
 *  belongs to a single host, so which of these a given host actually exposes is
 *  decided by {@link hostNetworkNames} — this is only the catalog. */
const ENV_NETWORKS: Record<string, string[]> = {
  "env-hq": ["VM Network", "Production-LAN", "DMZ", "Management", "vMotion"],
  "env-dr": ["VM Network", "Production-LAN", "DR-Replication"],
  "env-edge": ["VM Network", "Branch-LAN"],
  "env-prox": ["vmbr0", "vmbr1-dmz"],
};
const DEFAULT_NETWORKS = ["VM Network"];

function envNetworks(environmentId: string): string[] {
  return ENV_NETWORKS[environmentId] ?? DEFAULT_NETWORKS;
}

/** The network(s) a VM's NIC(s) are connected to — deterministic per VM so it
 *  doesn't reshuffle between renders. DMZ-tagged VMs get a second, dual-homed
 *  NIC, mirroring a common web-tier layout. */
function vmSourceNetworks(vm: VM): string[] {
  const catalog = envNetworks(vm.environmentId);
  const roll = seededRandom(hashId(vm.id))();
  const primary = pick(catalog, roll);
  if (vm.tags.includes("dmz") && catalog.length > 1) {
    const second = catalog.find((n) => n !== primary) ?? primary;
    return second === primary ? [primary] : [primary, second];
  }
  return [primary];
}

/** The VM's individual NICs, each carrying its own id — a dual-homed (DMZ) VM
 *  gets two distinct adapters even when {@link vmSourceNetworks} would return
 *  just one name, so the wizard has real per-adapter rows to exercise. */
function vmSourceNics(vm: VM): RestoreSourceNic[] {
  return vmSourceNetworks(vm).map((sourceNetwork, index) => ({
    id: `${vm.id}::nic::${index + 1}`,
    label: `Network adapter ${index + 1}`,
    sourceNetwork,
    connected: true,
  }));
}

const PROXMOX_DATASTORES = ["local-lvm", "nfs-backup", "ceph-pool1"];
const VSPHERE_DATASTORES = ["vsanDatastore", "datastore1", "datastore2", "nfs-archive"];

/** The datastore the VM "originally" lived on — deterministic per VM, so
 *  "Automatic" in the restore wizard can show a concrete current value. */
function vmOriginalDatastore(vm: VM): string {
  const catalog = vm.environmentId === "env-prox" ? PROXMOX_DATASTORES : VSPHERE_DATASTORES;
  const roll = seededRandom(hashId(`${vm.id}-ds`))();
  return pick(catalog, roll);
}

/** Port groups a given host's virtual switches expose — deterministic per host.
 *  Always includes the environment's first network (the management/VM network
 *  every host carries) and a varying tail, so target networks genuinely differ
 *  between hosts the way per-host standard switches do. */
function hostNetworkNames(host: Host): string[] {
  const catalog = envNetworks(host.environmentId);
  if (catalog.length <= 1) return catalog;
  const roll = seededRandom(hashId(`${host.id}-net`))();
  return catalog.slice(0, 1 + Math.max(1, Math.round(roll * (catalog.length - 1))));
}

/** Datastores mounted on a given host — deterministic per host. */
function hostDatastoreNames(host: Host): string[] {
  const catalog = host.environmentId === "env-prox" ? PROXMOX_DATASTORES : VSPHERE_DATASTORES;
  const roll = seededRandom(hashId(host.id))();
  const count = 2 + Math.floor(roll * (catalog.length - 1));
  return catalog.slice(0, count);
}

/* ------------------------------- helpers -------------------------------- */
function scopeUsed(state: World, s: Session): number {
  const total = s.vmResults.reduce((a, r) => a + (state.vms.find((v) => v.id === r.vmId)?.usedGB ?? 30), 0);
  return Math.max(total, s.vmCount * 20);
}

function pushRunLog(log: LogLine[], s: Session, vmName: string | undefined, progress: number, job?: BackupJob): void {
  const phase = Math.floor(progress / 18) % 6;
  const isRestore = s.jobId.startsWith("restore");
  if (isRestore) {
    const msgs = [
      "Reading restore point…",
      `Transferring blocks · ${s.throughputMBps} MB/s`,
      "Reassembling disk geometry…",
      "Applying changed blocks…",
      "Reconfiguring network adapters…",
      "Powering on guest…",
    ];
    log.push(makeLog("info", msgs[phase], vmName));
    return;
  }
  const templates = [
    `Creating ${job?.options.appAware ? "application-aware" : "crash-consistent"} snapshot…`,
    "Reading changed blocks (CBT)…",
    `Processing disk scsi0:0 · ${s.throughputMBps} MB/s`,
    `Deduplicating & compressing (level ${job?.options.compression ?? 3})…`,
    "Writing restore point…",
    "Restore point committed.",
  ];
  log.push(makeLog(phase === 5 ? "success" : "info", templates[phase], vmName));
}

function seedLiveLogs(world: World): Record<string, LogLine[]> {
  const live = world.sessions.find((s) => s.status === "running");
  if (!live) return {};
  return {
    [live.id]: [
      makeLog("info", `Starting ${live.jobName}`),
      makeLog("info", `Connecting to environment · ${live.vmCount} VM(s) in scope`),
      makeLog("info", "Application-aware processing enabled (VSS / pre-freeze scripts)"),
      makeLog("info", "Creating application-aware snapshot…", live.vmResults[0]?.vmName),
      makeLog("info", "Reading changed blocks (CBT)…", live.vmResults[0]?.vmName),
      makeLog("success", "Restore point committed.", live.vmResults[0]?.vmName),
      makeLog("info", "Creating application-aware snapshot…", live.vmResults[1]?.vmName),
    ],
  };
}

/* -------------------------------- driver -------------------------------- */
export function createSimDriver(handle: WorldHandle): WorldDriver {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let autoRunAt: number | null = null;

  /* ------------------------------- tick -------------------------------- */
  const tick = (): void => {
    const state = handle.get();
    const running = state.sessions.filter((s) => s.status === "running");

    // Kick the auto re-run of the SQL hourly job to keep the world alive.
    if (running.length === 0 && autoRunAt && Date.now() >= autoRunAt) {
      autoRunAt = null;
      void actions.runJob("job-sql-hourly", "schedule");
      return;
    }
    if (running.length === 0) return;

    const sessions = [...state.sessions];
    const liveLogs = { ...state.liveLogs };
    let finishedAny = false;
    const newAlerts: Alert[] = [];
    const vmPatches: Record<string, { lastBackupAt: string }> = {};
    const newRestorePoints: RestorePoint[] = [];
    // jobId → the VM ids that actually synced this run (the run's scoped VMs),
    // so we only resync/create replicas for VMs the run touched (as the server does).
    const syncedReplicaJobs = new Map<string, Set<string>>();

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (s.status !== "running") continue;

      const job = state.jobs.find((jb) => jb.id === s.jobId);
      const totalUsed = scopeUsed(state, s);
      const step = 5 + Math.random() * 6;
      const progress = clamp(s.progress + step, 0, 100);
      const done = progress >= 100;

      const processedGB = Math.round((totalUsed * progress) / 100);
      // A full backup transfers most of what it reads (compression only); an
      // incremental transfers just the changed-block delta CBT found — the
      // same distinction that now drives s.backupType, so the two agree.
      const transferredGB = Math.round(processedGB * (s.backupType === "full" ? 0.85 : 0.08));
      const throughputMBps = done ? 0 : Math.round(460 + Math.random() * 280);
      // Guest read runs ahead of the repo write by the same ratio the volumes
      // do (compression + dedup shrink what actually lands), so the demo's two
      // rate readouts stay consistent with its own byte counters.
      const guestReadMBps = done
        ? 0
        : Math.round(throughputMBps / (s.backupType === "full" ? 0.85 : 0.08));
      const completed = Math.floor((progress / 100) * s.vmCount);

      const vmResults: VmRunResult[] = s.vmResults.map((r, idx) => {
        if (idx < completed) {
          return { ...r, status: "success", processedGB: r.processedGB || 1, durationSec: r.durationSec || 60 };
        }
        if (idx === completed && !done) {
          return {
            ...r,
            status: "running",
            processedGB: Math.round((r.processedGB || 1)),
            durationSec: r.durationSec + TICK_SECONDS,
          };
        }
        return r;
      });

      // Streaming log lines for the active VM.
      const activeVm = s.vmResults[Math.min(completed, s.vmResults.length - 1)];
      const log = liveLogs[s.id] ? [...liveLogs[s.id]] : [];
      pushRunLog(log, s, activeVm?.vmName, progress, job);
      liveLogs[s.id] = log.slice(-400);

      if (done) {
        finishedAny = true;
        const finalStatus: SessionStatus = Math.random() > 0.92 ? "warning" : "success";
        const durationSec = Math.round(s.durationSec + TICK_SECONDS);
        const isRestore = s.jobId.startsWith("restore");
        sessions[i] = {
          ...s,
          status: finalStatus,
          progress: 100,
          finishedAt: nowIso(),
          durationSec,
          processedGB,
          transferredGB,
          throughputMBps: Math.round((transferredGB * 1024) / Math.max(durationSec, 1)),
          vmResults: vmResults.map((r) => ({ ...r, status: r.status === "running" ? "success" : r.status })),
        };
        log.push(
          makeLog(
            finalStatus === "warning" ? "warn" : "success",
            isRestore
              ? "Restore completed successfully. Guest is reachable."
              : finalStatus === "warning"
                ? "Backup completed with warnings. All restore points are valid."
                : `Backup completed. ${s.vmCount} restore point(s) created.`,
          ),
        );
        liveLogs[s.id] = log.slice(-400);

        if (job && !isRestore) {
          if (job.type === "replication") {
            // Replication resyncs the replica — no repo restore points.
            // Record which VMs actually ran so we don't touch out-of-scope VMs.
            const synced = syncedReplicaJobs.get(job.id) ?? new Set<string>();
            for (const r of s.vmResults) synced.add(r.vmId);
            syncedReplicaJobs.set(job.id, synced);
          } else if (job.type === "backup") {
            // Create restore points + mark VMs protected.
            for (const r of s.vmResults) {
              const vm = state.vms.find((v) => v.id === r.vmId);
              if (!vm) continue;
              // vm.lastBackupAt still reflects the pre-tick state here, so this
              // is "did this VM have a restore point before THIS run" — a VM's
              // first point is a full (whole-disk read), not a 6%-sized delta.
              const isFirstForVm = !vm.lastBackupAt;
              vmPatches[r.vmId] = { lastBackupAt: nowIso() };
              const storedGB = isFirstForVm
                ? Math.max(1, Math.round(vm.usedGB))
                : Math.max(1, Math.round(vm.usedGB * 0.06));
              const ratio = simCompressionRatio(job.options.compression);
              newRestorePoints.push({
                id: uid("rp"),
                chainId: simChainId(job.id, r.vmId, job.repositoryId),
                vmId: r.vmId,
                vmName: r.vmName,
                jobId: job.id,
                jobName: job.name,
                createdAt: nowIso(),
                type: isFirstForVm ? "full" : "incremental",
                sizeGB: storedGB,
                repositoryId: job.repositoryId,
                logicalGB: Math.round(storedGB / ratio),
                compressionRatio: ratio,
                compressionLevel: job.options.compression,
                encrypted: job.options.encryption,
              });
            }
          }
          newAlerts.push({
            id: uid("al"),
            severity: finalStatus === "warning" ? "warning" : "success",
            category: "job",
            title: `${job.name} ${finalStatus === "warning" ? "finished with warnings" : "completed"}`,
            message: `${s.vmCount} VM(s) processed · ${processedGB} GB read · ${transferredGB} GB transferred.`,
            createdAt: nowIso(),
            read: false,
            entityType: "job",
            entityId: job.id,
          });
        }
        if (isRestore) {
          newAlerts.push({
            id: uid("al"),
            severity: "success",
            category: "system",
            title: "Restore completed",
            message: `${s.jobName} finished successfully.`,
            createdAt: nowIso(),
            read: false,
          });
        }
      } else {
        sessions[i] = { ...s, progress, processedGB, transferredGB, throughputMBps, guestReadMBps, durationSec: s.durationSec + TICK_SECONDS, vmResults };
      }
    }

    // Apply VM protection patches + restore points + job updates on completion.
    let vms = state.vms;
    let jobs = state.jobs;
    let restorePoints = state.restorePoints;
    let alerts = state.alerts;

    if (finishedAny) {
      vms = state.vms.map((v) =>
        vmPatches[v.id]
          ? {
              ...v,
              protection: "protected" as const,
              lastBackupAt: vmPatches[v.id].lastBackupAt,
              restorePointCount: v.restorePointCount + 1,
              protectionNote: undefined,
            }
          : v,
      );
      restorePoints = [...newRestorePoints, ...state.restorePoints];
      alerts = [...newAlerts, ...state.alerts].slice(0, 60);
      // Update jobs whose session just finished.
      const justFinished = sessions.filter((s) => s.finishedAt && s.progress === 100 && state.sessions.find((o) => o.id === s.id)?.status === "running");
      jobs = state.jobs.map((jb) => {
        const fin = justFinished.find((s) => s.jobId === jb.id);
        if (!fin) return jb;
        const recentRuns = [...jb.recentRuns.filter((r) => r !== "running"), fin.status].slice(-8);
        return {
          ...jb,
          state: "idle" as const,
          lastStatus: fin.status,
          lastRunAt: fin.finishedAt,
          nextRunAt: computeNextRun(jb.schedule),
          recentRuns,
        };
      });
    }

    const sqlFinished = finishedAny && sessions.some((s) => s.jobId === "job-sql-hourly" && s.progress === 100 && s.status !== "running");
    if (sqlFinished) autoRunAt = Date.now() + 22_000;

    // A completed replication run resyncs its replicas (new point) and
    // materializes a replica for any of the job's VMs that don't have one yet —
    // mirroring the server's commitReplication (create-or-resync per source VM).
    // A failed-over replica is left untouched — the source isn't syncing it.
    let replicas = state.replicas;
    if (syncedReplicaJobs.size > 0) {
      replicas = replicas.map((r) => {
        // Resync only the VMs this run actually synced (not the whole job) — the
        // same per-VM scope the create loop uses and the server's per-plan commit.
        const syncedVmIds = syncedReplicaJobs.get(r.jobId);
        if (!syncedVmIds || !syncedVmIds.has(r.sourceVmId) || r.state === "failover") return r;
        const job = state.jobs.find((j) => j.id === r.jobId);
        const keep = Math.max(1, Math.min(job?.retention.keepDays ?? 24, 24));
        return {
          ...r,
          lastSyncAt: nowIso(),
          state: "ready" as const,
          points: [...r.points, { id: uid("rpl"), createdAt: nowIso(), type: "incremental" as const }].slice(-keep),
        };
      });
      for (const [jobId, syncedVmIds] of syncedReplicaJobs) {
        const job = state.jobs.find((j) => j.id === jobId);
        if (!job?.replicaTarget) continue;
        const target = job.replicaTarget;
        const targetEnv = state.environments.find((e) => e.id === target.environmentId);
        // Only the VMs this run actually synced — not the whole job scope.
        for (const vmId of syncedVmIds) {
          if (replicas.some((r) => r.jobId === jobId && r.sourceVmId === vmId)) continue;
          const vm = state.vms.find((v) => v.id === vmId);
          if (!vm) continue;
          const targetHost = target.hostId
            ? state.hosts.find((h) => h.id === target.hostId)
            : state.hosts.find((h) => h.environmentId === targetEnv?.id);
          replicas = [
            {
              id: uid("replica"),
              jobId: job.id,
              jobName: job.name,
              sourceVmId: vm.id,
              sourceVmName: vm.name,
              guestOs: vm.guestOs,
              osFamily: vm.osFamily,
              sourcePlatform: state.environments.find((e) => e.id === vm.environmentId)?.hypervisor ?? "hyperv",
              targetEnvironmentId: targetEnv?.id ?? "",
              targetEnvironmentName: targetEnv?.name ?? "target",
              targetHostId: targetHost?.id ?? null,
              targetHostName: targetHost?.name ?? null,
              targetPlatform: targetEnv?.hypervisor ?? "hyperv",
              replicaName: `${target.namePrefix ?? "replica-"}${vm.name}`,
              state: "ready" as const,
              lastSyncAt: nowIso(),
              points: [{ id: uid("rpl"), createdAt: nowIso(), type: "full" as const }],
              activePointId: null,
              sizeGB: Math.round(vm.usedGB),
              createdAt: nowIso(),
              poweredOn: false,
            },
            ...replicas,
          ];
        }
      }
    }

    handle.set({
      sessions,
      liveLogs,
      vms,
      jobs,
      restorePoints,
      alerts,
      replicas,
      tickCount: state.tickCount + 1,
      revision: finishedAny ? state.revision + 1 : state.revision,
    });
  };

  /* ------------------------------ actions ------------------------------- */
  const actions: WorldActions = {
    /* The simulated world is generated whole and held in memory — there is no
     * older page to go and fetch, so the store's history is already complete
     * (`sessionsHasMore` stays false) and this has nothing to do. */
    loadOlderSessions: () => Promise.resolve(),

    /* ------------------------------ runJob ----------------------------- */
    runJob: (jobId, triggeredBy = "manual", forceFull = false) => {
      const state = handle.get();
      const job = state.jobs.find((j) => j.id === jobId);
      if (!job || job.state === "running") return Promise.resolve(null);
      const existing = state.sessions.find((s) => s.jobId === jobId && s.status === "running");
      if (existing) return Promise.resolve(existing.id);

      const scope = job.vmIds.slice(0, Math.min(job.vmIds.length, 10));
      const id = uid("sess");
      const vmResults: VmRunResult[] = scope.map((vmId, idx) => {
        const vm = state.vms.find((v) => v.id === vmId);
        return {
          vmId,
          vmName: vm?.name ?? vmId,
          status: idx === 0 ? "running" : "pending",
          processedGB: 0,
          transferredGB: 0,
          durationSec: 0,
        };
      });
      // A VM with no prior restore point gets a full, not an incremental — this
      // mirrors the server's resolve_job_execution ("previous is None" ⇒
      // ActiveFull/FirstRun). A mixed scope (some VMs new, some not) still reads
      // as "full" at the session level since at least one disk gets a full read.
      // `forceFull` mirrors the server's manual_force_full reason — the operator
      // asked for an active full even though one already exists.
      const needsFull =
        job.type === "backup" &&
        (forceFull || scope.some((vmId) => !state.vms.find((v) => v.id === vmId)?.lastBackupAt));

      const session: Session = {
        id,
        jobId: job.id,
        jobName: job.name,
        type: job.type,
        status: "running",
        backupType: needsFull ? "full" : "incremental",
        startedAt: nowIso(),
        finishedAt: null,
        durationSec: 0,
        progress: 0,
        processedGB: 0,
        transferredGB: 0,
        throughputMBps: 480,
        vmCount: scope.length,
        vmResults,
        triggeredBy,
      };

      const startLog: LogLine[] = [
        makeLog("info", `Starting ${job.name}`),
        makeLog("info", `Connecting to environment · ${scope.length} VM(s) in scope`),
        makeLog("info", job.options.appAware ? "Application-aware processing enabled (VSS / pre-freeze scripts)" : "Crash-consistent snapshot mode"),
      ];

      handle.set({
        sessions: [session, ...state.sessions],
        jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, state: "running", lastStatus: "running" } : j)),
        liveLogs: { ...state.liveLogs, [id]: startLog },
        revision: state.revision + 1,
      });
      return Promise.resolve(id);
    },

    /* -------------------------- stopSession ---------------------------- */
    /* The demo world has no engine to unwind, so a cancel lands immediately —
     * where the live driver only flags the run and waits for the appliance.
     * A cancelled run is a FAILED run with a reason, not a quiet disappearance:
     * whatever it had already read is real, and the history has to show it was
     * stopped rather than that it never happened. */
    stopSession: (sessionId) => {
      const state = handle.get();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!session || session.status !== "running") return Promise.resolve(false);

      const log = [...(state.liveLogs[sessionId] ?? []), makeLog("warn", "Run cancelled by operator.")];
      handle.set({
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                status: "failed",
                finishedAt: nowIso(),
                throughputMBps: 0,
                message: "Cancelled by operator",
                // Whatever hadn't started never will; what was in flight stopped
                // where it stood.
                vmResults: s.vmResults.map((r) =>
                  r.status === "running" || r.status === "pending" ? { ...r, status: "failed" } : r,
                ),
              }
            : s,
        ),
        jobs: state.jobs.map((j) =>
          j.id === session.jobId && j.state === "running"
            ? { ...j, state: "idle", lastStatus: "failed", lastRunAt: nowIso() }
            : j,
        ),
        liveLogs: { ...state.liveLogs, [sessionId]: log.slice(-400) },
        revision: state.revision + 1,
      });
      return Promise.resolve(true);
    },

    /* ---------------------------- createJob ---------------------------- */
    createJob: (input) => {
      const state = handle.get();
      const job: BackupJob = {
        id: uid("job"),
        name: input.name,
        type: input.type,
        description: input.description,
        vmIds: input.vmIds,
        scopeSummary: input.scopeSummary,
        repositoryId: input.repositoryId,
        schedule: input.schedule,
        retention: input.retention,
        options: input.options,
        state: "idle",
        lastStatus: null,
        lastRunAt: null,
        nextRunAt: computeNextRun(input.schedule),
        createdAt: nowIso(),
        successRate: 100,
        recentRuns: [],
        accent: input.accent,
        // Replication jobs carry their target so the first run can materialize a
        // replica (mirrors the server persisting replicaTarget on POST /jobs).
        ...(input.type === "replication" && input.replicaTarget
          ? { replicaTarget: input.replicaTarget }
          : {}),
      };
      handle.set({ jobs: [job, ...state.jobs], revision: state.revision + 1 });
      if (input.runNow) {
        // Guarded by the interval handle: a mode switch clears the driver, and
        // this deferred run must not fire into the successor world.
        setTimeout(() => {
          if (intervalId !== null) void actions.runJob(job.id, "manual");
        }, 400);
      }
      return Promise.resolve(job);
    },

    updateJob: (jobId, patch) => {
      handle.set((state) => {
        const existing = state.jobs.find((j) => j.id === jobId);
        // Flipping a replication job to a non-replication type reaps its standby
        // replicas + clears the now-meaningless target (mirrors the server).
        const flippedOff =
          existing?.type === "replication" && patch.type !== undefined && patch.type !== "replication";
        const jobs = state.jobs.map((j) => {
          if (j.id !== jobId) return j;
          const next = { ...j, ...patch };
          if (flippedOff) delete next.replicaTarget;
          return next;
        });
        return {
          jobs,
          replicas: flippedOff
            ? state.replicas.filter((r) => r.jobId !== jobId || r.state === "failover")
            : state.replicas,
          revision: state.revision + 1,
        };
      });
      return Promise.resolve();
    },

    setJobEnabled: (jobId, enabled) => {
      handle.set((state) => ({
        jobs: state.jobs.map((j) =>
          j.id === jobId ? { ...j, state: enabled ? "idle" : "disabled", nextRunAt: enabled ? computeNextRun(j.schedule) : null } : j,
        ),
        revision: state.revision + 1,
      }));
      return Promise.resolve();
    },

    deleteJob: (jobId) => {
      handle.set((state) => {
        // A replication job's standby replicas are reaped on delete; a serving
        // (failover) replica is kept so it can still be failed back (mirrors the server).
        const reap = state.jobs.find((j) => j.id === jobId)?.type === "replication";
        return {
          jobs: state.jobs.filter((j) => j.id !== jobId),
          replicas: reap
            ? state.replicas.filter((r) => r.jobId !== jobId || r.state === "failover")
            : state.replicas,
          revision: state.revision + 1,
        };
      });
      return Promise.resolve();
    },

    markAllAlertsRead: () => {
      persistAllAlertsRead(handle.get().alerts);
      handle.set((state) => ({ alerts: state.alerts.map((a) => ({ ...a, read: true })) }));
      return Promise.resolve();
    },

    markAlertRead: (id) => {
      persistAlertRead(id);
      handle.set((state) => ({ alerts: state.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) }));
      return Promise.resolve();
    },

    dismissThreat: (id) => {
      handle.set((state) => ({
        threats: state.threats.map((t) => (t.id === id ? { ...t, status: "dismissed" } : t)),
        revision: state.revision + 1,
      }));
      return Promise.resolve();
    },

    /* --------------- hypervisor environment lifecycle --------------- */
    createEnvironment: (input) => {
      const hypervisor: Hypervisor =
        input.type === "hyperv" ? "hyperv" : input.type === "proxmox" ? "proxmox" : "vmware";
      const env: Environment = {
        id: uid("env"),
        name: input.name,
        type: input.type as EnvironmentType,
        hypervisor,
        version: hypervisor === "vmware" ? "vSphere 8.0" : "",
        endpoint: input.endpoint,
        port: input.port,
        insecure: Boolean(input.insecure),
        connected: true,
        hostCount: 0,
        vmCount: 0,
      };
      handle.set((s) => ({ environments: [...s.environments, env], revision: s.revision + 1 }));
      return Promise.resolve(env);
    },

    editEnvironment: (id, patch) => {
      // Credentials (username/password) aren't part of the domain model — the
      // sim has nowhere to hold them, same as the appliance never returning
      // them back over GET. Only name/endpoint/port/insecure are visibly
      // editable here.
      handle.set((s) => ({
        environments: s.environments.map((e) =>
          e.id === id
            ? {
                ...e,
                ...(patch.name !== undefined && { name: patch.name }),
                ...(patch.endpoint !== undefined && { endpoint: patch.endpoint }),
                ...(patch.port !== undefined && { port: patch.port }),
                ...(patch.insecure !== undefined && { insecure: patch.insecure }),
              }
            : e,
        ),
        revision: s.revision + 1,
      }));
      return Promise.resolve();
    },

    deleteEnvironment: (id) => {
      const state = handle.get();
      const envVmIds = new Set(state.vms.filter((v) => v.environmentId === id).map((v) => v.id));
      const jobs: BlockingJobRef[] = state.jobs
        .filter((j) => j.vmIds.some((vmId) => envVmIds.has(vmId)))
        .map((j) => ({ id: j.id, name: j.name }));
      if (jobs.length > 0) return Promise.resolve<EnvDeleteResult>({ ok: false, reason: "jobs", jobs });
      handle.set((s) => ({
        environments: s.environments.filter((e) => e.id !== id),
        hosts: s.hosts.filter((h) => h.environmentId !== id),
        vms: s.vms.filter((v) => v.environmentId !== id),
        revision: s.revision + 1,
      }));
      return Promise.resolve<EnvDeleteResult>({ ok: true });
    },

    rescanEnvironment: (id) => {
      const env = handle.get().environments.find((e) => e.id === id);
      return Promise.resolve(env ? { vmCount: env.vmCount } : null);
    },

    /* --------------------------- startRestore -------------------------- */
    startRestore: (input) => {
      const state = handle.get();
      const id = uid("restore");
      const label = `Restore · ${input.vmName} → ${input.destination === "original" ? "original location" : "new location"}`;
      const session: Session = {
        id,
        jobId: id,
        jobName: label,
        type: "restore",
        status: "running",
        backupType: "full",
        startedAt: nowIso(),
        finishedAt: null,
        durationSec: 0,
        progress: 0,
        processedGB: 0,
        transferredGB: 0,
        throughputMBps: 520,
        vmCount: 1,
        vmResults: [{ vmId: input.vmId, vmName: input.vmName, status: "running", processedGB: 0, transferredGB: 0, durationSec: 0 }],
        triggeredBy: "manual",
      };
      const logs: LogLine[] = [
        makeLog("info", `Mounting restore point ${input.restorePointId}…`),
        makeLog("info", "Registering VM from backup…"),
      ];
      if (input.destination === "new-location") {
        const target = input.targetHostId
          ? state.hosts.find((h) => h.id === input.targetHostId)?.name
          : undefined;
        logs.push(
          makeLog(
            "info",
            `Placing on ${target ?? "an automatically-selected host"}${input.datastore ? ` · datastore ${input.datastore}` : ""}…`,
          ),
        );
        if (input.networkMappings?.length) {
          const count = input.networkMappings.length;
          logs.push(makeLog("info", `Mapping ${count} network adapter${count === 1 ? "" : "s"}…`));
        }
        if (input.powerOn) logs.push(makeLog("info", "Will power on once the restore completes…"));
      }
      handle.set({ sessions: [session, ...state.sessions], liveLogs: { ...state.liveLogs, [id]: logs }, revision: state.revision + 1 });
      return Promise.resolve(id);
    },

    /* --------------------- restore placement options --------------------- */
    getRestorePlacementOptions: (restorePointId) => {
      const state = handle.get();
      const point = state.restorePoints.find((p) => p.id === restorePointId);
      const vm = point ? state.vms.find((v) => v.id === point.vmId) : undefined;
      const sourceNics = vm ? vmSourceNics(vm) : [];
      const originalDatastore = vm ? vmOriginalDatastore(vm) : null;
      const originalHost = vm ? (state.hosts.find((h) => h.id === vm.hostId)?.name ?? null) : null;

      // Networks come from the hosts that expose them, so the wizard can narrow
      // the list to the chosen target host. An environment with no discovered
      // hosts still offers its catalog, scoped to nothing in particular.
      const networkMap = new Map<string, RestoreNetworkOption>();
      for (const host of state.hosts) {
        for (const name of hostNetworkNames(host)) {
          const id = `${host.environmentId}::network::${name}`;
          const entry = networkMap.get(id) ?? { id, environmentId: host.environmentId, name, hostIds: [] };
          entry.hostIds.push(host.id);
          networkMap.set(id, entry);
        }
      }
      for (const env of state.environments) {
        if (state.hosts.some((h) => h.environmentId === env.id)) continue;
        for (const name of envNetworks(env.id)) {
          const id = `${env.id}::network::${name}`;
          networkMap.set(id, { id, environmentId: env.id, name, hostIds: [] });
        }
      }
      const networks: RestoreNetworkOption[] = Array.from(networkMap.values());

      const datastoreMap = new Map<string, RestoreDatastoreOption>();
      for (const host of state.hosts) {
        for (const name of hostDatastoreNames(host)) {
          const id = `${host.environmentId}::datastore::${name}`;
          const entry =
            datastoreMap.get(id) ??
            (() => {
              // No real datastore telemetry in the demo world — fabricate a
              // stable capacity/free split per datastore so the placement UI
              // has something plausible (and occasionally low-space) to show.
              const capacityBytes = Math.round((2 + seededRandom(hashId(id))() * 6) * 1024 ** 4);
              const freeBytes = Math.round(capacityBytes * (0.1 + seededRandom(hashId(`${id}-free`))() * 0.6));
              return { id, environmentId: host.environmentId, name, hostIds: [], capacityBytes, freeBytes };
            })();
          entry.hostIds.push(host.id);
          datastoreMap.set(id, entry);
        }
      }

      // Mirrors `_build_restore_existing_vms` on the appliance, which lists
      // every VM resource in the inventory unfiltered — including the source
      // VM itself, since a same-named copy back into its own environment
      // collides with it too.
      const existingVms: RestoreExistingVmOption[] = state.vms.map((v) => ({
        id: v.id,
        environmentId: v.environmentId,
        name: v.name,
      }));

      // The demo world has no appliance to resolve "Automatic" for it, so the
      // wizard falls back to its own rule (source host, else the environment's
      // first) — exactly what it does against a real target environment that
      // isn't the restore point's own.
      return Promise.resolve({
        sourceNics,
        datastores: Array.from(datastoreMap.values()),
        networks,
        existingVms,
        originalDatastore,
        originalHost,
        defaultHostId: vm?.hostId ?? null,
        defaultDatastoreId: null,
        defaultEnvironmentId: vm?.environmentId ?? null,
      });
    },

    /* --------------------- repository lifecycle --------------------- */
    editRepository: (id, patch) => {
      handle.set((state) => ({
        repositories: state.repositories.map((r) =>
          r.id === id
            ? {
                ...r,
                ...(patch.name !== undefined && { name: patch.name }),
                ...(patch.capacityGB !== undefined && { capacityGB: patch.capacityGB }),
                ...(patch.compression !== undefined && { compression: patch.compression }),
                ...(patch.ioThrottleMBps !== undefined && { ioThrottleMBps: patch.ioThrottleMBps }),
                ...(patch.maxConcurrentTasks !== undefined && { maxConcurrentTasks: patch.maxConcurrentTasks }),
                ...(patch.maintenanceMode !== undefined && { maintenanceMode: patch.maintenanceMode }),
              }
            : r,
        ),
        revision: state.revision + 1,
      }));
      return Promise.resolve();
    },

    deleteRestorePoint: (chainId, segmentId) => {
      const state = handle.get();
      // A chain is a (job, VM, repository) triple, so every point in it shares
      // one VM and one repository. A chain can hold several full-backup
      // segments; `segmentId`, when given, scopes the delete to just one.
      const chainPoints = state.restorePoints.filter((p) => p.chainId === chainId);
      if (chainPoints.length === 0) return Promise.resolve<RestorePointDeleteResult>({ ok: false, reason: "not-found" });
      const { vmId, repositoryId } = chainPoints[0];
      const targetPoints =
        segmentId === undefined
          ? chainPoints
          : (segmentChainPoints(chainPoints).find((seg) => seg.id === segmentId)?.points ?? []);
      if (targetPoints.length === 0) return Promise.resolve<RestorePointDeleteResult>({ ok: false, reason: "not-found" });
      const removeIds = new Set(targetPoints.map((p) => p.id));
      const freedGB = targetPoints.reduce((a, p) => a + p.sizeGB, 0);
      handle.set((s) => {
        const restorePoints = s.restorePoints.filter((p) => !removeIds.has(p.id));
        // Re-derive the VM's denormalized backup summary from what's left, so the
        // count / protection never outlive the points behind them.
        const remaining = restorePoints.filter((p) => p.vmId === vmId);
        const count = remaining.length;
        let lastBackupAt: string | null = null;
        for (const p of remaining)
          if (lastBackupAt === null || p.createdAt > lastBackupAt) lastBackupAt = p.createdAt;
        return {
          restorePoints,
          repositories: s.repositories.map((r) =>
            r.id === repositoryId ? { ...r, usedGB: Math.max(0, r.usedGB - freedGB) } : r,
          ),
          vms: s.vms.map((v) =>
            v.id === vmId
              ? {
                  ...v,
                  restorePointCount: count,
                  lastBackupAt,
                  protection: count === 0 ? "unprotected" : v.protection,
                }
              : v,
          ),
          revision: s.revision + 1,
        };
      });
      return Promise.resolve<RestorePointDeleteResult>({ ok: true });
    },

    createRepository: (input) => {
      const repo: Repository = {
        id: uid("repo"),
        name: input.name,
        type: input.type,
        path: input.path,
        capacityGB: input.capacityGB,
        usedGB: 0,
        dedupRatio: 1,
        status: "healthy",
        usageTrend: Array.from({ length: 14 }, () => 0),
        integrityStatus: "never",
        lastScanAt: null,
      };
      handle.set((s) => ({
        repositories: [...s.repositories, repo],
        revision: s.revision + 1,
      }));
      return Promise.resolve(repo);
    },

    deleteRepository: (id) => {
      const state = handle.get();
      const points = state.restorePoints.filter((p) => p.repositoryId === id);
      const jobs: BlockingJobRef[] = state.jobs
        .filter((j) => j.repositoryId === id)
        .map((j) => ({ id: j.id, name: j.name }));
      if (jobs.length > 0) return Promise.resolve<RepoDeleteResult>({ ok: false, reason: "jobs", jobs });
      const removedVmIds = new Set(points.map((p) => p.vmId));
      handle.set((s) => ({
        repositories: s.repositories.filter((r) => r.id !== id),
        restorePoints: s.restorePoints.filter((p) => p.repositoryId !== id),
        vms: s.vms.map((v) =>
          removedVmIds.has(v.id)
            ? { ...v, restorePointCount: Math.max(0, v.restorePointCount - points.filter((p) => p.vmId === v.id).length) }
            : v,
        ),
        revision: s.revision + 1,
      }));
      return Promise.resolve<RepoDeleteResult>({ ok: true });
    },

    rescanRepository: (id) => {
      handle.set((state) => ({
        repositories: state.repositories.map((r) =>
          r.id === id ? { ...r, integrityStatus: "scanning", lastScanAt: nowIso() } : r,
        ),
        revision: state.revision + 1,
      }));
      // Settle the scan a couple of seconds later, guarded against a mode switch.
      setTimeout(() => {
        if (intervalId === null) return;
        handle.set((state) => ({
          repositories: state.repositories.map((r) => {
            if (r.id !== id) return r;
            const frag = Math.max(0, Math.round((r.fragmentationPct ?? 8) * 0.7));
            return {
              ...r,
              fragmentationPct: frag,
              integrityStatus: frag > 25 ? "issues" : "verified",
              lastScanAt: nowIso(),
            };
          }),
          revision: state.revision + 1,
        }));
      }, 2500);
      return Promise.resolve();
    },

    setRepositoryMaintenance: (id, maintenance) => {
      handle.set((state) => ({
        repositories: state.repositories.map((r) => (r.id === id ? { ...r, maintenanceMode: maintenance } : r)),
        revision: state.revision + 1,
      }));
      return Promise.resolve();
    },

    // Sim has no appliance to actually dial out to, so this only replays the
    // same format checks the real backend runs before it ever reaches the
    // network — bucket/region present, endpoint a valid http(s) URL — then
    // resolves as reachable. It cannot simulate a real DNS/credential failure.
    testS3Connection: (config) => {
      const checks: { name: string; status: "ok" | "failed" | "skipped"; message?: string }[] = [];
      const bucket = config.bucket.trim();
      if (!bucket) {
        return Promise.resolve({
          ok: false,
          message: "S3 bucket is missing",
          checks: [{ name: "bucket", status: "failed" }],
        });
      }
      checks.push({ name: "bucket", status: "ok", message: bucket });

      const region = config.region?.trim();
      if (!region) {
        checks.push({ name: "region", status: "failed" });
        return Promise.resolve({ ok: false, message: "S3 region is missing", checks });
      }
      checks.push({ name: "region", status: "ok", message: region });

      const endpointUrl = config.endpointUrl?.trim();
      if (endpointUrl) {
        let validEndpoint = false;
        try {
          const parsed = new URL(endpointUrl);
          validEndpoint = parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          validEndpoint = false;
        }
        if (!validEndpoint) {
          checks.push({ name: "endpoint_url", status: "failed" });
          return Promise.resolve({ ok: false, message: "S3 endpoint URL is invalid", checks });
        }
        checks.push({ name: "endpoint_url", status: "ok", message: endpointUrl });
      }

      checks.push({ name: "connectivity", status: "ok", message: "Bucket/prefix access validated (simulated)" });
      return new Promise((resolve) =>
        setTimeout(() => resolve({ ok: true, message: "S3 connection succeeded", checks }), 600),
      );
    },

    /* --------------------------- replication --------------------------- */
    failoverReplica: (id, input) => {
      handle.set((s) => ({
        replicas: s.replicas.map((r) =>
          r.id === id && r.state !== "failover"
            ? {
                ...r,
                state: "failover" as const,
                poweredOn: true,
                activePointId:
                  (input.pointId && r.points.some((p) => p.id === input.pointId)
                    ? input.pointId
                    : r.points.at(-1)?.id) ?? null,
              }
            : r,
        ),
        revision: s.revision + 1,
      }));
      return Promise.resolve();
    },
    failbackReplica: (id) => {
      handle.set((s) => ({
        replicas: s.replicas.map((r) =>
          r.id === id && r.state === "failover"
            ? { ...r, state: "ready" as const, poweredOn: false, activePointId: null, lastSyncAt: nowIso() }
            : r,
        ),
        revision: s.revision + 1,
      }));
      return Promise.resolve();
    },
    undoFailover: (id) => {
      handle.set((s) => ({
        replicas: s.replicas.map((r) =>
          r.id === id && r.state === "failover"
            ? { ...r, state: "ready" as const, poweredOn: false, activePointId: null }
            : r,
        ),
        revision: s.revision + 1,
      }));
      return Promise.resolve();
    },
  };

  return {
    mode: "sim",
    actions,
    start: () => {
      if (intervalId !== null) return Promise.resolve();
      const seed = createSeedWorld();
      handle.set({
        ...seed,
        alerts: applyReadState(seed.alerts),
        liveLogs: seedLiveLogs(seed),
        ready: true,
        connected: true,
        revision: handle.get().revision + 1,
      });
      intervalId = setInterval(tick, TICK_MS);
      return Promise.resolve();
    },
    stop: () => {
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = null;
    },
  };
}
