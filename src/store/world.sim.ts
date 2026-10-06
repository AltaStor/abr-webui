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
import {
  resolveSyntheticFullChain,
  syntheticFullRefusalMessage,
  validateSyntheticFull,
} from "@/lib/synthetic-full";
import { formatDateTime, verifyRunName } from "@/lib/format";
import { nextFullBackupRun } from "@/lib/schedule";
import type {
  Alert,
  ApplyImmutabilityResult,
  BackupJob,
  Environment,
  EnvironmentType,
  FullBackupSchedule,
  Host,
  Hypervisor,
  ImmutabilityEffect,
  LogLine,
  Repository,
  RepositoryImmutability,
  RepositoryValidationResult,
  RestoreDatastoreOption,
  RestoreExistingVmOption,
  RestoreNetworkOption,
  RestorePoint,
  RetentionChainReport,
  RetentionRunResult,
  RestoreSourceDisk,
  RestoreSourceNic,
  S3ConnectionCheck,
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
  RepositoryWriteResult,
  RestorePointDeleteResult,
  SyntheticFullStartResult,
  VerifyBackupResult,
  WorldActions,
  WorldDriver,
  WorldHandle,
  WorldState,
} from "@/store/world.types";
import { retentionRefused } from "@/store/world.types";

/* --------------------------- id / time helpers -------------------------- */
let _id = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(_id++).toString(36)}`;
const nowIso = () => new Date().toISOString();
const TICK_MS = 1200;
const TICK_SECONDS = TICK_MS / 1000;

/**
 * The demo world's stand-in for the appliance's `immutability_effect` report.
 *
 * Written to say the same things the real one says — what the setting governs
 * from now on, what it cannot reach (the points already stored), and where it
 * disagrees with the retention of the jobs writing here — because this text is
 * the whole point of the panel that renders it. What it can't do is inspect a
 * bucket, so it never reports a storage-side limitation.
 */
function simImmutabilityEffect(
  state: WorldState,
  repositoryId: string,
  lock: { previous: RepositoryImmutability; current: RepositoryImmutability },
): ImmutabilityEffect {
  const { previous, current } = lock;
  const enabled = (c: RepositoryImmutability) => c.mode !== "none" && c.retentionDays > 0;
  const existing = state.restorePoints.filter((p) => p.repositoryId === repositoryId).length;
  const effect = enabled(current)
    ? [
        `Backups created from now on are written under ${current.mode} Object Lock retention and cannot be ` +
          `deleted or overwritten for ${current.retentionDays} day(s), counted from each backup's own creation time.`,
      ]
    : ["Immutability is disabled: new backups are written without Object Lock retention and stay deletable."];

  const limitations: string[] = [];
  if (existing > 0) {
    limitations.push(
      `${existing} restore point(s) are already stored in this repository. Changing this setting does not touch ` +
        "them; apply it to stored backups to put them under the current one.",
    );
    limitations.push(
      enabled(previous)
        ? `Each keeps the retention it was written with: ${previous.mode} for ${previous.retentionDays} day(s) ` +
          "from its own creation for those written under that setting, none for any written before immutability was enabled."
        : "They were written without Object Lock, so they stay deletable and are not protected by this configuration.",
    );
  }
  const rank = (mode: RepositoryImmutability["mode"]) =>
    mode === "compliance" ? 2 : mode === "governance" ? 1 : 0;
  if (
    rank(current.mode) < rank(previous.mode) ||
    (enabled(current) && enabled(previous) && current.retentionDays < previous.retentionDays)
  ) {
    limitations.push(
      "Object Lock retention that is already written can never be shortened or removed, so relaxing immutability " +
        "only affects backups created from now on.",
    );
  }

  const warnings: string[] = [];
  if (enabled(current)) {
    for (const job of state.jobs.filter((j) => j.repositoryId === repositoryId)) {
      const keep = job.retention.keepDays;
      if (keep <= 0) continue;
      if (keep < current.retentionDays) {
        warnings.push(
          `Job '${job.name}' keeps restore points for ${keep} day(s), but backups written to this repository stay ` +
            `locked for ${current.retentionDays} day(s); retention cannot delete them until the lock expires.`,
        );
      } else if (current.retentionDays < keep) {
        warnings.push(
          `Job '${job.name}' keeps restore points for ${keep} day(s), but they are locked for only ` +
            `${current.retentionDays} day(s); from day ${current.retentionDays} to day ${keep} its backups are ` +
            "still needed but can be deleted. Raise the immutability period to cover the whole retention.",
        );
      }
    }
  }

  return {
    previous,
    current,
    changed: previous.mode !== current.mode || previous.retentionDays !== current.retentionDays,
    existingRestorePoints: existing,
    existingDataProtected: false,
    effect,
    limitations,
    warnings,
  };
}

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

