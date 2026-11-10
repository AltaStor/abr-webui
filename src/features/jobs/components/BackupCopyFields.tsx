// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/* The parts of the job form only a backup copy job has: what it copies from,
 * which of the sources' VMs, how it copies, its copy window and its retries.
 * The rest of the form (schedule, full backups, retention, encryption) is the
 * backup job's own, so the two jobs are set up the same way. */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Plus, Repeat, Trash2, Zap } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeField } from "@/components/ui/time-field";
import { cn } from "@/lib/utils";
import { formatDateTime, formatWallClock, isDisplayZone, scheduleZoneName } from "@/lib/time";
import {
  COPY_RETRY_DEFAULTS,
  MAX_COPY_RETRY_COUNT,
  MAX_COPY_RETRY_INTERVAL_MINUTES,
  WEEK_ORDER,
  copyWindowState,
} from "@/lib/backup-copy";
import { REPO_TYPE_META } from "@/features/repositories/components/repoMeta";
import type { BackupJob, CopyMode, CopyWindowRule, NamedRef, Repository, RestorePoint } from "@/types";
import { jobTypeMeta, windowEndLabel } from "../lib";
import { PresetChip, ToggleRow } from "./FormBits";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/* ------------------------------------------------------------- sources -- */

/**
 * The backup jobs and repositories a copy job reads. A job copies its own
 * restore points wherever they are; a repository, every job's in it. A source
 * that is also where the copies go is flagged on its row — the appliance
 * refuses it, and the row is where the operator is looking.
 */
