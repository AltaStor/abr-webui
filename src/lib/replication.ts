// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Replication jobs, as the console reads them: the job DTO's `replication`,
 * a replication session's report, and the rules for which backup jobs can be
 * replicated. The appliance's own logic is `replication_settings.py` in
 * abr-core; the functions here mirror it and are named after what they mirror.
 */
import i18n from "@/i18n";
import type {
  BackupJob,
  NamedRef,
  ReplicaNetworkMapping,
  ReplicationInput,
  ReplicationSessionReport,
  ReplicationSettings,
  RestorePoint,
  Session,
} from "@/types";

type Dict = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const orNull = (v: unknown): string | null => str(v) || null;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});

function namedRef(raw: unknown): NamedRef | null {
  const ref = asDict(raw);
  const id = str(ref.id);
  const name = str(ref.name);
  return id || name ? { id, name: name || id } : null;
}

/** "VM Network=DR Network" — the appliance takes "=" and, like a restore, ":". */
export function parseNetworkMapping(token: string): ReplicaNetworkMapping | null {
  const at = token.includes("=") ? token.indexOf("=") : token.indexOf(":");
  if (at < 0) return null;
  const source = token.slice(0, at).trim();
  const target = token.slice(at + 1).trim();
  return source && target ? { source, target } : null;
}

export function networkMapToWire(map: ReplicaNetworkMapping[]): string[] {
  return map.map((m) => `${m.source}=${m.target}`);
}

/** The job DTO's `replication` (`replication_view`). `scheduled` comes from
 *  the job's own schedule, which the appliance reports as null without one. */
export function mapReplication(raw: unknown, scheduled: boolean): ReplicationSettings {
  const r = asDict(raw);
  const replica = asDict(r.replica);
  const pending = r.run_pending === true ? asDict(r.pending_trigger) : null;
  return {
    sourceJob: namedRef(r.source_job),
    sourceVm: namedRef(r.source_vm),
    targetEnvironment: namedRef(r.target_inventory),
    targetHost: orNull(r.target_host),
    targetDatastore: orNull(r.target_datastore),
    networkMap: (Array.isArray(r.network_map) ? r.network_map : [])
      .map((token) => parseNetworkMapping(str(token)))
      .filter((m): m is ReplicaNetworkMapping => m !== null),
    replicaName: str(r.replica_name),
    runAfterSource: r.run_after_source === true,
    startPointId: orNull(r.start_point_id),
    replica: {
      vmId: orNull(replica.vm_id),
      vmName: orNull(replica.vm_name),
      pointId: orNull(replica.point_id),
      pointCreatedAt: orNull(replica.point_created_at),
      lastSuccessAt: orNull(replica.last_success_at),
      pendingName: orNull(replica.pending_name),
    },
    pendingRun: pending ? { trigger: orNull(pending.trigger), since: orNull(pending.since) } : null,
    scheduled,
  };
}

const MODES = new Set(["create", "incremental", "rebuild", "up_to_date"]);

/** A replication session's `replication` report (`_replication_report`). */
export function mapReplicationReport(raw: unknown): ReplicationSessionReport | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Dict;
  const mode = str(r.mode);
  return {
    mode: MODES.has(mode) ? (mode as ReplicationSessionReport["mode"]) : null,
    sourceJobName: orNull(r.source_job_name),
    restorePointId: orNull(r.restore_point_id),
    restorePointCreatedAt: orNull(r.restore_point_created_at),
    appliedPointIds: (Array.isArray(r.applied_point_ids) ? r.applied_point_ids : []).map(str).filter(Boolean),
    targetEnvironmentName: orNull(r.target_inventory_name),
    targetHostName: orNull(r.target_host_name),
    replicaVmName: orNull(r.replica_vm_name),
  };
}

/** "sql-01 → vCenter-DR" — a replication job's scope in a line. */
export function replicationScopeSummary(r: ReplicationSettings): string {
  return i18n.t("jobs:repl.scope", {
    vm: r.sourceVm?.name ?? i18n.t("common:generic.na"),
    target: r.targetEnvironment?.name ?? i18n.t("common:generic.na"),
  });
}

/** Whether the replica VM exists. Until it does, every setting may change;
 *  after, the source and the placement are fixed (`LOCKED_AFTER_REPLICA`). */
export function replicaCreated(job: Pick<BackupJob, "replication"> | undefined): boolean {
  return Boolean(job?.replication?.replica.vmId);
}

/** "Created", "Updated", "Rebuilt", "Up to date" — what a run did to the replica. */
export function replicationModeLabel(session: Pick<Session, "replication">): string | null {
  const mode = session.replication?.mode;
  return mode ? i18n.t(`jobs:repl.mode.${mode}`) : null;
}

/* ---------------------------------------------------------------- sources -- */

/** The restore points of a backup job's VM the job wrote, oldest first
 *  (`source_points`). */
export function sourcePoints(job: BackupJob, points: RestorePoint[], vmId = job.vmIds[0]): RestorePoint[] {
  return points
    .filter((p) => p.jobId === job.id && p.vmId === vmId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type SourceJobProblem = "notBackup" | "noVm" | "severalVms" | "noPoints";

/**
 * Why a job cannot be the source of a replication job, or null. The appliance
 * takes a backup job that backs up exactly one VM and holds a restore point of
 * it (`_source_job`, `_source_vm`, `_start_point`).
 */
export function sourceJobProblem(job: BackupJob, points: RestorePoint[]): SourceJobProblem | null {
  if (job.type !== "backup") return "notBackup";
  if (job.vmIds.length === 0) return "noVm";
  if (job.vmIds.length > 1) return "severalVms";
  return sourcePoints(job, points).length ? null : "noPoints";
}

/** The replica's name the form proposes: the source VM's with a suffix. */
export function defaultReplicaName(vmName: string): string {
  return `${vmName}-replica`;
}

/** The settings a form input describes, for the demo world, which keeps what
 *  the appliance would resolve. */
export function settingsFromInput(
  input: ReplicationInput,
  names: { sourceJob?: string; sourceVm?: string; targetEnvironment?: string; host?: string; datastore?: string },
  previous?: ReplicationSettings,
): ReplicationSettings {
  if (input.placementLocked && previous) {
    return {
      ...previous,
      replicaName: input.replicaName,
      runAfterSource: input.runAfterSource,
      scheduled: input.scheduled || previous.scheduled,
    };
  }
  return {
    sourceJob: { id: input.sourceJobId, name: names.sourceJob ?? input.sourceJobId },
    sourceVm: input.sourceVmId ? { id: input.sourceVmId, name: names.sourceVm ?? input.sourceVmId } : null,
    targetEnvironment: { id: input.targetEnvironmentId, name: names.targetEnvironment ?? input.targetEnvironmentId },
    targetHost: names.host ?? input.targetHost,
    targetDatastore: names.datastore ?? input.targetDatastore,
    networkMap: input.networkMap,
    replicaName: input.replicaName,
    runAfterSource: input.runAfterSource,
    startPointId: input.startPointId,
    replica: previous?.replica ?? {
      vmId: null,
      vmName: null,
      pointId: null,
      pointCreatedAt: null,
      lastSuccessAt: null,
      pendingName: null,
    },
    pendingRun: null,
    scheduled: input.scheduled,
  };
}