/** A full schedule's next firing, as the appliance stamps `*_full_next_run_at`. */
function fullNextRun(schedule: FullBackupSchedule | null | undefined): string | null {
  return schedule ? (nextFullBackupRun(schedule, new Date())?.toISOString() ?? null) : null;
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

/**
 * The source VM's disks, as a restore point would record them — deterministic
 * per VM, and deliberately spread over more than one datastore for some VMs:
 * the demo world is where the multi-datastore placement UI gets exercised, and
 * a world where every VM sits on exactly one datastore would never show it.
 */
function vmSourceDisks(vm: VM): RestoreSourceDisk[] {
  const catalog = vm.environmentId === "env-prox" ? PROXMOX_DATASTORES : VSPHERE_DATASTORES;
  const home = vmOriginalDatastore(vm);
  const roll = seededRandom(hashId(`${vm.id}-disks`))();
  const diskCount = 1 + Math.round(roll * 2);
  const second = catalog.find((name) => name !== home) ?? home;
  const provisionedBytes = Math.max(vm.provisionedGB, 1) * 1_000_000_000;
  const usedBytes = Math.max(vm.usedGB, 1) * 1_000_000_000;
  return Array.from({ length: diskCount }, (_, index) => ({
    id: `${vm.id}::disk::${index + 1}`,
    label: `Hard disk ${index + 1}`,
    capacityBytes: Math.round(provisionedBytes / diskCount),
    usedBytes: Math.round(usedBytes / diskCount),
    // The first disk is the system disk and stays thick; the rest are thin, so
    // the two figures above are both exercised by the capacity check.
    provisioning: index === 0 ? "vmfs_thick" : "vmfs_thin",
    // Second and later disks live elsewhere — that is the case being modelled.
    sourceDatastore: index === 0 ? home : second,
  }));
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
              // A synthetic full merges the chain rather than reading the VM,
              // so it lands as a FULL point the size of one — the run just
              // moved no data off the source host to get there.
              const isFullPoint = isFirstForVm || Boolean(s.synthetic);
              const storedGB = isFullPoint
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
                type: isFullPoint ? "full" : "incremental",
                sizeGB: storedGB,
                repositoryId: job.repositoryId,
                logicalGB: Math.round(storedGB / ratio),
                compressionRatio: ratio,
                compressionLevel: job.options.compression,
                encrypted: job.options.encryption,
                gfsProtected: false,
                synthetic: Boolean(s.synthetic),
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
        activeFullSchedule: input.activeFullSchedule ?? null,
        syntheticFullSchedule: input.syntheticFullSchedule ?? null,
        activeFullNextRunAt: fullNextRun(input.activeFullSchedule),
        syntheticFullNextRunAt: fullNextRun(input.syntheticFullSchedule),
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
          // Like the appliance, only a schedule that was sent gets a new next
          // run, and a disabled job keeps none.
          const live = next.state !== "disabled";
          if (patch.activeFullSchedule !== undefined) {
            next.activeFullNextRunAt = live ? fullNextRun(patch.activeFullSchedule) : null;
          }
          if (patch.syntheticFullSchedule !== undefined) {
            next.syntheticFullNextRunAt = live ? fullNextRun(patch.syntheticFullSchedule) : null;
          }
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
          j.id === jobId
            ? {
                ...j,
                state: enabled ? "idle" : "disabled",
                nextRunAt: enabled ? computeNextRun(j.schedule) : null,
                // The full schedules ride along with the job's own switch.
                activeFullNextRunAt: enabled ? fullNextRun(j.activeFullSchedule) : null,
                syntheticFullNextRunAt: enabled ? fullNextRun(j.syntheticFullSchedule) : null,
              }
            : j,
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
        if (input.datastoreMappings?.length) {
          // Named individually: which datastore each one lands on is the whole
          // point of the mapping, and a count would hide it.
          for (const mapping of input.datastoreMappings) {
            const target = state.hosts
              .flatMap((h) => hostDatastoreNames(h).map((name) => ({ id: `${h.environmentId}::datastore::${name}`, name })))
              .find((d) => d.id === mapping.target)?.name;
            logs.push(
              makeLog("info", `Placing disks from ${mapping.sourceDatastore} on ${target ?? mapping.target}…`),
            );
          }
        }
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
      const sourceDisks = vm ? vmSourceDisks(vm) : [];
      return Promise.resolve({
        sourceNics,
        sourceDisks,
        datastores: Array.from(datastoreMap.values()),
        networks,
        existingVms,
        originalDatastore,
        originalHost,
        defaultHostId: vm?.hostId ?? null,
        defaultDatastoreId: null,
        defaultEnvironmentId: vm?.environmentId ?? null,
        // No appliance to resolve a default target, so the wizard pairs by name
        // and lets the operator finish it — same as any other target
        // environment that isn't the restore point's own.
        defaultDatastoreMappings: [],
      });
    },

    /* --------------------- repository lifecycle --------------------- */
    editRepository: (id, patch) => {
      const before = handle.get().repositories.find((r) => r.id === id);
      if (!before) {
        return Promise.resolve<RepositoryWriteResult>({
          ok: false,
          message: "Repository not found",
          checks: [],
        });
      }
      // Mirrors the appliance's refusal: Object Lock exists only where the
      // backend has the concept, so the demo world rejects it in the same
      // place rather than silently accepting a setting that means nothing.
      if (patch.immutability && !before.supportsImmutability) {
        return Promise.resolve<RepositoryWriteResult>({
          ok: false,
          message: "Immutability is only available for S3 repositories",
          checks: [],
        });
      }
      const updated: Repository = {
        ...before,
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.capacityGB !== undefined && { capacityGB: patch.capacityGB }),
        ...(patch.compression !== undefined && { compression: patch.compression }),
        ...(patch.ioThrottleMBps !== undefined && { ioThrottleMBps: patch.ioThrottleMBps }),
        ...(patch.maxConcurrentTasks !== undefined && { maxConcurrentTasks: patch.maxConcurrentTasks }),
        ...(patch.maintenanceMode !== undefined && { maintenanceMode: patch.maintenanceMode }),
        ...(patch.immutability !== undefined && { immutability: patch.immutability }),
      };
      handle.set((state) => ({
        repositories: state.repositories.map((r) => (r.id === id ? updated : r)),
        revision: state.revision + 1,
      }));
      return Promise.resolve<RepositoryWriteResult>({
        ok: true,
        repository: updated,
        immutabilityEffect:
          patch.immutability === undefined
            ? null
            : simImmutabilityEffect(handle.get(), id, {
                previous: before.immutability ?? { mode: "none", retentionDays: 0 },
                current: patch.immutability,
              }),
      });
    },

    deleteRestorePoint: (chainId, segmentId, force) => {
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
      if (!force && targetPoints.some((p) => p.gfsProtected))
        return Promise.resolve<RestorePointDeleteResult>({ ok: false, reason: "gfs-protected" });
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

    /* ------------------------- runSyntheticFull ------------------------ */
    /* The demo world has no repository to merge in, so this stages the run the
     * appliance would produce and lets the ordinary tick loop finish it — the
     * session settles like any other backup, and its completion writes a FULL
     * restore point flagged `synthetic` (see the tick's point-creation above).
     *
     * It refuses through the SAME rules the live driver's appliance applies
     * (@/lib/synthetic-full), so a chain that could not be merged against a
     * real appliance cannot be merged here either — a demo that accepted what
     * production refuses would be worse than no demo. */
    /* Retention, by the appliance's rule (apply_retention_to_chain): a
     * full-plus-incrementals segment goes only when every point in it has
     * expired and none is kept by GFS; under a GFS-kept full, its expired
     * incrementals may go alone. The demo has no Object Lock to hold anything. */
    runRetention: (jobId, dryRun) => {
      const state = handle.get();
      const job = state.jobs.find((j) => j.id === jobId);
      if (!job) return Promise.resolve(retentionRefused(jobId, dryRun, "Job not found"));
      if (job.type !== "backup") {
        return Promise.resolve(retentionRefused(jobId, dryRun, "Retention applies to backup jobs"));
      }
      const cutoff = Date.now() - job.retention.keepDays * 86_400_000;
      const expired = (point: RestorePoint) => new Date(point.createdAt).getTime() < cutoff;
      const chains = new Map<string, RestorePoint[]>();
      for (const point of state.restorePoints) {
        if (point.jobId !== jobId) continue;
        const key = `${point.vmId}::${point.repositoryId}`;
        chains.set(key, [...(chains.get(key) ?? []), point]);
      }
      const reports: RetentionChainReport[] = [...chains.values()].map((points) => {
        const removed: string[] = [];
        for (const segment of segmentChainPoints(points)) {
          const all = segment.points;
          const incrementals = all.filter((point) => point.type !== "full");
          if (segment.full?.gfsProtected) {
            if (incrementals.length && incrementals.every((point) => expired(point) && !point.gfsProtected)) {
              removed.push(...incrementals.map((point) => point.id));
            }
          } else if (all.every(expired) && !all.some((point) => point.gfsProtected)) {
            removed.push(...all.map((point) => point.id));
          }
        }
        const first = points[0];
        return {
          vmId: first.vmId,
          vmName: first.vmName || null,
          repositoryId: first.repositoryId || null,
          repositoryName: state.repositories.find((r) => r.id === first.repositoryId)?.name ?? null,
          points: points.length,
          removed,
          held: [],
          failed: [],
          keptForChain: [],
          skippedReason: null,
        };
      });
      const removedIds = new Set(reports.flatMap((report) => report.removed));
      if (!dryRun && removedIds.size > 0) {
        handle.set((s) => ({
          restorePoints: s.restorePoints.filter((point) => !removedIds.has(point.id)),
          revision: s.revision + 1,
        }));
      }
      return Promise.resolve<RetentionRunResult>({
        ok: true,
        jobId,
        jobName: job.name,
        dryRun,
        retentionDays: job.retention.keepDays,
        summary: {
          chains: reports.length,
          points: reports.reduce((sum, report) => sum + report.points, 0),
          removed: removedIds.size,
          held: 0,
          failed: 0,
          skipped: 0,
        },
        chains: reports,
        ranAt: nowIso(),
      });
    },

    runSyntheticFull: ({ jobId, vmId, targetRepositoryId }) => {
      const state = handle.get();
      const job = state.jobs.find((j) => j.id === jobId);
      if (!job) {
        return Promise.resolve<SyntheticFullStartResult>({
          ok: false,
          message: syntheticFullRefusalMessage({ code: "no-job" }),
        });
      }
      const chain = resolveSyntheticFullChain(vmId, jobId, state);
      const refusal = validateSyntheticFull(chain, state, targetRepositoryId);
      if (refusal || !chain) {
        return Promise.resolve<SyntheticFullStartResult>({
          ok: false,
          message: syntheticFullRefusalMessage(refusal ?? { code: "no-chain" }),
        });
      }

      const id = uid("sess");
      // Per-job, not per-VM: the appliance resolves EVERY VM the job covers to
      // a synthetic full, and the demo has to show the same blast radius or
      // the dialog's warning would read as a lie here.
      const scope = job.vmIds.slice(0, Math.min(job.vmIds.length, 10));
      const session: Session = {
        id,
        jobId: job.id,
        jobName: job.name,
        type: "backup",
        status: "running",
        backupType: "full",
        synthetic: true,
        startedAt: nowIso(),
        finishedAt: null,
        durationSec: 0,
        progress: 0,
        processedGB: 0,
        transferredGB: 0,
        // A merge is repository-to-repository: no guest read, no network hop,
        // so it runs at storage speed rather than a backup's wire speed.
        throughputMBps: 1100,
        vmCount: scope.length,
        vmResults: scope.map((scopedVmId, idx) => {
          const vm = state.vms.find((v) => v.id === scopedVmId);
          return {
            vmId: scopedVmId,
            vmName: vm?.name ?? scopedVmId,
            status: idx === 0 ? ("running" as const) : ("pending" as const),
            processedGB: 0,
            transferredGB: 0,
            durationSec: 0,
          };
        }),
        triggeredBy: "manual",
      };

      handle.set({
        sessions: [session, ...state.sessions],
        jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, state: "running", lastStatus: "running" } : j)),
        liveLogs: {
          ...state.liveLogs,
          [id]: [
            makeLog("info", `Synthetic full of ${chain.vmName} — merging ${chain.points.length} restore point(s)`, chain.vmName),
            makeLog(
              "info",
              `Reading the full backup of ${formatDateTime(chain.full?.createdAt ?? chain.points[0].createdAt)} and ${chain.incrementals.length} incremental(s)`,
              chain.vmName,
            ),
            makeLog("info", "No data is read from the source host", chain.vmName),
          ],
        },
        revision: state.revision + 1,
      });
      return Promise.resolve<SyntheticFullStartResult>({ ok: true, sessionId: id, sessionIds: [id] });
    },

    /* The demo world has no artifacts to re-read, so this stages the run the
     * appliance would produce — a verify session per chain, settling clean a
     * few seconds later — rather than resolving into nothing. What it cannot
     * do is FIND corruption: every simulated verification passes. */
    verifyBackups: (chainIds) => {
      const state = handle.get();
      const sessionIds: string[] = [];
      const sessions: Session[] = [];
      const logs: Record<string, LogLine[]> = {};
      for (const chainId of chainIds) {
        const points = state.restorePoints.filter((p) => p.chainId === chainId);
        if (points.length === 0) continue;
        const id = uid("sess");
        sessionIds.push(id);
        const vmName = points[0].vmName;
        sessions.push({
          id,
          jobId: points[0].jobId,
          jobName: verifyRunName(vmName),
          type: "verify",
          status: "running",
          backupType: "full",
          startedAt: nowIso(),
          finishedAt: null,
          durationSec: 0,
          progress: 0,
          processedGB: 0,
          transferredGB: 0,
          throughputMBps: 0,
          vmCount: 1,
          vmResults: [
            { vmId: points[0].vmId, vmName, status: "running", processedGB: 0, transferredGB: 0, durationSec: 0 },
          ],
          triggeredBy: "manual",
        });
        logs[id] = [
          makeLog("info", `Verifying ${points.length} restore point(s) of ${vmName}`, vmName),
        ];
      }
      if (sessionIds.length === 0) {
        return Promise.resolve<VerifyBackupResult>({ ok: false, message: "No stored backups to verify" });
      }
      handle.set((s) => ({
        sessions: [...sessions, ...s.sessions],
        liveLogs: { ...s.liveLogs, ...logs },
        revision: s.revision + 1,
      }));
      const done = new Set(sessionIds);
      setTimeout(() => {
        // Guarded against a mode switch, same as the simulated repository scan.
        if (intervalId === null) return;
        handle.set((s) => ({
          sessions: s.sessions.map((session) =>
            done.has(session.id)
              ? {
                  ...session,
                  status: "success" as const,
                  progress: 100,
                  finishedAt: nowIso(),
                  durationSec: 4,
                  vmResults: session.vmResults.map((r) => ({ ...r, status: "success" as const, durationSec: 4 })),
                }
              : session,
          ),
          liveLogs: Object.fromEntries(
            Object.entries(s.liveLogs).map(([id, lines]) =>
              done.has(id) ? [id, [...lines, makeLog("success", "All artifacts verified")]] : [id, lines],
            ),
          ),
          revision: s.revision + 1,
        }));
      }, 4000);
      return Promise.resolve<VerifyBackupResult>({ ok: true, sessionIds });
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
        // Read back the way the appliance reports it, so the demo world's
        // repository card carries the same lock badge a real one does.
        supportsImmutability: input.type === "object-lock-s3",
        immutability:
          input.type === "object-lock-s3"
            ? (input.s3?.immutability ?? { mode: "none", retentionDays: 0 })
            : null,
      };
      handle.set((s) => ({
        repositories: [...s.repositories, repo],
        revision: s.revision + 1,
      }));
      return Promise.resolve<RepositoryWriteResult>({
        ok: true,
        repository: repo,
        immutabilityEffect: repo.immutability
          ? simImmutabilityEffect(handle.get(), repo.id, {
              previous: { mode: "none", retentionDays: 0 },
              current: repo.immutability,
            })
          : null,
      });
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

      // The demo bucket always supports Object Lock; the point of running the
      // check here is that the dialog's result panel looks the same in both
      // worlds, not that anything is really probed.
      const lock = config.immutability;
      let message = "S3 connection succeeded";
      if (lock && lock.mode !== "none") {
        checks.push({
          name: "immutability_mode",
          status: "ok",
          message: `${lock.mode} is available on this bucket (simulated)`,
        });
        checks.push({
          name: "retention_period",
          status: "ok",
          message: `${lock.retentionDays} day(s) requested (simulated)`,
        });
        message = `S3 repository is validated for immutable backups: ${lock.mode} for ${lock.retentionDays} day(s)`;
      }

      return new Promise((resolve) => setTimeout(() => resolve({ ok: true, message, checks }), 600));
    },

    /* ------------------- repository validation / Object Lock ------------- */
    /* Nothing to dial out to here, so these replay the SHAPE of the appliance's
     * answers — the same checks by name, the same verdict fields — so the panel
     * that renders them looks and behaves the same in both worlds. What they
     * cannot do is find a real problem: every simulated validation passes. */
    verifyRepository: (id) => {
      const repo = handle.get().repositories.find((r) => r.id === id);
      if (!repo) {
        return Promise.resolve<RepositoryValidationResult>({
          ok: false,
          message: "Repository not found",
          checks: [],
        });
      }
      const lock = repo.immutability;
      const locked = Boolean(lock && lock.mode !== "none" && lock.retentionDays > 0);
      const checks: S3ConnectionCheck[] = [
        { name: "connectivity", status: "ok", message: `${repo.path} is reachable (simulated)` },
      ];
      if (repo.supportsImmutability) {
        checks.push(
          locked
            ? {
                name: "immutability",
                status: "ok",
                message: `${lock!.mode} for ${lock!.retentionDays} day(s) (simulated)`,
              }
            : {
                name: "immutability",
                status: "skipped",
                message:
                  "Repository immutability is disabled; backups are written without Object Lock retention",
              },
        );
      }
      checks.push({
        name: "block_consistency",
        status: "ok",
        message: "All stored backups are consistent (simulated)",
      });
      handle.set((state) => ({
        repositories: state.repositories.map((r) =>
          r.id === id ? { ...r, integrityStatus: "verified" as const, lastScanAt: nowIso() } : r,
        ),
        revision: state.revision + 1,
      }));
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              message: `Repository is available; immutability: ${
                locked ? `${lock!.mode} for ${lock!.retentionDays} day(s)` : "disabled, backups stay deletable"
              }`,
              checks,
            }),
          700,
        ),
      );
    },

    verifyRepositoryImmutability: (id) => {
      const state = handle.get();
      const repo = state.repositories.find((r) => r.id === id);
      if (!repo || !repo.supportsImmutability) {
        return Promise.resolve<RepositoryValidationResult>({
          ok: false,
          message: "Immutability is only available for S3 repositories",
          checks: [],
        });
      }
      const lock = repo.immutability ?? { mode: "none" as const, retentionDays: 0 };
      const locked = lock.mode !== "none" && lock.retentionDays > 0;
      const checks: S3ConnectionCheck[] = [
        { name: "object_lock", status: "ok", message: "Object Lock is enabled, up to 'compliance' mode (simulated)" },
        { name: "versioning", status: "ok", message: "Bucket versioning confirmed by behaviour (simulated)" },
      ];
      if (locked) {
        checks.push(
          { name: "immutability_mode", status: "ok", message: `${lock.mode} is available on this bucket` },
          { name: "retention_period", status: "ok", message: `${lock.retentionDays} day(s) requested` },
          { name: "write_retention", status: "ok", message: `A test backup was written under ${lock.mode} Object Lock retention` },
          { name: "worm_enforcement", status: "ok", message: "Deleting the locked test backup was refused by the storage" },
        );
      } else {
        checks.push({
          name: "immutability_mode",
          status: "skipped",
          message: "Repository immutability is disabled; the bucket would support it if it is enabled",
        });
      }
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              message: locked
                ? `Repository is validated for immutable backups: ${lock.mode} for ${lock.retentionDays} day(s)`
                : "Bucket supports immutable backups; repository immutability is currently disabled",
              checks,
              immutabilityEffect: simImmutabilityEffect(state, id, { previous: lock, current: lock }),
            }),
          900,
        ),
      );
    },

    applyRepositoryImmutability: (id) => {
      const state = handle.get();
      const repo = state.repositories.find((r) => r.id === id);
      const lock = repo?.immutability ?? { mode: "none" as const, retentionDays: 0 };
      const points = state.restorePoints.filter((p) => p.repositoryId === id).length;
      if (!repo || lock.mode === "none" || lock.retentionDays <= 0) {
        return Promise.resolve<ApplyImmutabilityResult>({
          ok: false,
          message: "Repository immutability is disabled; enable it before applying it to stored backups",
          immutability: lock,
          restorePointCount: points,
          updatedRestorePoints: 0,
          failedRestorePoints: 0,
          actualRetentionDays: [],
        });
      }
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              message: points
                ? `${points} restore point(s) are now held in ${lock.mode} mode for ${lock.retentionDays} day(s), counted from now`
                : "Repository holds no restore points; nothing to place under Object Lock",
              immutability: lock,
              restorePointCount: points,
              updatedRestorePoints: points,
              failedRestorePoints: 0,
              actualRetentionDays: points ? [lock.retentionDays] : [],
            }),
          1100,
        ),
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
