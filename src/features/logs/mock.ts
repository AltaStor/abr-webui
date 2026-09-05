// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { Alert, LogLevel, LogLine, Session, Threat, VM } from "@/types";
import type {
  AuditActor,
  AuditCategory,
  AuditEvent,
  AuditSeverity,
  LogSource,
  LogsWorld,
  SecurityEvent,
  SecurityKind,
  SystemLogEntry,
} from "./types";

/** What the builder reads out of the world store (all read-only). */
export interface LogsWorldInput {
  sessions: Session[];
  threats: Threat[];
  alerts: Alert[];
  vms: VM[];
}

/* -------------------------------------------------------------------------- */
/* Deterministic PRNG — mulberry32, seeded from a fixed integer so every       */
/* render produces byte-identical output.                                      */
/* -------------------------------------------------------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x8a17c3;

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function jitter(rand: () => number, span: number): number {
  return Math.floor(rand() * span);
}

const WINDOW_MS = 5 * 24 * 3_600_000; // ~5 days

/** A monotone-ish timestamp cursor walking backwards from "now". */
function makeClock(rand: () => number) {
  let cursor = Date.now() - 45_000; // start a little before now
  return (maxGapMs: number): string => {
    cursor -= 1_000 + Math.floor(rand() * maxGapMs);
    return new Date(cursor).toISOString();
  };
}

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

const ACTORS: AuditActor[] = [
  { name: "Priya Nair", email: "priya@altastor.local", role: "admin" },
  { name: "Marcus Reyes", email: "marcus@altastor.local", role: "operator" },
  { name: "Dana Whitfield", email: "dana@altastor.local", role: "operator" },
  { name: "Elena Kovač", email: "elena@altastor.local", role: "admin" },
  { name: "Tom Alderson", email: "tom@altastor.local", role: "viewer" },
];
const SYSTEM_ACTOR: AuditActor = { name: "system", email: "scheduler@altastor.local", role: "operator" };

const IPS = ["192.168.31.4", "192.168.31.22", "10.20.4.11", "10.20.4.87", "192.168.31.191"];
const EXTERNAL_IPS = ["203.0.113.44", "198.51.100.9", "45.148.10.72"];

/* -------------------------------------------------------------------------- */
/* System log                                                                  */
/* -------------------------------------------------------------------------- */

interface SysTemplate {
  source: LogSource;
  level: LogLevel;
  render: (rand: () => number) => string;
  /** Relative frequency weight. */
  weight: number;
}

const REPOS = ["repo-primary", "repo-copy-b2", "repo-nas-01"];
const DISKS = ["nvme0n1", "nvme1n1", "sda", "sdb", "sdc"];