export function CopySourcesPicker({
  jobs,
  repositories,
  restorePoints,
  sourceJobIds,
  sourceRepositoryIds,
  destinationId,
  onChange,
}: {
  /** Jobs that can be a source: backup and backup copy jobs, not this one. */
  jobs: BackupJob[];
  repositories: Repository[];
  restorePoints: RestorePoint[];
  sourceJobIds: string[];
  sourceRepositoryIds: string[];
  destinationId: string;
  onChange: (next: { jobIds: string[]; repositoryIds: string[] }) => void;
}) {
  const { t } = useTranslation("jobs");
  const pointsByJob = useMemo(() => countBy(restorePoints, (p) => p.jobId), [restorePoints]);
  const pointsByRepository = useMemo(() => countBy(restorePoints, (p) => p.repositoryId), [restorePoints]);
  const repositoryName = new Map(repositories.map((r) => [r.id, r.name]));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("copy.sources.jobs")}</legend>
        {jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("copy.sources.noJobs")}</p>
        ) : (
          <ul className="divide-y divide-border/60 border border-border">
            {jobs.map((job) => {
              const { icon: TypeIcon, label } = jobTypeMeta(job.type);
              const checked = sourceJobIds.includes(job.id);
              const clash = checked && !!destinationId && job.repositoryId === destinationId;
              return (
                <li key={job.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/30">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onChange({ jobIds: toggle(sourceJobIds, job.id), repositoryIds: sourceRepositoryIds })}
                      aria-label={t("copy.sources.pickJob", { name: job.name })}
                    />
                    <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={label} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{job.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {t("copy.sources.jobDetail", {
                          repository: repositoryName.get(job.repositoryId) ?? t("common:generic.na"),
                          count: pointsByJob.get(job.id) ?? 0,
                        })}
                      </span>
                    </span>
                    {clash && <ClashMark label={t("copy.sources.jobClash")} />}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("copy.sources.repositories")}</legend>
        <p className="text-[11px] text-muted-foreground">{t("copy.sources.repositoriesHint")}</p>
        <ul className="divide-y divide-border/60 border border-border">
          {repositories.map((repo) => {
            const checked = sourceRepositoryIds.includes(repo.id);
            const clash = checked && repo.id === destinationId;
            return (
              <li key={repo.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/30">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      onChange({ jobIds: sourceJobIds, repositoryIds: toggle(sourceRepositoryIds, repo.id) })
                    }
                    aria-label={t("copy.sources.pickRepository", { name: repo.name })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{repo.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {t("copy.sources.repositoryDetail", {
                        type: REPO_TYPE_META[repo.type].short,
                        count: pointsByRepository.get(repo.id) ?? 0,
                      })}
                    </span>
                  </span>
                  {clash && <ClashMark label={t("copy.sources.repositoryClash")} />}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </div>
  );
}

function ClashMark({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-warning-text">
      <AlertTriangle className="h-3 w-3" />
      {label}
    </span>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/* ----------------------------------------------------------------- VMs -- */

/**
 * Every VM of the sources — including VMs added to them later — or only some.
 * The list is the VMs the sources back up; a VM picked earlier that they no
 * longer hold stays listed, flagged, so it can be taken out rather than
 * silently dropped from the job.
 */
export function CopyVmPicker({
  allVms,
  onAllVms,
  known,
  selected,
  onToggle,
}: {
  allVms: boolean;
  onAllVms: (all: boolean) => void;
  known: NamedRef[];
  selected: Set<string>;
  onToggle: (vmId: string) => void;
}) {
  const { t } = useTranslation("jobs");
  const knownIds = new Set(known.map((vm) => vm.id));
  const gone = [...selected].filter((id) => !knownIds.has(id)).map((id) => ({ id, name: id }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PresetChip
          icon={Repeat}
          label={t("copy.vms.all")}
          sub={t("copy.vms.allSub", { count: known.length })}
          active={allVms}
          onClick={() => onAllVms(true)}
        />
        <PresetChip
          icon={Repeat}
          label={t("copy.vms.some")}
          sub={t("copy.vms.someSub")}
          active={!allVms}
          onClick={() => onAllVms(false)}
        />
      </div>
      {!allVms &&
        (known.length === 0 && gone.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("copy.vms.none")}</p>
        ) : (
          <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto border border-border">
            {[...gone, ...known].map((vm) => {
              const missing = !knownIds.has(vm.id);
              return (
                <li key={vm.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/30">
                    <Checkbox
                      checked={selected.has(vm.id)}
                      onCheckedChange={() => onToggle(vm.id)}
                      aria-label={t("copy.vms.pick", { name: vm.name })}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{vm.name}</span>
                    {missing && <ClashMark label={t("copy.vms.notInSources")} />}
                  </label>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}

/* ---------------------------------------------------------------- mode -- */

/**
 * Periodic or immediate. A job with a schedule cannot become immediate: the
 * appliance refuses a schedule on an immediate copy and has no way to remove
 * one, so the choice is shown locked with the reason rather than offered and
 * then refused on save.
 */
export function CopyModeChoice({
  mode,
  onChange,
  immediateLockedReason,
}: {
  mode: CopyMode;
  onChange: (mode: CopyMode) => void;
  immediateLockedReason?: string;
}) {
  const { t } = useTranslation("jobs");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={t("copy.mode.label")}>
        <PresetChip
          icon={Repeat}
          label={t("copy.mode.periodic")}
          sub={t("copy.mode.periodicSub")}
          active={mode === "periodic"}
          onClick={() => onChange("periodic")}
        />
        <PresetChip
          icon={Zap}
          label={t("copy.mode.immediate")}
          sub={t("copy.mode.immediateSub")}
          active={mode === "immediate"}
          onClick={() => onChange("immediate")}
          disabled={!!immediateLockedReason}
        />
      </div>
      {immediateLockedReason && <p className="text-[11px] text-muted-foreground">{immediateLockedReason}</p>}
    </div>
  );
}

/* --------------------------------------------------------- copy window -- */

/** A new rule: weeknights, 22:00 to 06:00, on the given clock. */
export function newCopyWindowRule(timezone: string): CopyWindowRule {
  return { daysOfWeek: [1, 2, 3, 4, 5], start: "22:00", end: "06:00", timezone };
}

/**
 * The hours copies may move data in. Each rule takes days (Monday first, as
 * the appliance orders them), a start and an end; an end at or before the
 * start runs into the next morning. Below the rules: whether the window is
 * open right now, and until or from when, so a copy sitting in the queue has
 * its explanation next to the setting that causes it.
 */
export function CopyWindowEditor({
  on,
  onToggle,
  rules,
  onChange,
  timezone,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  rules: CopyWindowRule[];
  onChange: (rules: CopyWindowRule[]) => void;
  /** The zone a new rule is read in: the job's. */
  timezone: string;
}) {
  const { t } = useTranslation("jobs");
  const update = (index: number, patch: Partial<CopyWindowRule>) =>
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  // Named only when the rules are read on a clock other than server time.
  const zones = [
    ...new Set(rules.map((r) => r.timezone || timezone).filter((z) => !isDisplayZone(z)).map(scheduleZoneName)),
  ];
  const state = on && rules.length ? copyWindowState(rules) : null;
  /** What a rule's hours mean: the same day, past midnight, the whole day,
   *  or no window at all. */
  const ruleNote = (rule: CopyWindowRule) => {
    if (rule.start === rule.end) return rule.start === "00:00" ? t("copy.window.wholeDay") : t("copy.window.sameTime");
    return rule.end !== "00:00" && rule.end < rule.start
      ? t("copy.window.pastMidnight", { start: formatWallClock(rule.start), end: formatWallClock(rule.end) })
      : t("copy.window.sameDay", { start: formatWallClock(rule.start), end: windowEndLabel(rule.end) });
  };

  return (
    <div className="space-y-3">
      <ToggleRow
        label={t("copy.window.toggle")}
        hint={on ? t("copy.window.toggleOn") : t("copy.window.toggleOff")}
        help={t("copy.window.help")}
        helpTerm={t("copy.window.term")}
        checked={on}
        onChange={(next) => {
          onToggle(next);
          if (next && rules.length === 0) onChange([newCopyWindowRule(timezone)]);
        }}
      />
      {on && (
        <div className="space-y-2">
          {rules.map((rule, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3 border border-border bg-muted/20 p-3" data-testid="copy-window-rule">
              <div className="space-y-1.5">
                <Label>{t("copy.window.days")}</Label>
                <div className="flex flex-wrap gap-1">
                  {WEEK_ORDER.map((d) => {
                    const pressed = rule.daysOfWeek.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          update(index, {
                            daysOfWeek: pressed ? rule.daysOfWeek.filter((x) => x !== d) : [...rule.daysOfWeek, d],
                          })
                        }
                        className={cn(
                          "h-9 w-10 border font-display text-xs font-medium transition-colors",
                          pressed
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        aria-pressed={pressed}
                      >
                        {t(`days.short.${DAY_KEYS[d]}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`copy-window-${index}-start`}>{t("copy.window.from")}</Label>
                <TimeField
                  id={`copy-window-${index}-start`}
                  value={rule.start}
                  onChange={(v) => update(index, { start: v })}
                  className="w-28"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`copy-window-${index}-end`}>{t("copy.window.to")}</Label>
                <TimeField
                  id={`copy-window-${index}-end`}
                  value={rule.end}
                  onChange={(v) => update(index, { end: v })}
                  className="w-28"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mb-1 text-muted-foreground hover:text-danger"
                aria-label={t("copy.window.remove")}
                onClick={() => onChange(rules.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <p className="basis-full text-[11px] text-muted-foreground">{ruleNote(rule)}</p>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, newCopyWindowRule(timezone)])}>
            <Plus className="h-3.5 w-3.5" />
            {t("copy.window.add")}
          </Button>
          {rules.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {zones.length > 0 && <>{t("copy.window.zone", { zone: zones.join(", ") })} </>}
              {state &&
                (state.open
                  ? state.closesAt
                    ? t("copy.window.openUntil", { when: formatDateTime(state.closesAt, { weekday: true }) })
                    : null
                  : state.opensAt
                    ? t("copy.window.closedUntil", { when: formatDateTime(state.opensAt, { weekday: true }) })
                    : t("copy.window.neverOpens"))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The problem with a rule the appliance would refuse, or null. */
export function copyWindowRuleProblem(rule: CopyWindowRule): "days" | "sameTime" | null {
  if (!rule.daysOfWeek.length) return "days";
  if (rule.start === rule.end && rule.start !== "00:00") return "sameTime";
  return null;
}

/* ------------------------------------------------------------- retries -- */

/** How often a VM whose copy failed is tried again within the session, and
 *  how long apart. A stop and a configuration error are never retried. */
export function CopyRetryFields({
  count,
  intervalMinutes,
  mode,
  onChange,
}: {
  count: number;
  intervalMinutes: number;
  mode: CopyMode;
  onChange: (next: { count: number; intervalMinutes: number }) => void;
}) {
  const { t } = useTranslation("jobs");
  const whole = (raw: string, max: number) => {
    const value = Math.trunc(Number(raw));
    return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
  };
  const defaults = COPY_RETRY_DEFAULTS[mode];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="copy-retry-count">{t("copy.retry.count")}</Label>
          <Input
            id="copy-retry-count"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_COPY_RETRY_COUNT}
            step={1}
            value={count}
            onChange={(e) => onChange({ count: whole(e.target.value, MAX_COPY_RETRY_COUNT), intervalMinutes })}
            className="w-24"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="copy-retry-interval">{t("copy.retry.interval")}</Label>
          <Input
            id="copy-retry-interval"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_COPY_RETRY_INTERVAL_MINUTES}
            step={1}
            value={intervalMinutes}
            onChange={(e) =>
              onChange({ count, intervalMinutes: whole(e.target.value, MAX_COPY_RETRY_INTERVAL_MINUTES) })
            }
            className="w-24"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {count === 0
          ? t("copy.retry.none")
          : intervalMinutes === 0
            ? t("copy.retry.rightAway", { count })
            : t("copy.retry.apart", { count, minutes: intervalMinutes })}{" "}
        {t("copy.retry.defaults", { count: defaults.count, minutes: defaults.intervalMinutes })}
      </p>
    </div>
  );
}
