// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Clock,
  Database,
  DatabaseBackup,
  Globe,
  HardDriveDownload,
  Repeat,
  RotateCw,
  Settings2,
  Sliders,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { TimeField } from "@/components/ui/time-field";
import { TimeZoneField, ZoneExplanation } from "./components/TimeZoneField";
import { nextWallClockRun } from "@/lib/schedule";
import { formatDateTime, userTimeZone } from "@/lib/time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatStorage } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform";
import {
  repositorySupportsSyntheticFull,
  syntheticFullOverride,
} from "@/lib/synthetic-full";
import { resourceNameErrorKey, resourceNameProblem } from "@/lib/resource-name";
import { encryptionKeyProblem } from "@/lib/encryption-key";
import { apiErrorMessage, fullScheduleKey } from "@/services/api.http";
import { NotPermitted } from "@/components/FeatureUnavailable";
import { useCan } from "@/store/permissions";
import { useWorldStore, type CreateJobInput } from "@/store/world";
import { REPO_TYPE_META } from "@/features/repositories/components/repoMeta";
import type { BackupCopySettings, BackupJob, CopyMode, CopyWindowRule, FullBackupSchedule, JobOptions, Schedule } from "@/types";
import i18n from "@/i18n";
import {
  COPY_RETRY_DEFAULTS,
  copySourcesEncrypted,
  copySourcesHyperV,
  copySourceVms,
} from "@/lib/backup-copy";
import {
  copyModeLabel,
  copyWindowLabel,
  fullScheduleLabel,
  jobScheduleLabel,
  pickAccent,
  retentionLabel,
  scheduleLabel,
} from "./lib";
import { ScopePicker } from "./components/ScopePicker";
import { JobSummaryPanel, type SummaryData } from "./components/JobSummaryPanel";
import { EncryptionKeyField } from "./components/EncryptionKeyField";
import { HelpHint, PresetChip, ToggleRow } from "./components/FormBits";
import {
  CopyModeChoice,
  CopyRetryFields,
  CopySourcesPicker,
  CopyVmPicker,
  CopyWindowEditor,
  copyWindowRuleProblem,
} from "./components/BackupCopyFields";

type Preset = "hourly" | "every4h" | "daily" | "weekly";
type JobTypeChoice = "backup" | "replication" | "backup-copy";
const RETENTION_PRESETS = [7, 14, 30, 90];
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Saturday, as an index into DAY_KEYS — the default day for both full backup
 *  schedules on a new job. */
const FULL_BACKUP_DEFAULT_DAY = 6;
const DEFAULT_NAME_PREFIX = "replica-";
/** "" = auto — let AltaStor place the replica on any host in the target environment. */
const AUTO_HOST = "";
/** The "no job" choice of the run-after picker: a select item can't be "". */
const NO_JOB = "none";

// The API constrains job names (`_ensure_ascii_name` + `job_name_exists` in
// abr_v41.py): ^[A-Za-z0-9][A-Za-z0-9 ._-]*$, max 125 chars, and unique across
// jobs case-insensitively — anything else is a 400 `invalid_job` / 409
// `job_name_exists` at create time.
//
// That pattern rejects every accented character, so this default is deliberately
// plain ASCII and is NOT run through i18n: a translated "Täglich" / "Réplique"
// would be rejected on the accent alone. Please keep it that way.
const DEFAULT_JOB_NAME = "New job";

/**
 * First free name in the "New job", "New job 2", "New job 3", … series. The
 * suffix is " 2" rather than " (2)" because parentheses fail the pattern above.
 * `taken` is finite, so a free slot always exists within this range.
 */
function uniqueJobName(base: string, taken: Set<string>): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n <= taken.size + 2; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * The wizard's copy of one full backup schedule. `on` is the toggle. The other
 * fields are kept while it is off, so switching it back on restores them.
 */
interface FullScheduleForm {
  on: boolean;
  frequency: FullBackupSchedule["frequency"];
  atTime: string;
  daysOfWeek: number[];
  dayOfMonth: number;
  /** Periodic/cron settings the job came with (CLI only), carried through. */
  everyMinutes?: number;
  cron?: string;
  timezone?: string;
}

type FullScheduleDefaults = Pick<FullScheduleForm, "on" | "frequency" | "atTime" | "daysOfWeek" | "dayOfMonth" | "timezone">;

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

/** Seed the form from the job's stored schedule, or from `defaults` when it has none. */
function fullScheduleForm(
  stored: FullBackupSchedule | null | undefined,
  defaults: FullScheduleDefaults,
): FullScheduleForm {
  if (!stored) return { ...defaults };
  return {
    on: stored.enabled,
    frequency: stored.frequency,
    atTime: stored.atTime ?? defaults.atTime,
    daysOfWeek: stored.daysOfWeek?.length ? stored.daysOfWeek : defaults.daysOfWeek,
    dayOfMonth: stored.dayOfMonth ?? defaults.dayOfMonth,
    everyMinutes: stored.everyMinutes,
    cron: stored.cron,
    timezone: stored.timezone,
  };
}

/** The schedule a form describes. Only the fields its frequency uses are kept,
 *  since the appliance refuses, for example, weekdays on a monthly schedule. */
function toFullSchedule(f: FullScheduleForm, enabled: boolean): FullBackupSchedule {
  const base = { frequency: f.frequency, enabled, timezone: f.timezone };
  switch (f.frequency) {
    case "weekly":
      return {
        ...base,
        atTime: f.atTime,
        /* An empty day list survives only while the schedule is SWITCHED OFF —
         * switching it on blocks the save until a day is picked — and the
         * appliance refuses a weekly schedule with no weekday whatever its
         * `enabled` flag says. So the fallback applies to the disabled schedule
         * that goes on the wire, and never to the enabled one: substituting a
         * day there would print a day the operator never chose back at them in
         * the summary, which is precisely the thing the summary must not do. */
        daysOfWeek: f.daysOfWeek.length
          ? [...f.daysOfWeek].sort((a, b) => a - b)
          : enabled
            ? []
            : [FULL_BACKUP_DEFAULT_DAY],
      };
    case "monthly":
      return { ...base, atTime: f.atTime, dayOfMonth: f.dayOfMonth };
    case "periodic":
      return { ...base, everyMinutes: f.everyMinutes };
    case "cron":
      return { ...base, cron: f.cron };
    case "daily":
    default:
      return { ...base, atTime: f.atTime };
  }
}

interface FormState {
  name: string;
  preset: Preset;
  atTime: string;
  /** The zone `atTime` is read in: the job's own, or the viewer's for a new
   *  job. New full schedules take it too. */
  timezone: string;
  /** Weekly preset: the days the job runs on. A list, not a single day — the
   *  appliance stores weekdays as a list and the Full backups block below has
   *  always offered several, so offering exactly one here made the same
   *  question look like two different questions on one page. */
  daysOfWeek: number[];
  keepDays: number;
  minFulls: number;
  /** Backup jobs only: full backups on their own schedules, next to `preset`. */
  activeFull: FullScheduleForm;
  syntheticFull: FullScheduleForm;
  repositoryId: string;
  options: JobOptions;
  gfsWeekly: number;
  gfsMonthly: number;
  gfsYearly: number;
  /** GFS archiving on/off, independent of the counts above — suspending it
   *  keeps the weekly/monthly/yearly figures so they can be resumed unchanged. */
  gfsEnabled: boolean;
  // Replication target
  targetEnvironmentId: string;
  targetHostId: string;
  namePrefix: string;
  /** Backup copy jobs only, from here on. */
  copyMode: CopyMode;
  /** Periodic copies: whether `preset` applies, or the job runs only when
   *  started by hand or after `runAfterJobId`. */
  copyScheduled: boolean;
  sourceJobIds: string[];
  sourceRepositoryIds: string[];
  /** "" for none. */
  runAfterJobId: string;
  /** Every VM of the sources; otherwise the ones in `selected`. */
  copyAllVms: boolean;
  /** The window switch is separate from the rules so that switching it off
   *  and on again keeps them, as the GFS switch keeps its counts. */
  copyWindowOn: boolean;
  copyWindow: CopyWindowRule[];
  retryCount: number;
  retryIntervalMinutes: number;
}

function presetToSchedule(form: FormState): Schedule {
  switch (form.preset) {
    case "hourly":
      return { frequency: "hourly", everyHours: 1, timezone: form.timezone };
    case "every4h":
      return { frequency: "hourly", everyHours: 4, timezone: form.timezone };
    case "weekly":
      return {
        frequency: "weekly",
        atTime: form.atTime,
        daysOfWeek: [...form.daysOfWeek].sort((a, b) => a - b),
        timezone: form.timezone,
      };
    case "daily":
    default:
      return { frequency: "daily", atTime: form.atTime, timezone: form.timezone };
  }
}