const SYS_TEMPLATES: SysTemplate[] = [
  { source: "scheduler", level: "info", weight: 10, render: (r) => `evaluated schedule window, ${1 + jitter(r, 4)} job(s) due` },
  { source: "scheduler", level: "success", weight: 6, render: (r) => `dispatched job run job-${100 + jitter(r, 40)}` },
  { source: "datad", level: "info", weight: 12, render: (r) => `chunk store flush: ${400 + jitter(r, 1600)} objects, dedup ${(2 + r() * 3).toFixed(1)}x` },
  { source: "datad", level: "debug", weight: 8, render: (r) => `index compaction level ${jitter(r, 4)} → level ${1 + jitter(r, 4)}` },
  { source: "datad", level: "success", weight: 4, render: (r) => `verified ${1000 + jitter(r, 9000)} objects, 0 checksum mismatches` },
  { source: "gc", level: "info", weight: 7, render: (r) => `garbage collection reclaimed ${(0.4 + r() * 12).toFixed(1)} GiB from ${pick(r, REPOS)}` },
  { source: "gc", level: "debug", weight: 5, render: (r) => `mark phase visited ${5000 + jitter(r, 40000)} live references` },
  { source: "raid", level: "info", weight: 6, render: (r) => `scrub progress ${10 + jitter(r, 89)}% on md0` },
  { source: "raid", level: "success", weight: 2, render: () => "scrub complete on md0, 0 mismatches, array clean" },
  { source: "raid", level: "warn", weight: 2, render: (r) => `${pick(r, DISKS)} reallocated-sector count rose to ${1 + jitter(r, 6)}` },
  { source: "ntp", level: "info", weight: 5, render: (r) => `clock synced, offset ${(r() * 8 - 4).toFixed(1)} ms, stratum ${2 + jitter(r, 2)}` },
  { source: "ntp", level: "debug", weight: 3, render: () => "peer 0.debian.pool.ntp.org selected as system peer" },
  { source: "api", level: "info", weight: 9, render: (r) => `GET /v1/${pick(r, ["sessions", "repositories", "jobs", "objects"])} 200 in ${4 + jitter(r, 40)}ms` },
  { source: "api", level: "debug", weight: 4, render: (r) => `token refreshed for session ${(1000 + jitter(r, 9000)).toString(16)}` },
  { source: "tiering", level: "info", weight: 5, render: (r) => `tier scan: ${jitter(r, 40)} points eligible for cold offload` },
  { source: "tiering", level: "success", weight: 3, render: (r) => `offloaded ${(1 + r() * 40).toFixed(1)} GiB to ${pick(r, REPOS)} (S3)` },
  { source: "vss", level: "info", weight: 6, render: (r) => `snapshot set created, ${1 + jitter(r, 4)} writer(s) involved` },
  { source: "vss", level: "warn", weight: 2, render: () => "SQL writer timed out, retrying with app-consistent fallback" },
  { source: "iscsi", level: "info", weight: 4, render: (r) => `initiator login from 192.168.31.${20 + jitter(r, 60)}, LUN ${jitter(r, 4)}` },
  { source: "iscsi", level: "debug", weight: 3, render: () => "SendTargets discovery completed" },
  { source: "agent", level: "info", weight: 6, render: (r) => `RCT bitmap fetched, ${(0.1 + r() * 4).toFixed(2)} GiB changed since prior full` },
  { source: "agent", level: "debug", weight: 4, render: () => "keepalive from hyperv-agent 0.4.0" },
  { source: "datad", level: "warn", weight: 2, render: (r) => `backpressure: repo write queue depth ${64 + jitter(r, 200)}` },
  { source: "api", level: "error", weight: 1, render: (r) => `500 on /v1/objects/${jitter(r, 9999)} — upstream reset, retried ok` },
  { source: "gc", level: "error", weight: 1, render: () => "GC aborted: lock contention with active verify, will retry next cycle" },
];

