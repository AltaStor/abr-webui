// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Check,
  Clock,
  Database,
  DatabaseBackup,
  Layers,
  Lock,
  Minus,
  ShieldCheck,
  Sparkles,
} from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatStorage, usagePercent } from "@/lib/format";
import type { BackupJob, Repository } from "@/types";
import { fullScheduleLabel, retentionLabel, scheduleLabel } from "../lib";

interface Props {
  job: BackupJob;
  repository?: Repository;
  /** Opens the apply-retention dialog; absent for jobs retention doesn't run on. */
  onApplyRetention?: () => void;
}

export function JobSettingsTab({ job, repository, onApplyRetention }: Props) {
  const { t } = useTranslation("jobs");
  const { options, retention, schedule } = job;
  const compressionLabel = t("settings.compressionLevel", { level: options.compression });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {t("settings.scheduleTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <Row icon={Clock} label={t("settings.runs")} value={scheduleLabel(schedule, job.state === "disabled")} />
            {job.type !== "replication" && (
              <>
                <Row
                  icon={DatabaseBackup}
                  label={t("fullSchedule.active")}
                  value={fullScheduleLabel(job.activeFullSchedule)}
                />
                <Row
                  icon={Layers}
                  label={t("fullSchedule.synthetic")}
                  value={fullScheduleLabel(job.syntheticFullSchedule)}
                />
                {/* Only schedules that will fire have a next run: the
                    appliance clears it for a suspended schedule and while the
                    job itself is disabled. */}
                {job.activeFullNextRunAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("fullSchedule.nextActive", { when: formatDateTime(job.activeFullNextRunAt) })}
                  </p>
                )}
                {job.syntheticFullNextRunAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("fullSchedule.nextSynthetic", { when: formatDateTime(job.syntheticFullNextRunAt) })}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Retention */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-muted-foreground" />
              {t("settings.retentionTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <Row icon={Layers} label={t("settings.keep")} value={t("retention.days", { count: retention.keepDays })} />
            {retention.gfs ? (
              <>
                {/* Archiving on/off is its own setting on the appliance, so it
                    is reported as its own row — the counts below stay visible
                    while suspended because that is what resuming restores. */}
                <Row
                  icon={retention.gfs.enabled ? Check : Minus}
                  label={t("settings.gfsProtection")}
                  value={
                    retention.gfs.enabled ? t("settings.gfsActive") : t("settings.gfsSuspended")
                  }
                />
                <Row icon={Sparkles} label={t("settings.gfsWeekly")} value={`${retention.gfs.weekly}`} />
                <Row icon={Sparkles} label={t("settings.gfsMonthly")} value={`${retention.gfs.monthly}`} />
                <Row icon={Sparkles} label={t("settings.gfsYearly")} value={`${retention.gfs.yearly}`} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("settings.noGfs")}</p>
            )}
            <p className="pt-1 text-xs text-muted-foreground">{retentionLabel(retention)}</p>
            {onApplyRetention && (
              <Button variant="outline" size="sm" className="mt-1" onClick={onApplyRetention}>
                {t("actions.applyRetention")}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Destination + options */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-muted-foreground" />
              {t("settings.repositoryTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{repository?.name ?? t("common:generic.na")}</span>
            </div>
            {repository &&
              // Object storage reports no capacity, so there is no ceiling to
              // fill a bar against and no free figure to quote — subtracting
              // from a zero capacity printed "0 MB free of 0 MB" for every S3
              // repository. Say what IS known: how much it holds.
              (repository.capacityGB > 0 ? (
                <>
                  <div className="h-1.5 w-full overflow-hidden bg-muted/70">
                    <div
                      className="h-full bg-primary/70"
                      style={{ width: `${usagePercent(repository.usedGB, repository.capacityGB)}%` }}
                    />
                  </div>
                  <p className="nums text-xs text-muted-foreground">
                    {t("settings.freeOf", {
                      free: formatStorage(repository.capacityGB - repository.usedGB, 0),
                      total: formatStorage(repository.capacityGB, 0),
                    })}
                  </p>
                </>
              ) : (
                <p className="nums text-xs text-muted-foreground">
                  {t("settings.usedElastic", { used: formatStorage(repository.usedGB, 0) })}
                </p>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Processing options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            {t("settings.processingOptions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-0">
          <Toggle on={options.encryption} label={t("settings.encryption")} hint="AES-256" icon={Lock} />
          <Value label={t("settings.compression")} value={compressionLabel} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="nums truncate font-medium">{value}</span>
    </div>
  );
}

function Toggle({
  on,
  label,
  hint,
  icon: Icon,
}: {
  on: boolean;
  label: string;
  hint: string;
  icon?: typeof Lock;
}) {
  const { t } = useTranslation("jobs");
  return (
    <div className={cn("border p-3", on ? "border-success/30 bg-success/[0.04]" : "border-border bg-muted/20")}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {Icon && <Icon className={cn("h-3.5 w-3.5", on ? "text-success" : "text-muted-foreground")} />}
          {label}
        </span>
        {on ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Minus className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{on ? hint : t("state.off")}</p>
    </div>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-muted/20 p-3">
      <span className="text-sm font-medium">{label}</span>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{value}</p>
    </div>
  );
}
