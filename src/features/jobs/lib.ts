// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import {
  CopyPlus,
  DatabaseBackup,
  HardDriveDownload,
  type LucideIcon,
} from "@/lib/icons";
import type { AccentKey, JobType, Retention, Schedule } from "@/types";
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

/** Friendly retention label: "14 days" (+ GFS tail when present). */
export function retentionLabel(retention: Retention): string {
  const base = i18n.t("jobs:retention.days", { count: retention.keepDays });
  if (!retention.gfs) return base;
  const { weekly, monthly, yearly } = retention.gfs;
  const parts: string[] = [];
  if (weekly) parts.push(`${weekly}w`);
  if (monthly) parts.push(`${monthly}m`);
  if (yearly) parts.push(`${yearly}y`);
  return parts.length ? i18n.t("jobs:retention.withGfs", { base, tail: parts.join(" / ") }) : base;
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