function buildSystemLog(world: LogsWorldInput, rand: () => number): SystemLogEntry[] {
  const out: SystemLogEntry[] = [];
  const clock = makeClock(rand);
  let n = 0;

  // Weighted template pool.
  const pool: SysTemplate[] = [];
  for (const t of SYS_TEMPLATES) for (let i = 0; i < t.weight; i++) pool.push(t);

  const total = 150;
  for (let i = 0; i < total; i++) {
    const t = pick(rand, pool);
    out.push({
      id: `sys-${n++}`,
      ts: clock(WINDOW_MS / total + 4 * 3_600_000),
      level: t.level,
      source: t.source,
      message: t.render(rand),
    });
  }

  // Derive lines from real sessions in the world.
  for (const s of world.sessions.slice(0, 24)) {
    const done = s.finishedAt ?? s.startedAt;
    if (s.status === "running") {
      out.push({
        id: `sys-s-${s.id}`,
        ts: s.startedAt,
        level: "info",
        source: "scheduler",
        message: `run ${s.id} started for "${s.jobName}" (${s.vmCount} VM${s.vmCount === 1 ? "" : "s"}), ${s.backupType}`,
      });
    } else {
      const level: LogLevel = s.status === "failed" ? "error" : s.status === "warning" ? "warn" : "success";
      out.push({
        id: `sys-s-${s.id}`,
        ts: done,
        level,
        source: "datad",
        message: `run ${s.id} "${s.jobName}" ${s.status} — ${s.transferredGB.toFixed(1)} GiB transferred, ${s.throughputMBps.toFixed(0)} MB/s${s.message ? ` (${s.message})` : ""}`,
      });
    }
  }

  // Derive a couple of lines from alerts.
  for (const a of world.alerts.slice(0, 8)) {
    const level: LogLevel = a.severity === "critical" ? "error" : a.severity === "warning" ? "warn" : "info";
    out.push({
      id: `sys-a-${a.id}`,
      ts: a.createdAt,
      level,
      source: a.category === "threat" ? "api" : "scheduler",
      message: `alert raised: ${a.title}`,
    });
  }

  return out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

/* -------------------------------------------------------------------------- */
/* Audit trail                                                                 */
/* -------------------------------------------------------------------------- */

interface AuditTemplate {
  category: AuditCategory;
  severity: AuditSeverity;
  action: string;
  weight: number;
  render: (rand: () => number) => { target?: string; detail: string; systemActor?: boolean };
}

const JOB_NAMES = [
  "Nightly · Production",
  "Tier-1 SQL cluster",
  "DR replica → Site B",
  "File servers weekly",
  "Dev/test snapshots",
];

const AUDIT_TEMPLATES: AuditTemplate[] = [
  { category: "auth", severity: "info", action: "Signed in", weight: 10, render: () => ({ detail: "Password + TOTP, session established" }) },
  { category: "auth", severity: "info", action: "Signed out", weight: 5, render: () => ({ detail: "Session ended by user" }) },
  { category: "auth", severity: "warning", action: "Failed sign-in", weight: 4, render: (r) => ({ detail: `Invalid TOTP code, attempt ${1 + jitter(r, 3)} of 5` }) },
  { category: "job", severity: "info", action: "Started backup job", weight: 8, render: (r) => ({ target: pick(r, JOB_NAMES), detail: "Manual run triggered from Jobs" }) },
  { category: "job", severity: "notice", action: "Edited job schedule", weight: 5, render: (r) => ({ target: pick(r, JOB_NAMES), detail: `Retention 14 → ${21 + jitter(r, 20)} restore points; window moved to 02:00` }) },
  { category: "job", severity: "warning", action: "Disabled job", weight: 3, render: (r) => ({ target: pick(r, JOB_NAMES), detail: "Paused pending storage review" }) },
  { category: "repository", severity: "notice", action: "Added repository", weight: 3, render: (r) => ({ target: pick(r, REPOS), detail: "XFS on md0" }) },
  { category: "repository", severity: "warning", action: "Changed retention policy", weight: 4, render: (r) => ({ target: pick(r, REPOS), detail: `GFS weekly 4 → ${6 + jitter(r, 6)}, monthly 6 → 12` }) },
  { category: "restore", severity: "notice", action: "Started full-VM restore", weight: 5, render: (r) => ({ target: `rp-${1000 + jitter(r, 8000)}`, detail: "Restore to original host, power on after" }) },
  { category: "restore", severity: "notice", action: "Downloaded file from backup", weight: 4, render: (r) => ({ target: `rp-${1000 + jitter(r, 8000)}`, detail: `Exported \\Data\\reports\\Q${1 + jitter(r, 4)}.xlsx (${1 + jitter(r, 40)} MiB)` }) },
  { category: "settings", severity: "notice", action: "Updated SMTP settings", weight: 3, render: () => ({ detail: "Relay host changed, TLS required" }) },
  { category: "settings", severity: "info", action: "Changed theme", weight: 2, render: (r) => ({ detail: `Accent set to ${pick(r, ["verdigris", "copper", "violet"])}` }) },
  { category: "user", severity: "warning", action: "Created user", weight: 2, render: (r) => ({ target: pick(r, ["j.singh", "l.moreno", "k.tanaka"]), detail: `Role: ${pick(r, ["operator", "viewer"])}, invite emailed` }) },
  { category: "user", severity: "critical", action: "Changed user role", weight: 2, render: (r) => ({ target: pick(r, ["j.singh", "l.moreno"]), detail: `viewer → admin, elevated by ${pick(r, ["Priya Nair", "Elena Kovač"])}` }) },
];

function buildAuditTrail(world: LogsWorldInput, rand: () => number): AuditEvent[] {
  const out: AuditEvent[] = [];
  const clock = makeClock(rand);
  let n = 0;

  const pool: AuditTemplate[] = [];
  for (const t of AUDIT_TEMPLATES) for (let i = 0; i < t.weight; i++) pool.push(t);

  const total = 70;
  for (let i = 0; i < total; i++) {
    const t = pick(rand, pool);
    const r = t.render(rand);
    const actor = r.systemActor ? SYSTEM_ACTOR : pick(rand, ACTORS);
    out.push({
      id: `aud-${n++}`,
      ts: clock(WINDOW_MS / total + 3 * 3_600_000),
      actor,
      action: t.action,
      category: t.category,
      target: r.target,
      detail: r.detail,
      severity: t.severity,
      ip: t.severity === "warning" && t.category === "auth" ? pick(rand, EXTERNAL_IPS) : pick(rand, IPS),
    });
  }

  // Derive audit rows from real sessions — manual runs = a person; schedule = system.
  for (const s of world.sessions.slice(0, 18)) {
    if (s.triggeredBy === "schedule") continue;
    const actor = s.triggeredBy === "retry" ? SYSTEM_ACTOR : pick(rand, ACTORS.filter((a) => a.role !== "viewer"));
    out.push({
      id: `aud-s-${s.id}`,
      ts: s.startedAt,
      actor,
      action: s.jobId.startsWith("restore") ? "Started restore" : s.triggeredBy === "retry" ? "Retried job" : "Started backup job",
      category: s.jobId.startsWith("restore") ? "restore" : "job",
      target: s.jobName,
      detail: `${s.backupType} run of ${s.vmCount} VM${s.vmCount === 1 ? "" : "s"}, triggered ${s.triggeredBy}`,
      severity: s.status === "failed" ? "warning" : "info",
      ip: pick(rand, IPS),
    });
  }

  return out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

/* -------------------------------------------------------------------------- */
/* Security events                                                             */
/* -------------------------------------------------------------------------- */

interface SecTemplate {
  kind: SecurityKind;
  severity: AuditSeverity;
  weight: number;
  render: (rand: () => number) => Omit<SecurityEvent, "id" | "ts" | "kind" | "severity">;
}

const SEC_TEMPLATES: SecTemplate[] = [
  {
    kind: "tamper",
    severity: "critical",
    weight: 3,
    render: (r) => ({
      title: "Object-store tamper attempt blocked",
      detail: `Out-of-band write to ${pick(r, REPOS)} chunk file rejected by the integrity guard`,
      target: pick(r, REPOS),
      httpStatus: 403,
      ip: pick(r, EXTERNAL_IPS),
    }),
  },
  {
    kind: "clock-integrity",
    severity: "warning",
    weight: 3,
    render: (r) => ({
      title: "Clock rollback rejected",
      detail: `System-time set request denied — a backward clock step could corrupt audit-trail ordering (offset ${-(30 + jitter(r, 300))}s)`,
      ip: pick(r, IPS),
    }),
  },
  {
    kind: "auth-denied",
    severity: "warning",
    weight: 4,
    render: (r) => ({
      title: "API access denied",
      detail: `Token lacked ${pick(r, ["repository:delete", "user:admin"])} scope`,
      ip: pick(r, EXTERNAL_IPS),
      httpStatus: 403,
    }),
  },
];

function buildSecurityEvents(world: LogsWorldInput, rand: () => number): SecurityEvent[] {
  const out: SecurityEvent[] = [];
  const clock = makeClock(rand);
  let n = 0;

  const pool: SecTemplate[] = [];
  for (const t of SEC_TEMPLATES) for (let i = 0; i < t.weight; i++) pool.push(t);

  const total = 34;
  for (let i = 0; i < total; i++) {
    const t = pick(rand, pool);
    out.push({
      id: `sec-${n++}`,
      ts: clock(WINDOW_MS / total + 5 * 3_600_000),
      kind: t.kind,
      severity: t.severity,
      ...t.render(rand),
    });
  }

  // Derive real threat detections from the world store.
  for (const th of world.threats) {
    const sev: AuditSeverity = th.severity === "high" ? "critical" : th.severity === "medium" ? "warning" : "notice";
    out.push({
      id: `sec-th-${th.id}`,
      ts: th.detectedAt,
      kind: "threat",
      severity: sev,
      title: th.title,
      detail: `${th.description} — ${th.metric}. Status: ${th.status}.`,
      vmName: th.vmName,
    });
  }

  // Security-category alerts surface here too.
  for (const a of world.alerts.filter((al) => al.category === "threat").slice(0, 6)) {
    const vm = a.entityType === "vm" ? world.vms.find((v) => v.id === a.entityId) : undefined;
    out.push({
      id: `sec-al-${a.id}`,
      ts: a.createdAt,
      kind: "threat",
      severity: a.severity === "critical" ? "critical" : "warning",
      title: a.title,
      detail: a.message,
      vmName: vm?.name,
    });
  }

  return out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

/* -------------------------------------------------------------------------- */
/* Public builder                                                              */
/* -------------------------------------------------------------------------- */

/** Build the whole logs world in one deterministic pass. Memoize on world revision. */
export function buildLogsWorld(world: LogsWorldInput): LogsWorld {
  const rand = mulberry32(SEED);
  return {
    system: buildSystemLog(world, rand),
    audit: buildAuditTrail(world, rand),
    security: buildSecurityEvents(world, rand),
  };
}

/* -------------------------------------------------------------------------- */
/* Live builders — REAL data straight from the world store (live mode only).   */
/* No synthesized filler: what the appliance actually reported, mapped 1:1.    */
/* -------------------------------------------------------------------------- */

/** Alert severity -> system-log level. */
function alertLevel(sev: Alert["severity"]): LogLevel {
  switch (sev) {
    case "critical":
      return "error";
    case "warning":
      return "warn";
    case "success":
      return "success";
    default:
      return "info";
  }
}

/** Backend log-line `component` -> the unified system log's source tag.
 *  Real session log lines carry a `component` the orchestrator actually set
 *  (see `_append_task_log`/`_report_progress`); anything unset or unrecognized
 *  falls back to "agent" rather than being silently dropped. */
function liveLogSource(component: string | undefined): LogSource {
  switch (component) {
    case "session":
    case "copy":
    case "engine":
      return component;
    default:
      return "agent";
  }
}

/** Alert category -> emitting service in the unified system log. */
function alertSource(a: Alert): LogSource {
  switch (a.category) {
    case "capacity":
      return "datad";
    case "threat":
      return "api";
    case "job":
      return "scheduler";
    case "system":
    default:
      return /disk|smart|raid|array/i.test(a.message) ? "raid" : "api";
  }
}

/** Build REAL system-log entries from live alerts + per-session backup logs. */
export function buildLiveSystemLog(input: {
  alerts: Alert[];
  liveLogs: Record<string, LogLine[]>;
  sessions: Session[];
}): SystemLogEntry[] {
  const out: SystemLogEntry[] = [];

  // Every alert the appliance raised becomes one system-log line.
  for (const a of input.alerts) {
    out.push({
      id: `sys-a-${a.id}`,
      ts: a.createdAt,
      level: alertLevel(a.severity),
      source: alertSource(a),
      message: a.title ? `${a.title} — ${a.message}` : a.message,
    });
  }

  // Flatten every real backup log line across all sessions.
  for (const [sessionId, lines] of Object.entries(input.liveLogs)) {
    for (const l of lines) {
      out.push({
        id: `sys-log-${sessionId}-${l.id}`,
        ts: l.ts,
        level: l.level,
        source: liveLogSource(l.component),
        message: (l.vmName ? `[${l.vmName}] ` : "") + l.message,
      });
    }
  }

  // Match the mock ordering: newest-first (LogViewer reverses to chronological).
  return out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

/** Live security severity mapping shared by threat + alert sources. */
function alertToAuditSeverity(sev: Alert["severity"]): AuditSeverity {
  switch (sev) {
    case "critical":
      return "critical";
    case "warning":
      return "warning";
    case "success":
      return "notice";
    default:
      return "info";
  }
}

/** Build REAL security events from threats, alerts, and audit. */
export function buildLiveSecurity(input: {
  threats: Threat[];
  alerts: Alert[];
  auditEvents: AuditEvent[];
}): SecurityEvent[] {
  const byId = new Map<string, SecurityEvent>();
  const add = (e: SecurityEvent) => {
    if (!byId.has(e.id)) byId.set(e.id, e);
  };

  // Real threat detections.
  for (const th of input.threats) {
    const severity: AuditSeverity =
      th.severity === "high" ? "critical" : th.severity === "medium" ? "warning" : "notice";
    add({
      id: `sec-th-${th.id}`,
      ts: th.detectedAt,
      kind: "threat",
      severity,
      title: th.title,
      detail: th.description,
      vmName: th.vmName,
    });
  }

  // Threat-category alerts surface as tamper signals.
  for (const a of input.alerts.filter((al) => al.category === "threat")) {
    add({
      id: `sec-al-${a.id}`,
      ts: a.createdAt,
      kind: "tamper",
      severity: alertToAuditSeverity(a.severity),
      title: a.title,
      detail: a.message,
    });
  }

  // Denied/failed auth attempts.
  for (const ev of input.auditEvents.filter(
    (e) => e.category === "auth" && /denied|failed/i.test(e.action),
  )) {
    add({
      id: `sec-au-${ev.id}`,
      ts: ev.ts,
      kind: "auth-denied",
      severity: ev.severity,
      title: ev.action,
      detail: ev.detail,
      target: ev.target,
      httpStatus: 403,
      ip: ev.ip,
    });
  }

  // Match the mock ordering: newest-first.
  return [...byId.values()].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}