function scheduleToPreset(schedule: Schedule): Preset {
  if (schedule.frequency === "weekly") return "weekly";
  if (schedule.frequency === "hourly") return (schedule.everyHours ?? 1) >= 4 ? "every4h" : "hourly";
  return "daily";
}

/** The first scheduled run of a daily or weekly job: the moment, on the job's
 *  clock and, when that reads differently, on the viewer's. */
function firstRunLabel(form: FormState): string {
  switch (form.preset) {
    case "hourly":
      return i18n.t("jobs:create.firstRun.hourly");
    case "every4h":
      return i18n.t("jobs:create.firstRun.every4h");
    default: {
      // No day picked is not a schedule yet, and naming a run for it is what
      // let the summary read like a finished setting while the save button
      // refused it.
      if (form.preset === "weekly" && !form.daysOfWeek.length) return i18n.t("jobs:create.firstRun.weeklyNoDay");
      const next = nextWallClockRun(
        form.atTime,
        form.timezone,
        form.preset === "weekly" ? { daysOfWeek: form.daysOfWeek } : {},
      );
      if (!next) return i18n.t("jobs:create.firstRun.weeklyNoDay");
      const onJobClock = formatDateTime(next, { zone: form.timezone, weekday: true });
      const onViewerClock = formatDateTime(next, { weekday: true });
      return onJobClock === onViewerClock
        ? onJobClock
        : i18n.t("jobs:schedule.withViewerTime", { label: onJobClock, viewer: onViewerClock });
    }
  }
}

export default function CreateJobPage({ kind: kindProp }: { kind?: JobTypeChoice } = {}) {
  const { t } = useTranslation("jobs");
  const { jobId } = useParams<{ jobId: string }>();
  const ready = useWorldStore((s) => s.ready);
  const existingJob = useWorldStore((s) => (jobId ? s.jobs.find((j) => j.id === jobId) : undefined));
  const permitted = useCan(jobId ? "job.edit" : "job.create");
  if (!permitted) return <NotPermitted />;

  // Edit mode seeds the form from the job via one-shot useState initializers, so
  // the form must not mount until the job is loaded. On a cold deep-link/refresh
  // to /jobs/:id/edit the store is still hydrating (existingJob undefined) — show
  // a skeleton until it lands, then bounce to the list if it truly doesn't exist.
  // Normal in-app navigation hits the already-hydrated store and renders the
  // wizard immediately, with no skeleton flash.
  if (jobId && !existingJob) {
    return ready ? <Navigate to="/jobs" replace /> : <WizardSkeleton title={t("create.loadingJob")} />;
  }

  return <JobWizard kindProp={kindProp} jobId={jobId} existingJob={existingJob} />;
}

