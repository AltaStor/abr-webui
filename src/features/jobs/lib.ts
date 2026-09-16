// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import {
  CopyPlus,
  DatabaseBackup,
  HardDriveDownload,
  type LucideIcon,
} from "@/lib/icons";
import type { AccentKey, FullBackupSchedule, JobType, Retention, Schedule } from "@/types";
import i18n from "@/i18n";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Short day label ("Sun".."Sat"), resolved through i18next. */
function dayShortLabel(day: number): string {
  return i18n.t(`jobs:days.short.${DAY_KEYS[day] ?? "sun"}`);
}

/**
 * Friendly, plain-spoken schedule label.
 * "Daily · 22:00", "Every 1h", "Every 4h", "Weekly · Sun 01:00", "Disabled".
 */
export function scheduleLabel(schedule: Schedule, disabled = false): string {
  if (disabled) return i18n.t("jobs:schedule.disabled");
  switch (schedule.frequency) {
    case "hourly": {
      const n = schedule.everyHours ?? 1;
      return i18n.t("jobs:schedule.hourly", { count: n });
    }
    case "weekly": {
      const day = schedule.daysOfWeek?.[0] ?? 0;
      const time = schedule.atTime ?? "01:00";
      return i18n.t("jobs:schedule.weekly", { day: dayShortLabel(day), time });
    }
    case "custom":
      return schedule.cron
        ? i18n.t("jobs:schedule.customCron", { cron: schedule.cron })
        : i18n.t("jobs:schedule.custom");
    case "daily":
    default:
      return i18n.t("jobs:schedule.daily", { time: schedule.atTime ?? "22:00" });
  }
}

/**
 * Label for an active/synthetic full schedule: "Weekly · Sun, Wed 22:00",
 * "Monthly · day 1 02:00", or "Off" when the job has none. A suspended
 * schedule keeps its pattern, marked as suspended.
 */
export function fullScheduleLabel(schedule: FullBackupSchedule | null | undefined): string {
  if (!schedule) return i18n.t("jobs:fullSchedule.off");
  const pattern = fullSchedulePattern(schedule);
  return schedule.enabled ? pattern : i18n.t("jobs:fullSchedule.suspended", { schedule: pattern });
}

function fullSchedulePattern(schedule: FullBackupSchedule): string {
  const time = schedule.atTime ?? "00:00";
  switch (schedule.frequency) {
    case "weekly": {
      const days = [...(schedule.daysOfWeek ?? [])].sort((a, b) => a - b);
      return i18n.t("jobs:schedule.weekly", { day: days.map(dayShortLabel).join(", "), time });
    }
    case "monthly":
      return i18n.t("jobs:schedule.monthly", { day: schedule.dayOfMonth ?? 1, time });
    case "periodic": {
      const minutes = schedule.everyMinutes ?? 60;
      return minutes % 60 === 0
        ? i18n.t("jobs:schedule.hourly", { count: minutes / 60 })
        : i18n.t("jobs:schedule.everyMinutes", { count: minutes });
    }
    case "cron":
      return schedule.cron
        ? i18n.t("jobs:schedule.customCron", { cron: schedule.cron })
        : i18n.t("jobs:schedule.custom");
    case "daily":
    default:
      return i18n.t("jobs:schedule.daily", { time });
  }
}

/** Friendly retention label: "14 days" (+ GFS tail when present). */
export function retentionLabel(retention: Retention): string {
  const base = i18n.t("jobs:retention.days", { count: retention.keepDays });
  if (!retention.gfs) return base;
  const { weekly, monthly, yearly, enabled } = retention.gfs;
  const parts: string[] = [];
  if (weekly) parts.push(`${weekly}w`);
  if (monthly) parts.push(`${monthly}m`);
  if (yearly) parts.push(`${yearly}y`);
  if (!parts.length) return base;
  // A suspended policy keeps its counts but marks nothing, so quoting the tail
  // unqualified would promise archival copies that aren't being made.
  return enabled === false
    ? i18n.t("jobs:retention.withGfsSuspended", { base, tail: parts.join(" / ") })
    : i18n.t("jobs:retention.withGfs", { base, tail: parts.join(" / ") });
}

/**
 * The compression level a measured throughput figure is assumed to have been
 * produced at — the appliance's own default (DEFAULT_COMPRESSION_LEVEL in
 * vcenter_backup.py). Runs at other levels are scaled relative to this.
 */
export const BASELINE_COMPRESSION_LEVEL = 3;

/**
 * How fast the data mover runs at zstd level `level`, relative to the baseline
 * level above. Compression is CPU-bound and the mover compresses inline, so the
 * level is a real throughput lever: level 0 (store) keeps up with the disk,
 * while level 9 costs several times the CPU per block and throttles the whole
 * pipeline behind it.
 *
 * The curve is the shape of zstd's own published compression-speed table (each
 * step up costs progressively more, steeply so past level 6), normalised so the
 * baseline level is exactly 1.0. It is deliberately a rough model: it exists to
 * make the estimate MOVE in the right direction and by a believable magnitude
 * when the operator drags the slider, not to promise a wall-clock guarantee.
 */
const COMPRESSION_SPEED: readonly number[] = [
  1.75, // 0 — store only, no compression cost
  1.55, // 1
  1.25, // 2
  1.0, // 3 — baseline
  0.85, // 4
  0.7, // 5
  0.55, // 6
  0.4, // 7
  0.28, // 8
  0.2, // 9 — smallest output, several times the CPU per block
];

/** Throughput multiplier for a zstd level, relative to the baseline level. */
export function compressionSpeedFactor(level: number): number {
  const clamped = Math.min(COMPRESSION_SPEED.length - 1, Math.max(0, Math.round(level)));
  return COMPRESSION_SPEED[clamped];
}

/** Map a job accent to its token-backed hsl() string. */
export function accentColor(accent: AccentKey): string {
  switch (accent) {
    case "emerald":
      return "hsl(var(--primary))";
    case "cyan":
      return "hsl(var(--immutable))";
    case "blue":
      return "hsl(var(--info))";
    case "violet":
      return "hsl(var(--chart-5))";
    case "amber":
      return "hsl(var(--warning))";
    default:
      return "hsl(var(--primary))";
  }
}

export interface JobTypeMeta {
  label: string;
  icon: LucideIcon;
}

/** Human label + icon for a job type. */
export function jobTypeMeta(type: JobType): JobTypeMeta {
  switch (type) {
    case "replication":
      return { label: i18n.t("jobs:type.replication"), icon: CopyPlus };
    case "backup-copy":
      return { label: i18n.t("jobs:type.backupCopy"), icon: HardDriveDownload };
    case "backup":
    default:
      return { label: i18n.t("jobs:type.backup"), icon: DatabaseBackup };
  }
}

/** Cycle accents so created jobs get a varied dot color. */
export const ACCENT_CYCLE: AccentKey[] = ["emerald", "cyan", "blue", "violet", "amber"];

export function pickAccent(seed: number): AccentKey {
  return ACCENT_CYCLE[seed % ACCENT_CYCLE.length];
}
