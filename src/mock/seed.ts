// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { seededRandom } from "@/lib/utils";
import { simChainId, simCompressionRatio } from "@/lib/restore-points";
import type {
  Alert,
  BackupJob,
  Environment,
  Host,
  Replica,
  ReplicaPoint,
  ReplicaState,
  Repository,
  RestorePoint,
  Session,
  SessionStatus,
  Threat,
  VM,
  VmRunResult,
} from "@/types";

export interface World {
  environments: Environment[];
  hosts: Host[];
  vms: VM[];
  jobs: BackupJob[];
  sessions: Session[];
  restorePoints: RestorePoint[];
  repositories: Repository[];
  alerts: Alert[];
  threats: Threat[];
  replicas: Replica[];
}

/* ----------------------------- time helpers ----------------------------- */
const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const hoursFromNow = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

/* ------------------------------- catalogs ------------------------------- */
interface VmTemplate {
  base: string;
  count: number;
  osFamily: "windows" | "linux";
  guestOs: string;
  size: [number, number];
  tags: string[];
}

const TEMPLATES: VmTemplate[] = [
  { base: "DC", count: 2, osFamily: "windows", guestOs: "Windows Server 2022", size: [40, 80], tags: ["production", "critical", "tier-1", "infra"] },
  { base: "DNS-", count: 2, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [16, 32], tags: ["production", "infra"] },
  { base: "SQL-PROD-", count: 4, osFamily: "windows", guestOs: "Windows Server 2022", size: [320, 900], tags: ["production", "sql", "critical", "tier-1", "pci"] },
  { base: "PG-PROD-", count: 2, osFamily: "linux", guestOs: "Debian 12", size: [220, 640], tags: ["production", "sql", "tier-1"] },
  { base: "MONGO-", count: 2, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [180, 420], tags: ["production", "sql"] },
  { base: "REDIS-", count: 2, osFamily: "linux", guestOs: "Alpine 3.19", size: [8, 24], tags: ["production", "tier-1"] },
  { base: "EXCH-", count: 2, osFamily: "windows", guestOs: "Windows Server 2019", size: [400, 720], tags: ["production", "critical", "tier-1"] },
  { base: "SHAREPOINT-", count: 1, osFamily: "windows", guestOs: "Windows Server 2019", size: [260, 480], tags: ["production"] },
  { base: "web-frontend-", count: 6, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [20, 60], tags: ["production", "web", "dmz"] },
  { base: "nginx-lb-", count: 2, osFamily: "linux", guestOs: "Alpine 3.19", size: [8, 16], tags: ["production", "web", "dmz"] },
  { base: "api-gateway-", count: 2, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [24, 48], tags: ["production", "web", "tier-1"] },
  { base: "app-prod-", count: 8, osFamily: "linux", guestOs: "Rocky Linux 9", size: [40, 120], tags: ["production"] },
  { base: "erp-app-", count: 1, osFamily: "windows", guestOs: "Windows Server 2022", size: [180, 320], tags: ["production", "finance", "critical"] },
  { base: "crm-app-", count: 1, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [120, 220], tags: ["production", "finance"] },
  { base: "FILESRV-", count: 3, osFamily: "windows", guestOs: "Windows Server 2022", size: [800, 2400], tags: ["production", "files", "critical"] },
  { base: "k8s-master-", count: 3, osFamily: "linux", guestOs: "Talos Linux", size: [40, 80], tags: ["production", "k8s", "tier-1"] },
  { base: "k8s-worker-", count: 9, osFamily: "linux", guestOs: "Talos Linux", size: [80, 200], tags: ["production", "k8s"] },
  { base: "GITLAB-", count: 1, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [120, 280], tags: ["production"] },
  { base: "JENKINS-", count: 1, osFamily: "linux", guestOs: "Debian 12", size: [60, 140], tags: ["production"] },
  { base: "ELASTIC-", count: 3, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [200, 520], tags: ["production"] },
  { base: "GRAFANA-", count: 1, osFamily: "linux", guestOs: "Alpine 3.19", size: [12, 28], tags: ["production"] },
  { base: "RDS-", count: 4, osFamily: "windows", guestOs: "Windows Server 2022", size: [80, 180], tags: ["production", "vdi"] },
  { base: "VDI-POOL-", count: 6, osFamily: "windows", guestOs: "Windows 11 Enterprise", size: [60, 120], tags: ["vdi"] },
  { base: "SIEM-", count: 1, osFamily: "linux", guestOs: "Rocky Linux 9", size: [300, 640], tags: ["production", "security", "tier-1"] },
  { base: "VAULT-SECRETS-", count: 1, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [16, 32], tags: ["production", "security", "critical"] },
  { base: "app-staging-", count: 6, osFamily: "linux", guestOs: "Rocky Linux 9", size: [30, 90], tags: ["staging"] },
  { base: "web-staging-", count: 3, osFamily: "linux", guestOs: "Ubuntu 22.04 LTS", size: [16, 40], tags: ["staging", "web"] },
  { base: "dev-sandbox-", count: 5, osFamily: "linux", guestOs: "Ubuntu 24.04 LTS", size: [20, 60], tags: ["dev"] },
  { base: "build-runner-", count: 3, osFamily: "linux", guestOs: "Debian 12", size: [40, 80], tags: ["dev"] },
];