function JobWizard({
  kindProp,
  jobId,
  existingJob,
}: {
  kindProp?: JobTypeChoice;
  jobId?: string;
  existingJob?: BackupJob;
}) {
  const { t } = useTranslation("jobs");
  const { t: tNav } = useTranslation("nav");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // "Protect" from Inventory/VM detail deep-links here with the target VM so
  // the wizard opens with it already selected instead of an empty/default scope.
  const preselectVmId = searchParams.get("vm");

  const vms = useWorldStore((s) => s.vms);
  const repositories = useWorldStore((s) => s.repositories);
  const environments = useWorldStore((s) => s.environments);
  const hosts = useWorldStore((s) => s.hosts);
  // The whole list, not just the count: the derived name has to dodge names that
  // are already taken (the API rejects duplicates with 409 `job_name_exists`).
  const jobs = useWorldStore((s) => s.jobs);
  const jobCount = jobs.length;
  const sessions = useWorldStore((s) => s.sessions);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const createJob = useWorldStore((s) => s.createJob);
  const updateJob = useWorldStore((s) => s.updateJob);

  const editMode = !!jobId;

  // The wizard's kind is fixed by the route (create) or the job being edited —
  // there is no in-form type toggle; Backup, Backup copy and Replication are
  // separate wizards.
  const kind: JobTypeChoice = editMode
    ? existingJob?.type === "replication" || existingJob?.type === "backup-copy"
      ? existingJob.type
      : "backup"
    : kindProp ?? "backup";
  const isReplication = kind === "replication";
  const isCopy = kind === "backup-copy";
  const storedCopy = existingJob?.copy;

  // ----- initial state (prefill in edit mode, smart defaults for create) -----
  const [form, setForm] = useState<FormState>(() => {
    // A copy job without a schedule of its own has none to read a time or a
    // zone from: the appliance reports null, which reads as daily at 00:00.
    const ownSchedule = existingJob && (!storedCopy || storedCopy.scheduled) ? existingJob.schedule : undefined;
    // Full backups default to the job's own run time. A full that falls due
    // together with the regular backup replaces that run instead of adding one.
    const atTime = ownSchedule?.atTime ?? "22:00";
    // A job keeps the zone it has (the appliance reports its own for one saved
    // without); a new one starts on the viewer's, which is what "22:00" means
    // to the person typing it. A copy job without a schedule keeps the zone
    // its copy window or full backups are on.
    const timezone =
      ownSchedule?.timezone ||
      storedCopy?.window[0]?.timezone ||
      existingJob?.syntheticFullSchedule?.timezone ||
      existingJob?.activeFullSchedule?.timezone ||
      userTimeZone();
    const copyMode: CopyMode = storedCopy?.mode ?? "periodic";
    const copyFields = {
      copyMode,
      copyScheduled: storedCopy ? storedCopy.scheduled : true,
      sourceJobIds: storedCopy?.sourceJobs.map((j) => j.id) ?? [],
      sourceRepositoryIds: storedCopy?.sourceRepositories.map((r) => r.id) ?? [],
      runAfterJobId: storedCopy?.runAfterJob?.id ?? "",
      copyAllVms: !existingJob?.vmIds.length,
      copyWindowOn: !!storedCopy?.window.length,
      copyWindow: storedCopy?.window ?? [],
      retryCount: storedCopy?.retry.count ?? COPY_RETRY_DEFAULTS[copyMode].count,
      retryIntervalMinutes: storedCopy?.retry.intervalMinutes ?? COPY_RETRY_DEFAULTS[copyMode].intervalMinutes,
    };
    // A new job starts with a weekly synthetic full. It is the cheaper kind,
    // and a job with retention needs at least one full schedule. A job being
    // edited starts from what it has, so no schedule is switched on for it.
    //
    // Both weekly defaults land on Saturday (DAY_KEYS index 6): a full backup
    // is the heaviest run a job does, and the weekend is when it has the estate
    // to itself. The active full is monthly out of the box, so its day only
    // takes effect once the operator switches it to weekly — it is kept in step
    // with the synthetic one so neither picker opens on a different day.
    const activeDefaults: FullScheduleDefaults = {
      on: false,
      frequency: "monthly",
      atTime,
      daysOfWeek: [FULL_BACKUP_DEFAULT_DAY],
      dayOfMonth: 1,
      timezone,
    };
    const syntheticDefaults: FullScheduleDefaults = {
      on: !existingJob,
      frequency: "weekly",
      atTime,
      daysOfWeek: [FULL_BACKUP_DEFAULT_DAY],
      dayOfMonth: 1,
      timezone,
    };
    if (existingJob) {
      return {
        name: existingJob.name,
        preset: scheduleToPreset(existingJob.schedule),
        atTime,
        timezone,
        daysOfWeek: existingJob.schedule.daysOfWeek?.length ? [...existingJob.schedule.daysOfWeek] : [0],
        keepDays: existingJob.retention.keepDays,
        minFulls: existingJob.retention.minFulls ?? 0,
        activeFull: fullScheduleForm(existingJob.activeFullSchedule, activeDefaults),
        syntheticFull: fullScheduleForm(existingJob.syntheticFullSchedule, syntheticDefaults),
        repositoryId: existingJob.repositoryId,
        options: { ...existingJob.options },
        gfsWeekly: existingJob.retention.gfs?.weekly ?? 0,
        gfsMonthly: existingJob.retention.gfs?.monthly ?? 0,
        gfsYearly: existingJob.retention.gfs?.yearly ?? 0,
        gfsEnabled: existingJob.retention.gfs?.enabled ?? true,
        targetEnvironmentId: existingJob.replicaTarget?.environmentId ?? "",
        targetHostId: existingJob.replicaTarget?.hostId ?? AUTO_HOST,
        namePrefix: existingJob.replicaTarget?.namePrefix ?? DEFAULT_NAME_PREFIX,
        ...copyFields,
      };
    }
    return {
      // Left blank — create mode shows the default name (see `autoName` below)
      // until the user types one of their own.
      name: "",
      preset: "daily",
      atTime,
      timezone,
      daysOfWeek: [0],
      keepDays: 14,
      minFulls: 0,
      activeFull: activeDefaults,
      syntheticFull: syntheticDefaults,
      // A copy job's destination is picked, never assumed: it has to differ
      // from every source, and none are picked yet.
      repositoryId: isCopy ? "" : "repo-immutable",
      options: { appAware: true, encryption: false, compression: 3, dedup: true, onQuiesceFailure: "fail" },
      gfsWeekly: 0,
      gfsMonthly: 0,
      gfsYearly: 0,
      // On, like the appliance's own default: a job that later gets GFS counts
      // should start archiving, not sit silently suspended.
      gfsEnabled: true,
      targetEnvironmentId: "",
      targetHostId: AUTO_HOST,
      namePrefix: DEFAULT_NAME_PREFIX,
      ...copyFields,
    };
  });

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (existingJob) return new Set(existingJob.vmIds);
    // A copy job picks from what its sources hold, and starts with every VM.
    if (isCopy) return new Set();
    if (preselectVmId && vms.some((v) => v.id === preselectVmId)) return new Set([preselectVmId]);
    // Default: pre-select the 'production' tag.
    return new Set(vms.filter((v) => v.tags.includes("production")).map((v) => v.id));
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  /* The key lives outside `form.options` until submit: `options` is the shape
   * that goes on the wire, and the key is only part of it when the operator
   * actually entered one. */
  const [encryptionKey, setEncryptionKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  // Distinct from `nameTouched` (a blur/submit flag that only gates the error
  // message): this tracks whether the user has actually typed a name, which is
  // what freezes the derived default. Edit mode starts frozen so a saved name is
  // never overwritten.
  const [nameEdited, setNameEdited] = useState(!!existingJob);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  /* Hyper-V carries a policy of its own (checkpoint consistency); it only means
   * something once a Hyper-V VM is in scope, so it only shows then. */
  const hypervSelected =
    !isReplication &&
    !isCopy &&
    vms.some(
      (v) => selected.has(v.id) && environments.find((e) => e.id === v.environmentId)?.hypervisor === "hyperv",
    );

  const setOption = <K extends keyof JobOptions>(key: K, value: JobOptions[K]) =>
    setForm((f) => ({ ...f, options: { ...f.options, [key]: value } }));
  /* Full schedules and copy window rules on the job's zone follow it to a new
   * one; one set to a zone of its own (from the CLI) keeps it. */
  const setTimezone = (zone: string) =>
    setForm((f) => {
      const follow = <T extends { timezone?: string }>(item: T): T =>
        !item.timezone || item.timezone === f.timezone ? { ...item, timezone: zone } : item;
      return {
        ...f,
        timezone: zone,
        activeFull: follow(f.activeFull),
        syntheticFull: follow(f.syntheticFull),
        copyWindow: f.copyWindow.map(follow),
      };
    });
  /* The retries follow the mode's defaults until the operator sets their own,
   * so switching a new job to immediate gives it the appliance's 3 × 10 min. */
  const setCopyMode = (mode: CopyMode) =>
    setForm((f) => {
      const before = COPY_RETRY_DEFAULTS[f.copyMode];
      const defaults =
        f.retryCount === before.count && f.retryIntervalMinutes === before.intervalMinutes
          ? { retryCount: COPY_RETRY_DEFAULTS[mode].count, retryIntervalMinutes: COPY_RETRY_DEFAULTS[mode].intervalMinutes }
          : {};
      return { ...f, copyMode: mode, ...defaults };
    });
  const toggleScheduleDay = (day: number) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day].sort((a, b) => a - b),
    }));

  const repository = repositories.find((r) => r.id === form.repositoryId);
  const schedule = presetToSchedule(form);

  // ----- backup copy derivation -----
  /* A copy job reads backup jobs (and other copy jobs, never itself) and
   * whole repositories, and copies the VMs they back up — every one, or the
   * ones picked from that list. */
  const sourceJobCandidates = useMemo(
    () => jobs.filter((j) => j.id !== existingJob?.id && (j.type === "backup" || j.type === "backup-copy")),
    [jobs, existingJob?.id],
  );
  const copySources = useMemo(
    () => ({ jobIds: form.sourceJobIds, repositoryIds: form.sourceRepositoryIds }),
    [form.sourceJobIds, form.sourceRepositoryIds],
  );
  const copyKnownVms = useMemo(
    () => (isCopy ? copySourceVms(copySources, { jobs, restorePoints, vms }, existingJob?.id) : []),
    [isCopy, copySources, jobs, restorePoints, vms, existingJob?.id],
  );
  const copiedVmIds = form.copyAllVms ? copyKnownVms.map((vm) => vm.id) : [...selected];
  /* Periodic copies may run without a schedule; immediate ones never have one.
   * A schedule the job already has stays: the appliance can't remove one. */
  const copyScheduleLocked = !!storedCopy?.scheduled;
  const copyScheduled = isCopy && form.copyMode === "periodic" && form.copyScheduled;
  const showSchedule = !isCopy || copyScheduled;
  const runAfterJob = isCopy && form.copyMode === "periodic" ? jobs.find((j) => j.id === form.runAfterJobId) : undefined;

  // usedGB stays 0 until a VM's first full backup lands (see api.http.ts
  // applyProtection) — exactly the common case here, since this page exists to
  // protect VMs for the first time. Fall back to provisioned capacity so the
  // estimate reflects the VM's real current size instead of reading as 0 B.
  const totalSizeGB = useMemo(
    () => vms.filter((v) => selected.has(v.id)).reduce((a, v) => a + (v.usedGB || v.provisionedGB), 0),
    [vms, selected],
  );

  // Effective throughput used to estimate the backup window. Self-calibrate from
  // measured reality instead of a hardcoded rate: a real agent-over-LAN backup
  // runs ~30-140 MB/s, not the 500 MB/s local-NVMe figure the estimate used to
  // assume (which made a 1-hour full look like ~15 min).
  //
  // Use the MOST RECENT successful FULL run that covered one of this job's VMs —
  // NOT an average. Throughput is not comparable across appliance-config changes,
  // so old runs at a different config would skew an average badly; the latest run
  // is the best predictor of the next one. Incrementals are excluded — they
  // re-PUT a synthetic full over localhost and report an inflated logical rate.
  // Fall back to the most recent full of any scope, then a realistic default
  // before any history exists.
  const effectiveMBps = useMemo(() => {
    const fulls = sessions
      .filter(
        (s) =>
          s.type === "backup" &&
          s.backupType === "full" &&
          (s.status === "success" || s.status === "warning") &&
          s.throughputMBps > 0,
      )
      .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
    const inScope = fulls.find((s) => s.vmResults?.some((r) => selected.has(r.vmId)));
    const rate = (inScope ?? fulls[0])?.throughputMBps ?? 0;
    return rate > 0 ? rate : 120;
  }, [sessions, selected]);

  // ----- replication target derivation -----
  // A replica normally lands on a *different* environment than the source VMs, so
  // exclude the source environments from the target picker (fall back to all
  // connected envs if that would leave nothing to choose).
  const sourceEnvIds = useMemo(
    () => new Set(vms.filter((v) => selected.has(v.id)).map((v) => v.environmentId)),
    [vms, selected],
  );
  const targetEnvOptions = useMemo(() => {
    const connected = environments.filter((e) => e.connected);
    const distinct = connected.filter((e) => !sourceEnvIds.has(e.id));
    return distinct.length > 0 ? distinct : connected;
  }, [environments, sourceEnvIds]);

  const targetEnv = environments.find((e) => e.id === form.targetEnvironmentId);
  const targetHostOptions = useMemo(
    () => hosts.filter((h) => h.environmentId === form.targetEnvironmentId),
    [hosts, form.targetEnvironmentId],
  );
  const targetHost = hosts.find((h) => h.id === form.targetHostId);

  // Live preview: "replica-SQL-PROD-01" using the first selected VM (or a stand-in).
  const firstSelectedVm = vms.find((v) => selected.has(v.id));
  const namePrefixClean = form.namePrefix.trim() || DEFAULT_NAME_PREFIX;
  const replicaNameExample = `${namePrefixClean}${firstSelectedVm?.name ?? "SQL-PROD-01"}`;

  // ----- default job name -----
  // A plain placeholder the user is expected to replace, stepped past any name
  // already in use so the create call can't 409. Shown until they type their own
  // name, after which it never moves again.
  const autoName = useMemo(
    () =>
      uniqueJobName(
        DEFAULT_JOB_NAME,
        new Set(jobs.filter((j) => j.id !== existingJob?.id).map((j) => j.name.trim().toLowerCase())),
      ),
    [jobs, existingJob?.id],
  );
  const jobName = nameEdited ? form.name : autoName;

  // ----- validation -----
  const errors: string[] = [];
  // Against the name as typed, never a trimmed copy: the API refuses a name
  // with surrounding whitespace, so trimming it here would submit something
  // the operator never entered. See src/lib/resource-name.ts.
  const nameProblem = resourceNameProblem(jobName);
  const nameErrorKey = resourceNameErrorKey(nameProblem);
  const nameErrorMessage = nameErrorKey ? tCommon(nameErrorKey) : t("create.nameHelp");
  if (nameProblem === "empty") errors.push(t("create.errors.name"));
  else if (nameProblem) errors.push(nameErrorMessage);
  // An encrypted job is always given its key here — the operator is the only
  // one who can hold a copy of it (see EncryptionKeyField). The exception is a
  // job that is already encrypted: the appliance is holding that key, so an
  // empty field means "keep it" rather than "no key".
  const hasStoredKey = Boolean(editMode && existingJob?.options.encryption);
  const keyEntered = form.options.encryption && !(hasStoredKey && encryptionKey === "");
  const keyProblem = keyEntered ? encryptionKeyProblem(encryptionKey) : null;
  if (keyProblem) errors.push(t(`create.opt.encryptionKeyError.${keyProblem}`));
  // Same rule the appliance enforces (`normalize_schedule_payload`: "Weekly
  // schedules require at least one weekday") and the same one the Full backups
  // block below already applied to its own weekly pickers.
  if (showSchedule && form.preset === "weekly" && form.daysOfWeek.length === 0)
    errors.push(t("create.errors.scheduleDays"));
  if (selected.size === 0 && !isCopy)
    errors.push(isReplication ? t("create.errors.scopeReplication") : t("create.vm.scopeError"));
  if (isReplication && !form.targetEnvironmentId) errors.push(t("create.errors.targetEnv"));
  if (!isReplication && !repository) errors.push(isCopy ? t("copy.errors.destination") : t("create.errors.repository"));
  // The appliance's own checks on a copy job (apply_copy_settings and
  // validate_copy_job in backup_copy.py), made here so the form names them
  // before a save is refused.
  if (isCopy) {
    if (!form.sourceJobIds.length && !form.sourceRepositoryIds.length) errors.push(t("copy.errors.noSource"));
    if (!form.copyAllVms) {
      const known = new Set(copyKnownVms.map((vm) => vm.id));
      const gone = [...selected].filter((id) => !known.has(id)).length;
      if (selected.size === 0) errors.push(t("copy.errors.noVms"));
      else if (gone) errors.push(t("copy.errors.vmsNotInSources", { count: gone }));
    }
    if (repository) {
      const sourceJobInto = jobs.find((j) => form.sourceJobIds.includes(j.id) && j.repositoryId === repository.id);
      if (form.sourceRepositoryIds.includes(repository.id))
        errors.push(t("copy.errors.destinationIsSource", { repository: repository.name }));
      else if (sourceJobInto)
        errors.push(t("copy.errors.destinationOfSourceJob", { repository: repository.name, job: sourceJobInto.name }));
    }
    if (form.copyWindowOn) {
      const problems = new Set(form.copyWindow.map(copyWindowRuleProblem));
      if (!form.copyWindow.length) errors.push(t("copy.errors.windowEmpty"));
      if (problems.has("days")) errors.push(t("copy.errors.windowDays"));
      if (problems.has("sameTime")) errors.push(t("copy.errors.windowSameTime"));
    }
    if (!form.options.encryption && copySourcesEncrypted(copySources, copiedVmIds, { jobs, restorePoints, vms }, existingJob?.id))
      errors.push(t("copy.errors.encryptedSources"));
    // A Hyper-V restore reads the copy from the Hyper-V host, which reaches S3
    // and SMB repositories (through their share), never a local folder.
    if (
      repository &&
      repository.type !== "object-lock-s3" &&
      !repository.share &&
      copySourcesHyperV(copySources, copiedVmIds, { jobs, restorePoints, vms, environments }, existingJob?.id)
    )
      errors.push(t("copy.errors.hypervDestination", { repository: repository.name }));
  }
  // abr-vhdx-tool moves Hyper-V disks on the host itself, which reaches S3 and
  // SMB repositories (through the share they name), never a local folder.
  if (hypervSelected && repository && repository.type !== "object-lock-s3" && !repository.share)
    errors.push(t("create.errors.hypervRepository", { repository: repository.name }));

  // Full backup schedules belong to backup and backup copy jobs: a copy job's
  // active full copies the newest state from the source again, its synthetic
  // full merges the copied chain in the destination.
  const hasFullSchedules = !isReplication;
  // Retention can only delete a chain once a newer full has started the next
  // one. With retention set, a job that only takes incrementals would keep a
  // chain that is never deleted, so the appliance refuses it
  // (`_ensure_full_backup_schedule`).
  const retentionSet = form.keepDays > 0;
  const fullScheduleMissing =
    hasFullSchedules && retentionSet && !form.activeFull.on && !form.syntheticFull.on;
  if (hasFullSchedules) {
    if (form.activeFull.on && form.activeFull.frequency === "weekly" && !form.activeFull.daysOfWeek.length)
      errors.push(t("create.full.errors.activeDays"));
    if (form.syntheticFull.on && form.syntheticFull.frequency === "weekly" && !form.syntheticFull.daysOfWeek.length)
      errors.push(t("create.full.errors.syntheticDays"));
    if (fullScheduleMissing) errors.push(t("create.full.errors.required"));
  }
  /* Not an error — the appliance accepts it and runs an active full instead —
   * so it is a note under the synthetic editor rather than a blocked submit.
   * "partial" carries the days the two schedules actually meet on, which is the
   * case a same-day-and-time-only check used to miss entirely (a daily merge
   * against a weekly active full). */
  const syntheticOverride = hasFullSchedules
    ? syntheticFullOverride(
        form.activeFull.on ? toFullSchedule(form.activeFull, true) : null,
        form.syntheticFull.on ? toFullSchedule(form.syntheticFull, true) : null,
      )
    : null;
  const syntheticOverrideNote = (() => {
    if (!syntheticOverride) return undefined;
    const { kind, days, dayOfMonth, monthsWithoutDay } = syntheticOverride;
    const dayList = () => (days ?? []).map((d) => t(`days.long.${DAY_KEYS[d]}`)).join(", ");
    // Only some months: the ones without a day, or the ones a day of the month
    // falls on one of the weekdays ("Monday or Wednesday").
    if (monthsWithoutDay !== undefined) {
      return t(kind === "sameDay" ? "create.full.syntheticSameMonthEnd" : "create.full.syntheticOverriddenMonthEnd", {
        day: monthsWithoutDay,
      });
    }
    if (dayOfMonth !== undefined && days?.length) {
      const anyOfDays = new Intl.ListFormat(i18n.language, { type: "disjunction" }).format(
        days.map((d) => t(`days.long.${DAY_KEYS[d]}`)),
      );
      return t(
        kind === "sameDay" ? "create.full.syntheticSameDayOfMonthOnDays" : "create.full.syntheticOverriddenDayOfMonthOnDays",
        { day: dayOfMonth, days: anyOfDays },
      );
    }
    if (kind === "sameDay") {
      // Different times, so neither overrides the other — they just both happen
      // that day, and the merge is the one that ends up with nothing to do.
      if (dayOfMonth !== undefined) return t("create.full.syntheticSameDayOfMonth", { day: dayOfMonth });
      return days?.length
        ? t("create.full.syntheticSameDays", { days: dayList() })
        : t("create.full.syntheticSameDayEvery");
    }
    if (kind === "always") return t("create.full.syntheticOverridden");
    if (dayOfMonth !== undefined) {
      return t("create.full.syntheticOverriddenDayOfMonth", { day: dayOfMonth });
    }
    return t("create.full.syntheticOverriddenDays", { days: dayList() });
  })();

  /** Whether any GFS count is set at all — an "active" policy with every count
   *  at zero archives nothing, and the switch's hint says so rather than
   *  implying long-term copies are being kept. */
  const gfsConfigured = Boolean(form.gfsWeekly || form.gfsMonthly || form.gfsYearly);

  /**
   * What to send for one full schedule. undefined leaves the job's schedule
   * as it is.
   *
   * Switching a schedule off suspends a schedule the job already has, which
   * keeps its settings (as the GFS switch does). A schedule the job never had
   * stays absent. On edit, only a schedule that changed is sent: the appliance
   * recalculates the next run of every schedule it receives.
   */
  const fullScheduleInput = (
    f: FullScheduleForm,
    stored: FullBackupSchedule | null | undefined,
  ): FullBackupSchedule | null | undefined => {
    if (!hasFullSchedules) return undefined;
    /* "Off" has exactly one spelling on the wire, on create and on edit alike:
     * the schedule as the form holds it, with `enabled: false`. Creating used
     * to send `null` and then, briefly, nothing at all, for the same switch
     * that editing expressed as a disabled object — three shapes for one
     * action, which is what made "is this schedule off, absent, or cleared?" a
     * question the API could be asked in three ways and answer differently.
     * The job keeps the settings behind the switch either way, which is what
     * the editor's own "Off. The job keeps its settings" hint promises. */
    const desired = toFullSchedule(f, f.on);
    if (!editMode) return desired;
    return fullScheduleKey(desired) === fullScheduleKey(stored) ? undefined : desired;
  };

  /* A copy job's settings as the job will hold them. Names ride along for
   * the summary and the demo world; the appliance takes the ids. */
  const copySettings: BackupCopySettings | undefined = isCopy
    ? {
        mode: form.copyMode,
        sourceJobs: form.sourceJobIds.map((id) => ({ id, name: jobs.find((j) => j.id === id)?.name ?? id })),
        sourceRepositories: form.sourceRepositoryIds.map((id) => ({
          id,
          name: repositories.find((r) => r.id === id)?.name ?? id,
        })),
        runAfterJob: runAfterJob ? { id: runAfterJob.id, name: runAfterJob.name } : null,
        retry: { count: form.retryCount, intervalMinutes: form.retryIntervalMinutes },
        window: form.copyWindowOn ? form.copyWindow : [],
        scheduled: copyScheduled,
      }
    : undefined;
  /** When the job runs, in the words the jobs list will use for it. */
  const whenLabel = isCopy ? jobScheduleLabel({ schedule, state: "idle", copy: copySettings }) : scheduleLabel(schedule);
  /** The VMs the job covers, as a count or "every VM of the sources". */
  const objectsLabel = (count: number) =>
    isCopy && form.copyAllVms ? t("copy.scope.allVms") : t("create.scope.vmSummary", { count });

  const buildInput = (runNow: boolean): CreateJobInput => {
    // A copy job that copies every VM of its sources names none.
    const ids = isCopy && form.copyAllVms ? [] : [...selected];
    const scopeSummary = t("create.scope.vmSummary", { count: ids.length });

    // GFS long-term retention is a backup-only concept — replicas keep N points, no archival tail.
    const gfs =
      !isReplication && (form.gfsWeekly || form.gfsMonthly || form.gfsYearly)
        ? {
            weekly: form.gfsWeekly,
            monthly: form.gfsMonthly,
            yearly: form.gfsYearly,
            enabled: form.gfsEnabled,
          }
        : undefined;

    // The schema still requires a repositoryId for replication jobs; keep the current
    // selection, falling back to the first repository so it's always a valid id.
    const repositoryId = form.repositoryId || repositories[0]?.id || "";

    const replicaTarget = isReplication
      ? {
          environmentId: form.targetEnvironmentId,
          hostId: form.targetHostId || undefined,
          namePrefix: form.namePrefix.trim() || DEFAULT_NAME_PREFIX,
        }
      : undefined;

    return {
      name: jobName,
      type: kind,
      vmIds: ids,
      scopeSummary,
      repositoryId,
      schedule,
      activeFullSchedule: fullScheduleInput(form.activeFull, existingJob?.activeFullSchedule),
      syntheticFullSchedule: fullScheduleInput(form.syntheticFull, existingJob?.syntheticFullSchedule),
      retention: isReplication ? { keepDays: form.keepDays, gfs } : { keepDays: form.keepDays, gfs, minFulls: form.minFulls },
      // The key rides with the options only when the operator entered one — see
      // `optionsToTaskParams`, where omitting it is what carries a job's stored
      // key through an edit untouched.
      options: keyEntered ? { ...form.options, encryptionKey } : form.options,
      accent: existingJob?.accent ?? pickAccent(jobCount),
      runNow,
      replicaTarget,
      copy: copySettings,
    };
  };

  const handleSubmit = async (runNow: boolean) => {
    setNameTouched(true);
    setKeyTouched(true);
    if (errors.length) {
      toast.error(t("create.toast.almostThere"), { description: errors[0] });
      return;
    }
    setSubmitting(true);
    const input = buildInput(runNow);

    try {
      if (editMode && existingJob) {
        await updateJob(existingJob.id, {
          name: input.name,
          vmIds: input.vmIds,
          scopeSummary: input.scopeSummary,
          repositoryId: input.repositoryId,
          schedule: input.schedule,
          // Left out when unchanged: the sim driver spreads the patch over the
          // job, so an explicit undefined would wipe the stored schedule.
          ...(input.activeFullSchedule !== undefined ? { activeFullSchedule: input.activeFullSchedule } : {}),
          ...(input.syntheticFullSchedule !== undefined
            ? { syntheticFullSchedule: input.syntheticFullSchedule }
            : {}),
          retention: input.retention,
          options: input.options,
          ...(isReplication ? { replicaTarget: input.replicaTarget } : {}),
          ...(isCopy ? { copy: input.copy } : {}),
        });
        toast.success(t("create.toast.updated"), {
          description: t("create.toast.updatedDesc", { name: input.name, objects: objectsLabel(input.vmIds.length) }),
        });
        navigate(`/jobs/${existingJob.id}`);
        return;
      }

      const job = await createJob(input);
      toast.success(runNow ? t("create.toast.createdRun", { name: job.name }) : t("create.toast.created", { name: job.name }), {
        description: t("create.toast.createdDesc", {
          objects: objectsLabel(input.vmIds.length),
          schedule: whenLabel,
          retention: retentionLabel(input.retention),
        }),
      });
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      toast.error(t("create.toast.rejected"), {
        description: apiErrorMessage(err) ?? t("create.toast.rejectedDesc"),
      });
      setSubmitting(false);
    }
  };

  const replicaPointsLabel = t("create.replicaPoints", { count: form.keepDays });

  /** When the first run happens. A copy job without a schedule waits for a
   *  person, for the job it follows, or for a source backup. */
  const copyFirstRunLabel =
    form.copyMode === "immediate"
      ? t("copy.firstRun.immediate")
      : copyScheduled
        ? firstRunLabel(form)
        : runAfterJob
          ? t("copy.firstRun.afterJob", { job: runAfterJob.name })
          : t("copy.firstRun.manual");

  const summary: SummaryData = {
    name: jobName,
    vmCount: isCopy ? copiedVmIds.length : selected.size,
    totalSizeGB,
    effectiveMBps,
    compressionLevel: form.options.compression,
    repository,
    scheduleLabel: whenLabel,
    retentionLabel: isReplication
      ? replicaPointsLabel
      : retentionLabel({
          keepDays: form.keepDays,
          minFulls: form.minFulls,
          gfs:
            form.gfsWeekly || form.gfsMonthly || form.gfsYearly
              ? {
                  weekly: form.gfsWeekly,
                  monthly: form.gfsMonthly,
                  yearly: form.gfsYearly,
                  enabled: form.gfsEnabled,
                }
              : undefined,
        }),
    firstRunLabel: isCopy ? copyFirstRunLabel : firstRunLabel(form),
    fullBackups: hasFullSchedules
      ? {
          active: fullScheduleLabel(form.activeFull.on ? toFullSchedule(form.activeFull, true) : null),
          synthetic: fullScheduleLabel(form.syntheticFull.on ? toFullSchedule(form.syntheticFull, true) : null),
        }
      : undefined,
    errors,
    replication: isReplication
      ? {
          targetEnvName: targetEnv?.name ?? "",
          targetPlatform: targetEnv ? PLATFORM_META[targetEnv.hypervisor].short : "",
          targetHostName: form.targetHostId ? targetHost?.name ?? "—" : t("create.autoPlaces"),
          replicaNameExample,
        }
      : undefined,
    copy: copySettings
      ? {
          allVms: form.copyAllVms,
          mode: copyModeLabel(copySettings.mode),
          sources:
            [...copySettings.sourceJobs, ...copySettings.sourceRepositories].map((s) => s.name).join(", ") ||
            t("common:generic.na"),
          window: copyWindowLabel(copySettings.window),
        }
      : undefined,
  };

  const showNameError = nameTouched && nameProblem !== null;
  const needsTime = form.preset === "daily" || form.preset === "weekly";

  return (
    <div className="space-y-4">
      <PageHeader
        backTo={
          editMode
            // Name the destination, and name it through i18n: these were
            // hardcoded English, so every non-EN locale read "Backup" under a
            // sidebar saying "Sauvegarde". The edit crumb points at a page
            // titled with the job's own name, so it carries that name.
            ? { href: `/jobs/${jobId}`, label: existingJob?.name ?? tNav("backups") }
            : isReplication
              ? { href: "/replication", label: tNav("replication") }
              : { href: "/jobs", label: tNav("backups") }
        }
        title={
          isReplication
            ? editMode
              ? t("create.repl.editTitle")
              : t("create.repl.title")
            : isCopy
              ? editMode
                ? t("copy.form.editTitle")
                : t("copy.form.title")
              : editMode
                ? t("create.vm.editTitle")
                : t("create.vm.title")
        }
        description={
          isReplication
            ? editMode
              ? t("create.repl.editDescription")
              : t("create.repl.description")
            : isCopy
              ? editMode
                ? t("copy.form.editDescription")
                : t("copy.form.description")
              : editMode
                ? t("create.editDescription")
                : t("create.vm.description")
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ------------------------------- FORM ------------------------------- */}
        <div className="space-y-4 lg:col-span-8">
          {/* Name */}
          <Card>
            <CardContent className="space-y-2 p-5">
              <Label htmlFor="job-name">{t("create.jobName")}</Label>
              <Input
                id="job-name"
                value={jobName}
                onChange={(e) => {
                  setNameEdited(true);
                  set("name", e.target.value);
                }}
                onBlur={() => setNameTouched(true)}
                // Plain ASCII, no em-dash: this is an example of a name the API
                // will actually accept (see DEFAULT_JOB_NAME above).
                placeholder={t("create.jobNamePlaceholder")}
                className={cn(showNameError && "border-danger")}
                aria-invalid={showNameError}
              />
              {showNameError && <p className="text-xs text-danger">{nameErrorMessage}</p>}
            </CardContent>
          </Card>

          {/* What to back up / replicate / copy */}
          {isCopy ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HardDriveDownload className="h-4 w-4 text-muted-foreground" />
                    {t("copy.form.copyFrom")}
                  </CardTitle>
                  <CardDescription className="text-xs">{t("copy.form.copyFromHint")}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <CopySourcesPicker
                    jobs={sourceJobCandidates}
                    repositories={repositories}
                    restorePoints={restorePoints}
                    sourceJobIds={form.sourceJobIds}
                    sourceRepositoryIds={form.sourceRepositoryIds}
                    destinationId={form.repositoryId}
                    onChange={({ jobIds, repositoryIds }) =>
                      setForm((f) => ({ ...f, sourceJobIds: jobIds, sourceRepositoryIds: repositoryIds }))
                    }
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    {t("copy.form.whichVms")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <CopyVmPicker
                    allVms={form.copyAllVms}
                    onAllVms={(all) => set("copyAllVms", all)}
                    known={copyKnownVms}
                    selected={selected}
                    onToggle={(vmId) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(vmId)) next.delete(vmId);
                        else next.add(vmId);
                        return next;
                      })
                    }
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  {isReplication ? t("create.whatToReplicate") : t("create.whatToBackUp")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ScopePicker selected={selected} onChange={setSelected} />
              </CardContent>
            </Card>
          )}

          {/* Where — repository (backup) OR replica target (replication) */}
          {isReplication ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {t("create.replicateTo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* Target environment */}
                <div className="space-y-1.5">
                  <Label htmlFor="target-env">{t("create.targetEnvironment")}</Label>
                  <Select
                    value={form.targetEnvironmentId}
                    onValueChange={(v) => {
                      // Changing environments invalidates the host — reset to Auto.
                      setForm((f) => ({ ...f, targetEnvironmentId: v, targetHostId: AUTO_HOST }));
                    }}
                  >
                    <SelectTrigger id="target-env" aria-label={t("create.targetEnvironment")}>
                      <SelectValue placeholder={t("create.chooseTargetEnv")} />
                    </SelectTrigger>
                    <SelectContent>
                      {targetEnvOptions.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          <span className="flex items-center gap-2">
                            {e.name}
                            <span className="text-[11px] text-muted-foreground">
                              · {PLATFORM_META[e.hypervisor].short}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {t("create.replicaDiffEnv")}
                  </p>
                </div>

                {/* Target host (optional) */}
                <div className="space-y-1.5">
                  <span className="flex items-center gap-1.5">
                    <Label htmlFor="target-host">{t("create.targetHost")}</Label>
                    <span className="text-[11px] font-normal text-muted-foreground">{t("create.optional")}</span>
                  </span>
                  <Select
                    value={form.targetHostId}
                    onValueChange={(v) => set("targetHostId", v)}
                    disabled={!form.targetEnvironmentId}
                  >
                    <SelectTrigger id="target-host" aria-label={t("create.targetHost")}>
                      <SelectValue placeholder={t("create.autoPlace")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_HOST}>{t("create.autoPlace")}</SelectItem>
                      {targetHostOptions.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          <span className="flex items-center gap-2">
                            {h.name}
                            <span className="text-[11px] text-muted-foreground">
                              · {t("create.hostSpec", { cores: h.cpuCores, ram: formatStorage(h.memoryGB) })}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Replica name prefix + live preview */}
                <div className="space-y-1.5">
                  <Label htmlFor="name-prefix">{t("create.replicaPrefix")}</Label>
                  <Input
                    id="name-prefix"
                    value={form.namePrefix}
                    onChange={(e) => set("namePrefix", e.target.value)}
                    placeholder={DEFAULT_NAME_PREFIX}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    <Trans
                      i18nKey="create.replicasNamed"
                      ns="jobs"
                      values={{ example: replicaNameExample }}
                      components={{ 1: <span className="nums font-medium text-foreground" /> }}
                    />
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  {isCopy ? t("copy.form.copyTo") : t("create.whereToStore")}
                </CardTitle>
                {isCopy && <CardDescription className="text-xs">{t("copy.form.copyToHint")}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Select value={form.repositoryId} onValueChange={(v) => set("repositoryId", v)}>
                  <SelectTrigger aria-label={isCopy ? t("copy.form.copyTo") : t("create.whereToStore")}>
                    <SelectValue placeholder={isCopy ? t("copy.form.pickDestination") : undefined} />
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex items-center gap-2">
                          {r.name}
                          <span className="text-[11px] text-muted-foreground">· {REPO_TYPE_META[r.type].short}</span>
                          {/* A source can't take the copies; say so in the list
                              rather than only once it is picked. */}
                          {isCopy &&
                            (form.sourceRepositoryIds.includes(r.id) ||
                              jobs.some((j) => form.sourceJobIds.includes(j.id) && j.repositoryId === r.id)) && (
                              <span className="text-[11px] text-warning-text">· {t("copy.form.isSource")}</span>
                            )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {repository && (
                  <div className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{repository.path}</span>
                    </span>
                    <span className="nums shrink-0 font-medium">
                      {/* S3 reports no capacity, so "capacity - used" was a flat
                          "0 MB free" on every object-storage repository. There is
                          no ceiling to report, so say that instead of inventing one. */}
                      {repository.capacityGB > 0
                        ? t("create.freeSuffix", {
                            free: formatStorage(repository.capacityGB - repository.usedGB, 0),
                          })
                        : t("create.elasticCapacity")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Schedule — for a copy job, also how it copies and what it follows */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Repeat className="h-4 w-4 text-muted-foreground" />
                {isCopy ? t("copy.form.when") : t("create.howOften")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {isCopy && (
                <CopyModeChoice
                  mode={form.copyMode}
                  onChange={setCopyMode}
                  immediateLockedReason={copyScheduleLocked ? t("copy.mode.immediateLocked") : undefined}
                />
              )}
              {isCopy && form.copyMode === "immediate" && (
                <p className="text-xs text-muted-foreground">{t("copy.form.immediateNote")}</p>
              )}
              {isCopy && form.copyMode === "periodic" && (
                <ToggleRow
                  label={t("copy.form.onSchedule")}
                  hint={
                    copyScheduleLocked
                      ? t("copy.form.scheduleLocked")
                      : form.copyScheduled
                        ? t("copy.form.onScheduleOn")
                        : t("copy.form.onScheduleOff")
                  }
                  checked={form.copyScheduled}
                  onChange={(v) => set("copyScheduled", v)}
                  disabled={copyScheduleLocked}
                />
              )}
              {showSchedule && (
              <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PresetChip icon={Clock} label={t("create.preset.hourly")} sub={t("create.preset.hourlySub")} active={form.preset === "hourly"} onClick={() => set("preset", "hourly")} />
                <PresetChip icon={Clock} label={t("create.preset.every4h")} sub={t("create.preset.every4hSub")} active={form.preset === "every4h"} onClick={() => set("preset", "every4h")} />
                <PresetChip icon={CalendarDays} label={t("create.preset.daily")} sub={t("create.preset.dailySub")} active={form.preset === "daily"} onClick={() => set("preset", "daily")} />
                <PresetChip icon={CalendarDays} label={t("create.preset.weekly")} sub={t("create.preset.weeklySub", { count: form.preset === "weekly" ? Math.max(form.daysOfWeek.length, 1) : 1 })} active={form.preset === "weekly"} onClick={() => set("preset", "weekly")} />
              </div>
              {needsTime && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="run-time">{t("create.atTime")}</Label>
                    <TimeField
                      id="run-time"
                      value={form.atTime}
                      onChange={(v) => set("atTime", v)}
                      className="w-36"
                    />
                  </div>
                  {form.preset === "weekly" && (
                    <div className="space-y-1.5">
                      <Label>{t("create.onDays")}</Label>
                      <div className="flex flex-wrap gap-1">
                        {DAY_KEYS.map((d, i) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleScheduleDay(i)}
                            className={cn(
                              "h-9 w-10 border font-display text-xs font-medium transition-colors",
                              form.daysOfWeek.includes(i)
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground",
                            )}
                            aria-pressed={form.daysOfWeek.includes(i)}
                          >
                            {t(`days.short.${d}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {needsTime && (
                <div className="space-y-1.5">
                  <TimeZoneField id="run-timezone" value={form.timezone} onChange={setTimezone} />
                  <ZoneExplanation
                    atTime={form.atTime}
                    zone={form.timezone}
                    days={form.preset === "weekly" ? { daysOfWeek: form.daysOfWeek } : {}}
                  />
                </div>
              )}
              </>
              )}
              {/* Without a schedule the zone still decides when the copy
                  window and the full backups below fall. */}
              {isCopy && !showSchedule && (
                <div className="space-y-1.5">
                  <TimeZoneField id="run-timezone" value={form.timezone} onChange={setTimezone} />
                  <p className="text-xs text-muted-foreground">{t("copy.form.zoneHint")}</p>
                </div>
              )}
              {isCopy && form.copyMode === "periodic" && (
                <div className="space-y-1.5">
                  <Label htmlFor="copy-run-after">{t("copy.form.runAfter")}</Label>
                  <Select
                    value={form.runAfterJobId || NO_JOB}
                    onValueChange={(v) => set("runAfterJobId", v === NO_JOB ? "" : v)}
                  >
                    <SelectTrigger id="copy-run-after" className="sm:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_JOB}>{t("copy.form.runAfterNone")}</SelectItem>
                      {jobs
                        .filter((j) => j.id !== existingJob?.id && j.type !== "replication")
                        .map((j) => (
                          <SelectItem key={j.id} value={j.id}>
                            {j.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {runAfterJob ? t("copy.form.runAfterHint", { job: runAfterJob.name }) : t("copy.form.manualHint")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {isCopy && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {t("copy.form.windowTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <CopyWindowEditor
                  on={form.copyWindowOn}
                  onToggle={(on) => set("copyWindowOn", on)}
                  rules={form.copyWindow}
                  onChange={(rules) => set("copyWindow", rules)}
                  timezone={form.timezone}
                />
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("copy.retry.title")}
                  </p>
                  <CopyRetryFields
                    count={form.retryCount}
                    intervalMinutes={form.retryIntervalMinutes}
                    mode={form.copyMode}
                    onChange={({ count, intervalMinutes }) =>
                      setForm((f) => ({ ...f, retryCount: count, retryIntervalMinutes: intervalMinutes }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full backups — optional schedules of their own, next to the one above */}
          {hasFullSchedules && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DatabaseBackup className="h-4 w-4 text-muted-foreground" />
                    {t("create.full.title")}
                  </CardTitle>
                  <HelpHint term={t("create.full.term")} label={t("create.full.help")} />
                </div>
                <CardDescription className="text-xs">
                  {isCopy ? t("copy.full.description") : t("create.full.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <FullScheduleEditor
                  id="active-full"
                  title={t("create.full.active")}
                  hint={isCopy ? t("copy.full.activeHint") : t("create.full.activeHint")}
                  value={form.activeFull}
                  stored={existingJob?.activeFullSchedule}
                  onChange={(v) => set("activeFull", v)}
                />
                <FullScheduleEditor
                  id="synthetic-full"
                  title={t("create.full.synthetic")}
                  hint={isCopy ? t("copy.full.syntheticHint") : t("create.full.syntheticHint")}
                  value={form.syntheticFull}
                  stored={existingJob?.syntheticFullSchedule}
                  onChange={(v) => set("syntheticFull", v)}
                  // The appliance runs an active full instead when the
                  // repository can't merge a chain. Say so here, before the
                  // operator counts on the cheaper kind.
                  note={
                    repository && !repositorySupportsSyntheticFull(repository)
                      ? t("create.full.syntheticUnsupported", { repository: repository.name })
                      // Legal, but the active full wins wherever the two fall
                      // due together — always, or on the days named. Say so
                      // rather than let the job quietly do the expensive thing.
                      : syntheticOverrideNote
                  }
                />
                {fullScheduleMissing && (
                  <p className="flex items-center gap-1.5 text-xs text-danger" role="alert">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {t("create.full.errors.required")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Retention — days of backups to keep, OR recovery points on the replica */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sliders className="h-4 w-4 text-muted-foreground" />
                {isReplication ? t("create.recoveryPointsToKeep") : t("create.howLongToKeep")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap gap-2">
                {RETENTION_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set("keepDays", n)}
                    className={cn(
                      "border px-3 py-1 text-sm font-medium transition-colors",
                      form.keepDays === n
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={form.keepDays === n}
                  >
                    {isReplication ? n : t("create.daysShort", { count: n })}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <Slider
                  value={[form.keepDays]}
                  min={1}
                  max={120}
                  step={1}
                  onValueChange={([v]) => set("keepDays", v)}
                  className="flex-1"
                  aria-label={isReplication ? t("create.retentionAriaReplication") : t("create.retentionAriaBackup")}
                />
                <span className="nums w-14 shrink-0 text-right font-display text-sm font-medium">
                  {isReplication ? form.keepDays : t("create.daysShort", { count: form.keepDays })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {isReplication
                  ? t("create.keepReplicaNote", { count: form.keepDays })
                  : isCopy
                    ? t("copy.keepNote", { count: form.keepDays })
                    : t("create.keepBackupNote", { count: form.keepDays })}
              </p>
              {!isReplication && (
                <div className="space-y-2 border-t border-border pt-4" data-testid="retention-min-fulls">
                  <Label htmlFor="retention-min-fulls">{t("create.minFulls")}</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="retention-min-fulls"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      step={1}
                      value={form.minFulls}
                      onChange={(event) => {
                        const value = Math.trunc(Number(event.target.value));
                        set("minFulls", Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);
                      }}
                      className="w-24"
                      aria-label={t("create.minFullsAria")}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.minFulls > 0
                      ? t("create.minFullsOn", { count: form.minFulls })
                      : t("create.minFullsOff")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Advanced disclosure */}
          <Card>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between p-5 text-left"
              aria-expanded={advancedOpen}
            >
              <span className="flex items-center gap-2 font-display text-base font-semibold">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                {t("create.advanced")}
                <span className="text-xs font-normal text-muted-foreground">{t("create.advancedHint")}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {advancedOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 border-t border-border p-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <ToggleRow
                        label={t("create.opt.encryption")}
                        hint={
                          isReplication
                            ? t("create.opt.encryptionHintReplication")
                            : isCopy
                              ? t("copy.encryptionHint")
                              : t("create.opt.encryptionHintBackup")
                        }
                        checked={form.options.encryption}
                        onChange={(v) => setOption("encryption", v)}
                      />
                      <div className="space-y-1.5">
                        <span className="flex items-center gap-1.5">
                          <Label>{t("settings.compression")}</Label>
                          <HelpHint
                            term={t("create.opt.compressionTerm")}
                            label={t("create.opt.compressionHelp")}
                          />
                        </span>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[form.options.compression]}
                            min={0}
                            max={9}
                            step={1}
                            onValueChange={([v]) => setOption("compression", v)}
                            className="flex-1"
                            aria-label={t("settings.compression")}
                          />
                          <span className="nums w-4 text-right font-display text-sm font-medium">{form.options.compression}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{t("create.opt.compressionHint")}</p>
                      </div>
                    </div>

                    {/* A copy reads stored backups and never quiesces anything. */}
                    {!isReplication && !isCopy && !hypervSelected && (
                      <ToggleRow
                        label={t("create.opt.quiesceFallback")}
                        hint={t("create.opt.quiesceFallbackHint")}
                        help={t("create.opt.quiesceFallbackHelp")}
                        helpTerm={t("create.opt.quiesceFallbackTerm")}
                        checked={form.options.onQuiesceFailure === "crash_consistent"}
                        onChange={(v) => setOption("onQuiesceFailure", v ? "crash_consistent" : "fail")}
                      />
                    )}

                    {/* The key is only asked for once encryption is on, and
                        answering it is a disaster-recovery decision rather than
                        a preference — see EncryptionKeyField. */}
                    {form.options.encryption && (
                      <EncryptionKeyField
                        value={encryptionKey}
                        onChange={setEncryptionKey}
                        touched={keyTouched || encryptionKey !== ""}
                        hasStoredKey={hasStoredKey}
                      />
                    )}

                    {hypervSelected && (
                      <div className="space-y-3">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          {t("create.hyperv.title")}
                          <HelpHint term={t("create.hyperv.term")} label={t("create.hyperv.help")} />
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="hyperv-consistency">{t("settings.guestConsistency")}</Label>
                            <Select
                              value={form.options.guestConsistency ?? "application"}
                              onValueChange={(v) => setOption("guestConsistency", v as "application" | "crash")}
                            >
                              <SelectTrigger id="hyperv-consistency">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="application">{t("hyperv.consistency.application")}</SelectItem>
                                <SelectItem value="crash">{t("hyperv.consistency.crash")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                              {t(`create.hyperv.consistencyHint.${form.options.guestConsistency ?? "application"}`)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* GFS archival is backup-only — replicas keep N recovery points, no long-term tail. */}
                    {!isReplication && (
                      <div>
                        <p className="mb-0.5 flex items-center gap-1.5 text-sm font-medium">
                          {t("create.gfsTitle")}
                          <HelpHint
                            term={t("create.gfsTerm")}
                            label={t("create.gfsHelp")}
                          />
                        </p>
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          {t("create.gfsDescription")}
                        </p>
                        {/* Protection on/off is the appliance's own `gfs.enabled`,
                            deliberately separate from the counts: suspending
                            archiving must not make the operator retype the
                            weekly/monthly/yearly figures to resume it. */}
                        <ToggleRow
                          label={t("create.gfsEnabledLabel")}
                          hint={
                            form.gfsEnabled
                              ? gfsConfigured
                                ? t("create.gfsEnabledHint")
                                : t("create.gfsEnabledNoCounts")
                              : t("create.gfsSuspendedHint")
                          }
                          help={t("create.gfsEnabledHelp")}
                          helpTerm={t("create.gfsEnabledTerm")}
                          checked={form.gfsEnabled}
                          onChange={(v) => set("gfsEnabled", v)}
                        />
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <GfsInput
                            label={t("create.gfsWeekly")}
                            value={form.gfsWeekly}
                            onChange={(v) => set("gfsWeekly", v)}
                            dimmed={!form.gfsEnabled}
                          />
                          <GfsInput
                            label={t("create.gfsMonthly")}
                            value={form.gfsMonthly}
                            onChange={(v) => set("gfsMonthly", v)}
                            dimmed={!form.gfsEnabled}
                          />
                          <GfsInput
                            label={t("create.gfsYearly")}
                            value={form.gfsYearly}
                            onChange={(v) => set("gfsYearly", v)}
                            dimmed={!form.gfsEnabled}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>

        {/* ------------------------------ SUMMARY ----------------------------- */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-4">
            <JobSummaryPanel
              data={summary}
              editMode={editMode}
              submitting={submitting}
              onCreate={() => handleSubmit(false)}
              onCreateAndRun={() => handleSubmit(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ small bits ------------------------------ */
/** Placeholder shown while the world hydrates on a cold deep-link to an edit URL,
 *  so the form only mounts (and seeds itself) once the job is actually loaded. */
function WizardSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={title}>
      <div className="h-8 w-56 animate-pulse bg-muted" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-muted/50" />
          ))}
        </div>
        <div className="lg:col-span-4">
          <div className="h-80 animate-pulse bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

/**
 * One full backup schedule: a switch, and while it is on, the pattern it runs
 * on. Daily, weekly and monthly can be edited. A periodic or cron schedule the
 * job already has (set from the CLI) is offered as its own choice, so saving
 * the job keeps it.
 */
function FullScheduleEditor({
  id,
  title,
  hint,
  value,
  stored,
  onChange,
  note,
}: {
  id: string;
  title: string;
  hint: string;
  value: FullScheduleForm;
  /** The job's saved schedule, in edit mode. */
  stored?: FullBackupSchedule | null;
  onChange: (next: FullScheduleForm) => void;
  /** A warning shown under the editor while the schedule is on. */
  note?: string;
}) {
  const { t } = useTranslation("jobs");
  const update = (patch: Partial<FullScheduleForm>) => onChange({ ...value, ...patch });

  const custom =
    stored && (stored.frequency === "periodic" || stored.frequency === "cron") ? stored : undefined;
  const frequencies: { key: FullScheduleForm["frequency"]; label: string }[] = [
    { key: "daily", label: t("create.preset.daily") },
    { key: "weekly", label: t("create.preset.weekly") },
    { key: "monthly", label: t("create.full.monthly") },
    ...(custom ? [{ key: custom.frequency, label: fullScheduleLabel({ ...custom, enabled: true }) }] : []),
  ];
  const isCustom = value.frequency === "periodic" || value.frequency === "cron";

  const toggleDay = (day: number) =>
    update({
      daysOfWeek: value.daysOfWeek.includes(day)
        ? value.daysOfWeek.filter((d) => d !== day)
        : [...value.daysOfWeek, day].sort((a, b) => a - b),
    });

  // Off, with settings the job keeps: say that they are kept, and what they are.
  const offHint =
    !value.on && stored ? t("create.full.keptWhenOff", { schedule: fullScheduleLabel(toFullSchedule(value, true)) }) : hint;

  return (
    <div className="border border-border bg-muted/20">
      <label className="flex cursor-pointer items-start justify-between gap-3 p-3">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{value.on ? hint : offHint}</span>
        </span>
        <Switch checked={value.on} onCheckedChange={(on) => update({ on })} aria-label={title} />
      </label>
      {value.on && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
            {frequencies.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() =>
                  // Picking the custom choice again restores what the job came with.
                  update(
                    f.key === "periodic" || f.key === "cron"
                      ? { frequency: f.key, everyMinutes: custom?.everyMinutes, cron: custom?.cron }
                      : { frequency: f.key },
                  )
                }
                className={cn(
                  "border px-3 py-1 text-sm font-medium transition-colors",
                  value.frequency === f.key
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={value.frequency === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isCustom ? (
            <p className="text-[11px] text-muted-foreground">{t("create.full.customNote")}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-time`}>{t("create.atTime")}</Label>
                <TimeField
                  id={`${id}-time`}
                  value={value.atTime}
                  onChange={(v) => update({ atTime: v })}
                  className="w-36"
                />
              </div>
              {value.frequency === "weekly" && (
                <div className="space-y-1.5">
                  <Label>{t("create.full.onDays")}</Label>
                  <div className="flex flex-wrap gap-1">
                    {DAY_KEYS.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={cn(
                          "h-9 w-10 border font-display text-xs font-medium transition-colors",
                          value.daysOfWeek.includes(i)
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        aria-pressed={value.daysOfWeek.includes(i)}
                      >
                        {t(`days.short.${d}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {value.frequency === "monthly" && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-day`}>{t("create.full.dayOfMonth")}</Label>
                  <Select
                    value={String(value.dayOfMonth)}
                    onValueChange={(v) => update({ dayOfMonth: Number(v) })}
                  >
                    <SelectTrigger id={`${id}-day`} className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_MONTH.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {!isCustom && (
            <ZoneExplanation
              className="text-[11px] text-muted-foreground"
              atTime={value.atTime}
              zone={value.timezone}
              days={
                value.frequency === "weekly"
                  ? { daysOfWeek: value.daysOfWeek }
                  : value.frequency === "monthly"
                    ? { dayOfMonth: value.dayOfMonth }
                    : {}
              }
            />
          )}
          {!isCustom && value.frequency === "monthly" && value.dayOfMonth > 28 && (
            <p className="text-[11px] text-muted-foreground">
              {t("create.full.lastDayNote", { day: value.dayOfMonth })}
            </p>
          )}
          {note && (
            <p className="flex items-start gap-1.5 text-[11px] text-warning-text">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              {note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One GFS count. `dimmed` marks a count that is configured but not currently
 *  in force (archiving suspended) — still editable, just visibly inert, rather
 *  than disabled, which would hide what the policy will resume with. */
function GfsInput({
  label,
  value,
  onChange,
  dimmed = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  dimmed?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", dimmed && "opacity-60")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 0)}
        placeholder="0"
      />
    </div>
  );
}
