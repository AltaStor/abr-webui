// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type {
  AuditActor,
  AuditCategory,
  AuditEvent,
  AuditSeverity,
  LogLevel,
} from "@/types";

/**
 * The audit trail is real in LIVE mode (sourced from the appliance via the
 * world store) and feeds the security view below even though it has no tab of
 * its own. Re-export the shared audit types from "@/types" so the mock
 * builder, LogsWorld, and the live builders all speak one identical
 * AuditEvent — live and mock stay interchangeable.
 */
export type { AuditActor, AuditCategory, AuditEvent, AuditSeverity };

/** A single line in the unified appliance system log. */
export interface SystemLogEntry {
  id: string;
  ts: string;
  level: LogLevel;
  /** The emitting service — shown as the bracketed tag in the terminal view. */
  source: LogSource;
  message: string;
}

/** The small set of appliance services that emit into the system log. */
export type LogSource =
  | "scheduler"
  | "datad"
  | "raid"
  | "gc"
  | "ntp"
  | "api"
  | "tiering"
  | "vss"
  | "iscsi"
  | "agent"
  // The real components a LIVE session's own log lines carry (see
  // `_append_task_log`/`_report_progress` on the orchestrator): "session" is
  // the job-scheduler lifecycle (queued/stopped), "copy" is a backup-copy
  // run, and "engine" is the backup/restore engine itself. `mapLogLines`
  // preserves the backend's `component` field into `LogLine.component`.
  | "engine"
  | "session"
  | "copy";

export type SecurityKind = "tamper" | "threat" | "clock-integrity" | "auth-denied";

/** A focused security enforcement event. */
export interface SecurityEvent {
  id: string;
  ts: string;
  kind: SecurityKind;
  severity: AuditSeverity;
  title: string;
  detail: string;
  /** The subject — a repository, restore point, VM, or principal. */
  target?: string;
  /** Set when the event links to a specific VM (threat detections). */
  vmName?: string;
  /** Set for denied operations — the HTTP status the appliance returned. */
  httpStatus?: number;
  ip?: string;
}

/** Everything the page memoizes in one pass. */
export interface LogsWorld {
  system: SystemLogEntry[];
  audit: AuditEvent[];
  security: SecurityEvent[];
}