const TAG_POOL = [
  "production", "staging", "dev", "critical", "tier-1",
  "sql", "web", "k8s", "dmz", "finance", "files", "vdi",
  "security", "pci", "infra",
];

/* ----------------------------- environments ----------------------------- */
function buildEnvironments(): Environment[] {
  return [
    { id: "env-hq", name: "HQ Datacenter", type: "vcenter", hypervisor: "vmware", version: "vSphere 8.0 U3", endpoint: "vcsa-hq.corp.local", connected: true, hostCount: 5, vmCount: 0 },
    { id: "env-dr", name: "DR Site — West", type: "vcenter", hypervisor: "vmware", version: "vSphere 8.0 U2", endpoint: "vcsa-dr.corp.local", connected: true, hostCount: 3, vmCount: 0 },
    { id: "env-edge", name: "Branch Office", type: "esxi-standalone", hypervisor: "vmware", version: "ESXi 7.0 U3", endpoint: "esxi-bo1.corp.local", connected: true, hostCount: 1, vmCount: 0 },
    { id: "env-prox", name: "Migration Cluster", type: "proxmox", hypervisor: "proxmox", version: "Proxmox VE 8.2", endpoint: "pve-mig.corp.local", connected: true, hostCount: 2, vmCount: 0 },
  ];
}

function buildHosts(envs: Environment[]): Host[] {
  const hosts: Host[] = [];
  // Cluster layout per environment — HQ spans two clusters so the topology tree is meaningful.
  const clusterFor = (envId: string, i: number): string => {
    if (envId === "env-hq") return i <= 3 ? "HQ-Cluster-01" : "HQ-Cluster-02";
    if (envId === "env-dr") return "DR-Cluster";
    if (envId === "env-edge") return "Standalone";
    if (envId === "env-prox") return "pve-mig";
    return "default";
  };
  for (const env of envs) {
    for (let i = 1; i <= env.hostCount; i++) {
      const prefix = env.hypervisor === "proxmox" ? "pve-node" : "esxi";
      hosts.push({
        id: `${env.id}-host-${i}`,
        environmentId: env.id,
        name: `${prefix}-${env.id.replace("env-", "")}-${String(i).padStart(2, "0")}.corp.local`,
        cluster: clusterFor(env.id, i),
        status: i === env.hostCount && env.id === "env-hq" ? "maintenance" : "online",
        cpuCores: env.hypervisor === "proxmox" ? 32 : 64,
        memoryGB: env.hypervisor === "proxmox" ? 256 : 512,
        vmCount: 0,
      });
    }
  }
  return hosts;
}

