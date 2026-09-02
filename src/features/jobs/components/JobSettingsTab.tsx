// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Check,
  Clock,
  Database,
  Layers,
  Lock,
  Minus,
  ShieldCheck,
  Sparkles,
} from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatStorage, usagePercent } from "@/lib/format";
import type { BackupJob, Repository } from "@/types";
import { retentionLabel, scheduleLabel } from "../lib";

interface Props {
  job: BackupJob;
  repository?: Repository;
}

/** Read-only view of the job's configuration. Editing lives on the one Edit
 *  action in the page header -- this tab used to carry a second entry point to
 *  the same wizard, which read as two different actions. */
export function JobSettingsTab({ job, repository }: Props) {
  const { t } = useTranslation("jobs");
  const { options, retention, schedule } = job;
  const compressionLabel = t("settings.compressionLevel", { level: options.compression });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("settings.summary")}</p>

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
          </CardContent>
        </Card>

        {/* Retention */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                {t("settings.retentionTitle")}
              </span>
              {retention.gfs && retention.gfs.enabled === false && (
                <Badge variant="warning">{t("settings.gfsSuspended")}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <Row icon={Layers} label={t("settings.keep")} value={t("retention.days", { count: retention.keepDays })} />
            {retention.gfs ? (
              <>
                <Row icon={Sparkles} label={t("settings.gfsWeekly")} value={`${retention.gfs.weekly}`} />
                <Row icon={Sparkles} label={t("settings.gfsMonthly")} value={`${retention.gfs.monthly}`} />
                <Row icon={Sparkles} label={t("settings.gfsYearly")} value={`${retention.gfs.yearly}`} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("settings.noGfs")}</p>
            )}
            <p className="pt-1 text-xs text-muted-foreground">{retentionLabel(retention)}</p>
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
            {repository && (
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
            )}
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
    <div className={cn("rounded-lg border p-3", on ? "border-success/30 bg-success/[0.04]" : "border-border/70 bg-muted/20")}>
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
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <span className="text-sm font-medium">{label}</span>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{value}</p>
    </div>
  );
}
