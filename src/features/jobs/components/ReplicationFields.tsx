// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/* The parts of the job form only a replication job has: the backup job it
 * reads, the restore point the replica starts from, where the replica lives
 * and how its network adapters are connected. The schedule is the backup
 * job's own; retention, full backups and encryption do not apply, since a
 * replication job keeps no backups of its own. */
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Lock } from "@/lib/icons";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";
import { sourceJobProblem, sourcePoints } from "@/lib/replication";
import type { BackupJob, RestorePoint, VM } from "@/types";

/** The select item for "no restore point picked": a select item can't be "". */
const NEWEST = "newest";
/** The select item for "a network of the same name": likewise. */
const SAME_NAME = "same-name";

/* ------------------------------------------------------------- source -- */

/**
 * The backup jobs a replica can be built from. Every backup job is listed, so
 * one that cannot be picked says why rather than being missing: the appliance
 * takes a job that backs up exactly one VM and holds a restore point of it.
 */
export function ReplicationSourcePicker({
  jobs,
  restorePoints,
  vms,
  value,
  onChange,
}: {
  jobs: BackupJob[];
  restorePoints: RestorePoint[];
  vms: VM[];
  value: string;
  onChange: (jobId: string) => void;
}) {
  const { t } = useTranslation("jobs");
  const vmName = new Map(vms.map((v) => [v.id, v.name]));
  const rows = jobs
    .filter((j) => j.type === "backup")
    .map((job) => ({ job, problem: sourceJobProblem(job, restorePoints), points: sourcePoints(job, restorePoints) }))
    // The ones that can be picked first; the rest keep their order below them.
    .sort((a, b) => Number(a.problem !== null) - Number(b.problem !== null));

  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{t("repl.source.noJobs")}</p>;
  return (
    <ul className="divide-y divide-border/60 border border-border" role="radiogroup" aria-label={t("repl.form.source")}>
      {rows.map(({ job, problem, points }) => {
        const checked = job.id === value;
        const newest = points.at(-1);
        const vm = job.vmIds.length === 1 ? (vmName.get(job.vmIds[0]) ?? newest?.vmName ?? job.vmIds[0]) : null;
        return (
          <li key={job.id}>
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={problem !== null}
              onClick={() => onChange(job.id)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                problem === null ? "hover:bg-muted/30" : "cursor-not-allowed opacity-60",
                checked && "bg-primary/[0.06]",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  checked ? "border-primary" : "border-muted-foreground/50",
                )}
                aria-hidden
              >
                {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{job.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {problem
                    ? t(`repl.source.problem.${problem}`, { count: job.vmIds.length })
                    : t("repl.source.detail", {
                        vm,
                        count: points.length,
                        newest: formatDateTime(newest?.createdAt),
                      })}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The restore point the first run builds the replica from: the newest one
 *  when it runs, or one picked here. Later runs always go to the newest. */
export function StartPointSelect({
  job,
  restorePoints,
  value,
  onChange,
}: {
  job: BackupJob;
  restorePoints: RestorePoint[];
  value: string;
  onChange: (pointId: string) => void;
}) {
  const { t } = useTranslation("jobs");
  const points = sourcePoints(job, restorePoints).reverse();
  const known = !value || points.some((p) => p.id === value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="repl-start-point">{t("repl.form.startPoint")}</Label>
      <Select value={value || NEWEST} onValueChange={(v) => onChange(v === NEWEST ? "" : v)}>
        <SelectTrigger id="repl-start-point" className="sm:w-96">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NEWEST}>{t("repl.form.startPointNewest")}</SelectItem>
          {points.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {t("repl.form.startPointOption", {
                when: formatDateTime(p.createdAt),
                type: p.type === "incremental" ? t("runType.incremental") : t("runType.full"),
              })}
            </SelectItem>
          ))}
          {!known && <SelectItem value={value}>{value}</SelectItem>}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        {known ? t("repl.form.startPointHint") : t("repl.form.startPointGone")}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ network -- */

/**
 * Where each network of the source VM goes on the target. A network left as
 * it is goes to the network of the same name, and an adapter whose network
 * has neither a mapping nor a namesake on the host is added disconnected —
 * the appliance warns, and the row says so before the job is saved.
 */
export function NetworkMapFields({
  sourceNetworks,
  targetNetworks,
  value,
  onChange,
  loading,
  hyperv,
}: {
  sourceNetworks: string[];
  /** Names of the networks the target host reaches. */
  targetNetworks: string[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  loading: boolean;
  hyperv: boolean;
}) {
  const { t } = useTranslation("jobs");
  if (loading) return <p className="text-xs text-muted-foreground">{t("repl.network.loading")}</p>;
  if (sourceNetworks.length === 0) return <p className="text-xs text-muted-foreground">{t("repl.network.none")}</p>;
  const reachable = new Set(targetNetworks);
  return (
    <div className="space-y-2">
      {sourceNetworks.map((source) => {
        const target = value[source] ?? "";
        const sameName = reachable.has(source);
        const unknown = target !== "" && !reachable.has(target);
        return (
          <div key={source} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-[8rem] max-w-[14rem] truncate text-sm font-medium" title={source}>
                {source}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Select
                value={target || SAME_NAME}
                onValueChange={(v) => onChange({ ...value, [source]: v === SAME_NAME ? "" : v })}
              >
                <SelectTrigger className="h-9 min-w-0 flex-1 sm:max-w-xs" aria-label={t("repl.network.targetFor", { source })}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SAME_NAME}>{t("repl.network.sameName")}</SelectItem>
                  {targetNetworks.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  {unknown && <SelectItem value={target}>{target}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {target === "" && !sameName && (
              <p className="flex items-start gap-1.5 text-[11px] text-warning-text">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                {t(hyperv ? "repl.network.noNamesakeHyperv" : "repl.network.noNamesake", { source })}
              </p>
            )}
            {unknown && (
              <p className="flex items-start gap-1.5 text-[11px] text-danger">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                {t("repl.errors.network", { source, target })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- locked -- */

/** A setting fixed since the replica was created, shown as it is. */
export function LockedSetting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      <span className="truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}