/* --------------------------------- VMs ---------------------------------- */
function buildVms(envs: Environment[], hosts: Host[]): VM[] {
  const rand = seededRandom(1337);
  const vms: VM[] = [];

  // Flat instance list from templates.
  const instances: { name: string; t: VmTemplate }[] = [];
  for (const t of TEMPLATES) {
    for (let i = 1; i <= t.count; i++) {
      const name = t.base.endsWith("-")
        ? `${t.base}${String(i).padStart(2, "0")}`
        : `${t.base}${String(i).padStart(2, "0")}`;
      instances.push({ name, t });
    }
  }

  // Distribution across environments: prod-heavy, DR replicas, edge, proxmox (migration).
  const envFor = (idx: number): string => {
    const r = idx / instances.length;
    if (r < 0.58) return "env-hq";
    if (r < 0.78) return "env-dr";
    if (r < 0.88) return "env-edge";
    return "env-prox";
  };

  const hostsByEnv = (envId: string) => hosts.filter((h) => h.environmentId === envId);

  instances.forEach((inst, idx) => {
    const envId = envFor(idx);
    const envHosts = hostsByEnv(envId);
    const host = envHosts[idx % envHosts.length];
    const env = envs.find((e) => e.id === envId)!;

    const size = Math.round(inst.t.size[0] + rand() * (inst.t.size[1] - inst.t.size[0]));
    const used = Math.round(size * (0.35 + rand() * 0.5));
    const powerRoll = rand();
    const powerState = powerRoll > 0.92 ? "stopped" : powerRoll > 0.88 ? "suspended" : "running";

    // Protection logic: proxmox + powered-off skew unprotected; everything else mostly protected.
    let protection: VM["protection"];
    let protRoll = rand();
    if (envId === "env-prox") protRoll -= 0.45; // migration cluster largely unprotected
    if (powerState !== "running") protRoll -= 0.15;
    if (inst.t.tags.includes("dev")) protRoll -= 0.25;
    if (protRoll < 0.06) protection = "unprotected";
    else if (protRoll < 0.16) protection = "warning";
    else protection = "protected";

    const lastBackupAt =
      protection === "protected"
        ? hoursAgo(1 + Math.floor(rand() * 19))
        : protection === "warning"
          ? hoursAgo(28 + Math.floor(rand() * 40))
          : null;

    const restorePointCount =
      protection === "protected" ? 8 + Math.floor(rand() * 24) : protection === "warning" ? 2 + Math.floor(rand() * 5) : 0;

    const tags = [...inst.t.tags];
    if (envId === "env-prox" && !tags.includes("migration")) tags.push("migration");
    if (env.id === "env-dr" && !tags.includes("replicated")) tags.push("replicated");

    const note =
      protection === "unprotected"
        ? envId === "env-prox"
          ? "Not yet onboarded (migration cluster)"
          : "No backup job covers this VM"
        : protection === "warning"
          ? "Last backup is overdue"
          : undefined;

    vms.push({
      id: `vm-${idx + 1}`,
      name: inst.name,
      environmentId: envId,
      hostId: host.id,
      guestOs: inst.t.guestOs,
      osFamily: inst.t.osFamily,
      powerState,
      vcpus: [2, 2, 4, 4, 8, 8, 16][Math.floor(rand() * 7)],
      memoryGB: [4, 8, 8, 16, 16, 32, 64][Math.floor(rand() * 7)],
      provisionedGB: size,
      usedGB: used,
      tags,
      protection,
      lastBackupAt,
      restorePointCount,
      ipAddress: `10.${envId === "env-dr" ? 20 : envId === "env-edge" ? 30 : envId === "env-prox" ? 40 : 10}.${1 + Math.floor(idx / 254)}.${(idx % 254) + 1}`,
      protectionNote: note,
    });

    host.vmCount += 1;
  });

  // Backfill env vm counts.
  for (const env of envs) env.vmCount = vms.filter((v) => v.environmentId === env.id).length;
  return vms;
}

/* ----------------------------- repositories ----------------------------- */
function buildRepositories(): Repository[] {
  const trend = (base: number, slope: number) =>
    Array.from({ length: 14 }, (_, i) => Math.round(base + slope * i + Math.sin(i) * (base * 0.01)));
  return [
    {
      id: "repo-immutable",
      name: "AltaStor Hardened Repository",
      type: "hardened-immutable",
      path: "/mnt/altastor/hardened",
      capacityGB: 40960,
      usedGB: 23880,
      dedupRatio: 3.2,
      status: "healthy",
      usageTrend: trend(22500, 100),
      maintenanceMode: false,
      readOnly: false,
      lastScanAt: hoursAgo(6),
      integrityStatus: "verified",
      fragmentationPct: 7,
      ioThrottleMBps: 0,
      maxConcurrentTasks: 4,
      raidLevel: "RAID-6",
      driveModel: "8 × Seagate Exos X18 16TB",
      compression: "optimal",
      pendingGcGB: 42,
    },
    {
      id: "repo-objlock",
      name: "S3 (Wasabi)",
      type: "object-lock-s3",
      path: "s3://altastor-eu",
      capacityGB: 102400,
      usedGB: 38200,
      dedupRatio: 2.6,
      status: "healthy",
      usageTrend: trend(36000, 160),
      maintenanceMode: false,
      readOnly: false,
      lastScanAt: daysAgo(1),
      integrityStatus: "verified",
      fragmentationPct: 2,
      ioThrottleMBps: 95,
      maxConcurrentTasks: 8,
      driveModel: "Wasabi hot cloud storage · eu-central-1",
      compression: "high",
      pendingGcGB: 118,
      // Object storage is the only backend the appliance reports Object Lock
      // for (`capabilities.supports_immutability` is `type == "s3"`), so this
      // is the one seeded repository whose immutability panel has anything to
      // show — without it the demo world could never exercise it.
      supportsImmutability: true,
      immutability: { mode: "governance", retentionDays: 30 },
    },
    {
      id: "repo-nas",
      name: "Primary NAS (NFS)",
      type: "nfs",
      path: "nfs://nas01.corp.local/backups",
      capacityGB: 20480,
      usedGB: 16890,
      dedupRatio: 1.8,
      status: "warning",
      usageTrend: trend(15200, 120),
      maintenanceMode: false,
      readOnly: false,
      lastScanAt: daysAgo(9),
      integrityStatus: "issues",
      fragmentationPct: 34,
      ioThrottleMBps: 180,
      maxConcurrentTasks: 2,
      driveModel: "Synology RS3621xs+ · SHR-2",
      compression: "optimal",
      pendingGcGB: 260,
    },
    {
      id: "repo-ssd",
      name: "Local SSD — Staging",
      type: "local",
      path: "/var/altastor/staging",
      capacityGB: 4096,
      usedGB: 1180,
      dedupRatio: 1.4,
      status: "healthy",
      usageTrend: trend(1100, 6),
      maintenanceMode: false,
      readOnly: false,
      lastScanAt: hoursAgo(30),
      integrityStatus: "verified",
      fragmentationPct: 11,
      ioThrottleMBps: 0,
      maxConcurrentTasks: 6,
      raidLevel: "RAID-0",
      driveModel: "2 × Samsung PM9A3 3.84TB NVMe",
      compression: "none",
      pendingGcGB: 8,
    },
  ];
}

/* -------------------------------- jobs ---------------------------------- */
function resolveScope(
  vms: VM[],
  rule: { tags?: string[]; envIds?: string[]; all?: boolean },
): string[] {
  return vms
    .filter((v) => {
      if (rule.all) return true;
      if (rule.envIds && rule.envIds.includes(v.environmentId)) return true;
      if (rule.tags && rule.tags.some((t) => v.tags.includes(t))) return true;
      return false;
    })
    .map((v) => v.id);
}

function buildJobs(vms: VM[]): BackupJob[] {
  const j = (
    partial: Omit<BackupJob, "vmIds" | "recentRuns"> & {
      rule: { tags?: string[]; envIds?: string[]; all?: boolean };
      runs: SessionStatus[];
    },
  ): BackupJob => {
    const { rule, runs, ...rest } = partial;
    return { ...rest, vmIds: resolveScope(vms, rule), recentRuns: runs };
  };

  return [
    j({
      id: "job-prod-daily", name: "Daily — Production VMs", type: "backup",
      description: "Image-level backup of every production-tagged VM to the hardened repository.",
      scopeSummary: "Tag: production", repositoryId: "repo-immutable",
      schedule: { frequency: "daily", atTime: "22:00" },
      retention: { keepDays: 14, gfs: { weekly: 4, monthly: 6, yearly: 1, enabled: true } },
      options: { appAware: true, encryption: true, compression: 3, dedup: true },
      state: "idle", lastStatus: "success", lastRunAt: hoursAgo(11), nextRunAt: hoursFromNow(13),
      createdAt: daysAgo(214), successRate: 98, accent: "emerald",
      rule: { tags: ["production"] },
      runs: ["success", "success", "success", "warning", "success", "success", "success", "success"],
    }),
    j({
      id: "job-sql-hourly", name: "Hourly — SQL Databases", type: "backup",
      description: "Application-aware hourly backups of all SQL & database VMs with transaction-log processing.",
      scopeSummary: "Tag: sql", repositoryId: "repo-immutable",
      schedule: { frequency: "hourly", everyHours: 1 },
      retention: { keepDays: 48 },
      options: { appAware: true, encryption: true, compression: 3, dedup: true },
      state: "running", lastStatus: "running", lastRunAt: minsAgo(3), nextRunAt: hoursFromNow(1),
      createdAt: daysAgo(180), successRate: 99, accent: "cyan",
      rule: { tags: ["sql"] },
      runs: ["success", "success", "success", "success", "success", "success", "warning", "running"],
    }),
    j({
      id: "job-web-4h", name: "Every 4h — Web Tier", type: "backup",
      description: "Frequent backups of the public web & API tier living in the DMZ.",
      scopeSummary: "Tag: web", repositoryId: "repo-immutable",
      schedule: { frequency: "hourly", everyHours: 4 },
      retention: { keepDays: 24 },
      options: { appAware: false, encryption: true, compression: 9, dedup: true },
      state: "idle", lastStatus: "success", lastRunAt: hoursAgo(2), nextRunAt: hoursFromNow(2),
      createdAt: daysAgo(120), successRate: 97, accent: "blue",
      rule: { tags: ["web"] },
      runs: ["success", "success", "warning", "success", "success", "success", "success", "success"],
    }),
    j({
      id: "job-files-daily", name: "Daily — File Servers", type: "backup",
      description: "Large file-server protection with synthetic fulls; copied to S3 weekly.",
      scopeSummary: "Tag: files", repositoryId: "repo-nas",
      schedule: { frequency: "daily", atTime: "20:00" },
      retention: { keepDays: 30, gfs: { weekly: 4, monthly: 12, yearly: 3, enabled: true } },
      options: { appAware: false, encryption: true, compression: 3, dedup: true, throttleMBps: 400 },
      state: "idle", lastStatus: "warning", lastRunAt: hoursAgo(15), nextRunAt: hoursFromNow(9),
      createdAt: daysAgo(160), successRate: 91, accent: "amber",
      rule: { tags: ["files"] },
      runs: ["success", "warning", "success", "success", "warning", "success", "success", "warning"],
    }),
    j({
      id: "job-weekly-full", name: "Weekly — Full Estate", type: "backup",
      description: "Weekly active full of the entire estate, kept in S3 for long-term GFS retention.",
      scopeSummary: "All VMs", repositoryId: "repo-objlock",
      schedule: { frequency: "weekly", atTime: "01:00", daysOfWeek: [0] },
      retention: { keepDays: 8, gfs: { weekly: 8, monthly: 12, yearly: 7, enabled: true } },
      options: { appAware: true, encryption: true, compression: 9, dedup: true },
      state: "idle", lastStatus: "success", lastRunAt: daysAgo(3), nextRunAt: hoursFromNow(96),
      createdAt: daysAgo(300), successRate: 100, accent: "violet",
      rule: { all: true },
      runs: ["success", "success", "success", "success", "success", "success", "success", "success"],
    }),
    j({
      id: "job-dr-repl", name: "Replication — DR Site", type: "replication",
      description: "Continuous replication of tier-1 workloads to the West DR vCenter for fast failover.",
      scopeSummary: "Tag: tier-1", repositoryId: "repo-objlock",
      replicaTarget: { environmentId: "env-dr", namePrefix: "replica-" },
      schedule: { frequency: "hourly", everyHours: 6 },
      retention: { keepDays: 7 },
      options: { appAware: false, encryption: true, compression: 3, dedup: false },
      state: "idle", lastStatus: "success", lastRunAt: hoursAgo(4), nextRunAt: hoursFromNow(2),
      createdAt: daysAgo(90), successRate: 96, accent: "cyan",
      rule: { tags: ["tier-1"] },
      runs: ["success", "success", "success", "warning", "success", "success", "success", "success"],
    }),
    j({
      id: "job-edge-daily", name: "Daily — Branch Office", type: "backup",
      description: "Nightly protection of the branch-office standalone ESXi host.",
      scopeSummary: "Environment: Branch Office", repositoryId: "repo-nas",
      schedule: { frequency: "daily", atTime: "21:00" },
      retention: { keepDays: 14 },
      options: { appAware: false, encryption: true, compression: 3, dedup: true },
      state: "idle", lastStatus: "success", lastRunAt: hoursAgo(13), nextRunAt: hoursFromNow(11),
      createdAt: daysAgo(75), successRate: 95, accent: "blue",
      rule: { envIds: ["env-edge"] },
      runs: ["success", "success", "success", "success", "warning", "success", "success", "success"],
    }),
    j({
      id: "job-dev-staging", name: "Daily — Dev & Staging", type: "backup",
      description: "Low-priority backups of dev & staging workloads to local SSD. Currently disabled.",
      scopeSummary: "Tags: staging, dev", repositoryId: "repo-ssd",
      schedule: { frequency: "daily", atTime: "23:30" },
      retention: { keepDays: 7 },
      options: { appAware: false, encryption: false, compression: 3, dedup: true },
      state: "disabled", lastStatus: "success", lastRunAt: daysAgo(6), nextRunAt: null,
      createdAt: daysAgo(60), successRate: 88, accent: "blue",
      rule: { tags: ["staging", "dev"] },
      runs: ["success", "warning", "success", "failed", "success", "success", "warning", "success"],
    }),
  ];
}

/* ------------------------------ sessions -------------------------------- */
function buildSessions(jobs: BackupJob[], vms: VM[]): Session[] {
  const rand = seededRandom(7);
  const sessions: Session[] = [];
  let counter = 0;

  const vmName = (id: string) => vms.find((v) => v.id === id)?.name ?? id;

  for (const job of jobs) {
    // History depth depends on cadence.
    const runsBack =
      job.schedule.frequency === "hourly" ? 16 : job.schedule.frequency === "weekly" ? 4 : 10;
    const stepHours =
      job.schedule.frequency === "hourly"
        ? job.schedule.everyHours ?? 1
        : job.schedule.frequency === "weekly"
          ? 168
          : 24;

    for (let i = runsBack; i >= 1; i--) {
      const startedAt = hoursAgo(i * stepHours + (job.id === "job-sql-hourly" ? 0 : 2));
      const statusRoll = rand();
      const status: SessionStatus =
        job.successRate >= 99
          ? "success"
          : statusRoll > 0.9
            ? "warning"
            : statusRoll > 0.97
              ? "failed"
              : "success";
      const scopedVms = job.vmIds.slice(0, Math.min(job.vmIds.length, 8 + Math.floor(rand() * 8)));
      const processedGB = Math.round(scopedVms.reduce((a, id) => a + (vms.find((v) => v.id === id)?.usedGB ?? 20), 0));
      const transferredGB = Math.round(processedGB * (0.03 + rand() * 0.12));
      const durationSec = Math.round(180 + processedGB * (1.2 + rand()));
      const throughput = Math.round(transferredGB * 1024 / Math.max(durationSec, 1) * 8);

      const vmResults: VmRunResult[] = scopedVms.map((id) => ({
        vmId: id,
        vmName: vmName(id),
        status: status === "warning" && rand() > 0.8 ? "warning" : "success",
        processedGB: vms.find((v) => v.id === id)?.usedGB ?? 20,
        transferredGB: Math.round((vms.find((v) => v.id === id)?.usedGB ?? 20) * (0.04 + rand() * 0.1)),
        durationSec: Math.round(40 + rand() * 220),
        message: status === "warning" && rand() > 0.85 ? "VSS snapshot retried once" : undefined,
      }));

      sessions.push({
        id: `sess-${++counter}`,
        jobId: job.id,
        jobName: job.name,
        type: job.type,
        status,
        backupType: i % 7 === 0 ? "full" : "incremental",
        startedAt,
        finishedAt: new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString(),
        durationSec,
        progress: 100,
        processedGB,
        transferredGB,
        throughputMBps: throughput,
        vmCount: scopedVms.length,
        vmResults,
        message:
          status === "warning"
            ? "Completed with warnings — 1 VM required a VSS retry"
            : status === "failed"
              ? "Repository unreachable during run"
              : undefined,
        triggeredBy: "schedule",
      });
    }
  }

  // The live, in-flight run for the SQL hourly job.
  const sqlJob = jobs.find((j) => j.id === "job-sql-hourly")!;
  const liveScope = sqlJob.vmIds.slice(0, 6);
  const liveProcessed = Math.round(liveScope.reduce((a, id) => a + (vms.find((v) => v.id === id)?.usedGB ?? 40), 0));
  sessions.push({
    id: "sess-live",
    jobId: sqlJob.id,
    jobName: sqlJob.name,
    type: "backup",
    status: "running",
    backupType: "incremental",
    startedAt: minsAgo(3),
    finishedAt: null,
    durationSec: 180,
    progress: 34,
    processedGB: Math.round(liveProcessed * 0.34),
    transferredGB: Math.round(liveProcessed * 0.34 * 0.08),
    throughputMBps: 612,
    vmCount: liveScope.length,
    vmResults: liveScope.map((id, idx) => ({
      vmId: id,
      vmName: vmName(id),
      status: idx < 2 ? "success" : idx === 2 ? "running" : "pending",
      processedGB: idx < 2 ? (vms.find((v) => v.id === id)?.usedGB ?? 40) : idx === 2 ? Math.round((vms.find((v) => v.id === id)?.usedGB ?? 40) * 0.4) : 0,
      transferredGB: idx < 2 ? Math.round((vms.find((v) => v.id === id)?.usedGB ?? 40) * 0.07) : 0,
      durationSec: idx < 2 ? 60 + idx * 20 : 0,
    })),
    triggeredBy: "schedule",
  });

  return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/* ---------------------------- restore points ---------------------------- */
function buildRestorePoints(vms: VM[], jobs: BackupJob[]): RestorePoint[] {
  const rand = seededRandom(99);
  const points: RestorePoint[] = [];
  let counter = 0;

  for (const vm of vms) {
    if (vm.protection === "unprotected") continue;
    const job = jobs.find((jb) => jb.vmIds.includes(vm.id) && jb.type === "backup") ?? jobs[0];
    const repo = job.repositoryId;
    const count = Math.min(vm.restorePointCount, 18);
    for (let i = 0; i < count; i++) {
      const isFull = i % 7 === 0;
      const ageHours = i * (job.schedule.frequency === "hourly" ? job.schedule.everyHours ?? 1 : 24) + 1;
      const storedGB = isFull
        ? Math.round(vm.usedGB * (0.9 + rand() * 0.1))
        : Math.round(vm.usedGB * (0.02 + rand() * 0.08));
      const ratio = simCompressionRatio(job.options.compression);
      points.push({
        id: `rp-${++counter}`,
        chainId: simChainId(job.id, vm.id, repo),
        vmId: vm.id,
        vmName: vm.name,
        jobId: job.id,
        jobName: job.name,
        createdAt: hoursAgo(ageHours),
        type: isFull ? "full" : "incremental",
        sizeGB: storedGB,
        repositoryId: repo,
        logicalGB: Math.round(storedGB / ratio),
        compressionRatio: ratio,
        compressionLevel: job.options.compression,
        encrypted: job.options.encryption,
        gfsProtected: isFull && i >= 14,
      });
    }
  }
  return points;
}

/* ------------------------------- alerts --------------------------------- */
function buildAlerts(): Alert[] {
  return [
    { id: "al-1", severity: "critical", category: "threat", title: "Unusual change rate on FILESRV-01", message: "Data change rate spiked +412% above the 30-day baseline — possible ransomware activity. Last restore point is safe.", createdAt: minsAgo(8), read: false, entityType: "vm", entityId: "vm-15" },
    { id: "al-3", severity: "warning", category: "capacity", title: "Primary NAS is 82% full", message: "Repository ‘Primary NAS (NFS)’ is approaching capacity. Consider extending retention to S3.", createdAt: hoursAgo(2), read: false, entityType: "repository", entityId: "repo-nas" },
    { id: "al-4", severity: "warning", category: "job", title: "Daily — File Servers finished with warnings", message: "1 of 3 file servers needed a VSS snapshot retry. All restore points are valid.", createdAt: hoursAgo(15), read: true, entityType: "job", entityId: "job-files-daily" },
    { id: "al-5", severity: "info", category: "system", title: "New VM detected: app-staging-06", message: "A new VM appeared in the Migration Cluster and is not yet covered by any backup job.", createdAt: hoursAgo(5), read: true, entityType: "vm" },
    { id: "al-6", severity: "success", category: "job", title: "Daily — Production VMs completed", message: "78 VMs protected · 2.1 TB processed · 184 GB transferred in 41m.", createdAt: hoursAgo(11), read: true, entityType: "job", entityId: "job-prod-daily" },
    { id: "al-8", severity: "warning", category: "threat", title: "New file extension burst on web-frontend-03", message: "47 files renamed with a previously-unseen extension. Flagged for review.", createdAt: hoursAgo(1), read: false, entityType: "vm" },
  ];
}

/* ------------------------------- threats -------------------------------- */
function buildThreats(): Threat[] {
  return [
    { id: "th-1", type: "change-rate", severity: "high", status: "active", vmId: "vm-15", vmName: "FILESRV-01", detectedAt: minsAgo(8), title: "Abnormal change rate", description: "Data change rate is 412% above the 30-day baseline. Pattern consistent with bulk encryption. The most recent restore point predates the anomaly and is recoverable.", metric: "+412% change rate" },
    { id: "th-2", type: "new-extension", severity: "medium", status: "investigating", vmId: "vm-9", vmName: "web-frontend-03", detectedAt: hoursAgo(1), title: "Unknown extension burst", description: "47 files were renamed to a previously-unseen extension within 4 minutes. Could be a deployment artifact or early-stage ransomware.", metric: "47 files · .x9z" },
    { id: "th-3", type: "honeypot", severity: "low", status: "contained", vmId: "vm-50", vmName: "app-staging-03", detectedAt: hoursAgo(9), title: "Canary file accessed", description: "A honeypot canary file was modified by an unexpected process. Snapshot isolated and quarantined automatically.", metric: "1 canary tripped" },
  ];
}

/* ------------------------------- assemble ------------------------------- */
/** Ready-to-run replicas for replication jobs, in varied states (demo). */
function buildReplicas(jobs: BackupJob[], vms: VM[], environments: Environment[], hosts: Host[]): Replica[] {
  const out: Replica[] = [];
  for (const job of jobs.filter((j) => j.type === "replication" && j.replicaTarget)) {
    const target = job.replicaTarget!;
    const targetEnv = environments.find((e) => e.id === target.environmentId);
    const targetHosts = hosts.filter((h) => h.environmentId === target.environmentId);
    const syncIntervalSec =
      job.schedule.frequency === "hourly" ? (job.schedule.everyHours ?? 1) * 3600 : 86_400;
    const sources = job.vmIds
      .map((vid) => vms.find((v) => v.id === vid))
      .filter((v): v is VM => !!v)
      .slice(0, 6);
    sources.forEach((vm, i) => {
      let state: ReplicaState = "ready";
      let lagSec = Math.round(syncIntervalSec * (0.15 + 0.5 * seededRandom(i + 3)()));
      let poweredOn = false;
      if (i === 0) {
        state = "failover";
        poweredOn = true;
        lagSec = 0;
      } else if (i === 1) {
        lagSec = Math.round(syncIntervalSec * 1.8);
      } else if (i === 2) {
        state = "syncing";
        lagSec = 300;
      }
      const pointCount = 3 + Math.floor(seededRandom(i + 11)() * Math.min(job.retention.keepDays, 5));
      const points: ReplicaPoint[] = Array.from({ length: pointCount }, (_, k) => ({
        id: `rpl-${job.id}-${vm.id}-${k}`,
        createdAt: hoursAgo((pointCount - k) * (syncIntervalSec / 3600)),
        type: k === 0 ? "full" : "incremental",
      }));
      const targetHost = targetHosts[i % Math.max(1, targetHosts.length)];
      out.push({
        id: `replica-${job.id}-${vm.id}`,
        jobId: job.id,
        jobName: job.name,
        sourceVmId: vm.id,
        sourceVmName: vm.name,
        guestOs: vm.guestOs,
        osFamily: vm.osFamily,
        sourcePlatform: environments.find((e) => e.id === vm.environmentId)?.hypervisor ?? "vmware",
        targetEnvironmentId: target.environmentId,
        targetEnvironmentName: targetEnv?.name ?? "DR Site",
        targetHostId: targetHost?.id ?? null,
        targetHostName: targetHost?.name ?? null,
        targetPlatform: targetEnv?.hypervisor ?? "vmware",
        replicaName: `${target.namePrefix}${vm.name}`,
        state,
        lastSyncAt: minsAgo(Math.round(lagSec / 60)),
        points,
        activePointId: state === "failover" ? points.at(-1)?.id ?? null : null,
        sizeGB: Math.round(vm.usedGB),
        createdAt: daysAgo(20 + Math.floor(seededRandom(i + 5)() * 14)),
        poweredOn,
      });
    });
  }
  return out;
}

export function createSeedWorld(): World {
  const environments = buildEnvironments();
  const hosts = buildHosts(environments);
  const vms = buildVms(environments, hosts);
  const repositories = buildRepositories();
  const jobs = buildJobs(vms);
  const sessions = buildSessions(jobs, vms);
  const restorePoints = buildRestorePoints(vms, jobs);
  const alerts = buildAlerts();
  const threats = buildThreats();
  const replicas = buildReplicas(jobs, vms, environments, hosts);

  return { environments, hosts, vms, jobs, sessions, restorePoints, repositories, alerts, threats, replicas };
}

export const ALL_TAGS = TAG_POOL;
