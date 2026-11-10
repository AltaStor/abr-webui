// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/* What a replication job's page shows about it: where the replica comes from
 * and lives, the restore point it is at, when it was last brought up to date,
 * and what is waiting for the next run. */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  ChevronsRight,
  Clock,
  CopyPlus,
  Database,
  DatabaseBackup,
  Globe,
  Network,
  Pencil,
  Server,
} from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatFullDateTime, formatRelative } from "@/lib/format";
import { utcTitle } from "@/lib/time";
import { useWorldStore } from "@/store/world";
import type { ReplicationSettings } from "@/types";
import { TRIGGER_META } from "@/features/activity/lib";

function networkMapLabel(r: ReplicationSettings, sameNames: string): string {
  return r.networkMap.length ? r.networkMap.map((m) => `${m.source} → ${m.target}`).join(", ") : sameNames;
}

/** "after-source" → "After the source backup"; anything else as it came. */
function triggerLabel(trigger: string | null): string | null {
  if (!trigger) return null;
  return trigger in TRIGGER_META ? TRIGGER_META[trigger as keyof typeof TRIGGER_META].label : trigger;
}

/** The rows of the Overview's "About" card for a replication job. */
export function ReplicationAbout({ replication: r }: { replication: ReplicationSettings }) {
  const { t } = useTranslation("jobs");
  const na = t("common:generic.na");
  return (
    <>
      <Row label={t("repl.about.sourceJob")} value={r.sourceJob?.name ?? na} />
      <Row label={t("repl.about.sourceVm")} value={r.sourceVm?.name ?? na} />
      <Row label={t("repl.about.target")} value={[r.targetEnvironment?.name, r.targetHost].filter(Boolean).join(" · ") || na} />
      <Row label={t("repl.about.datastore")} value={r.targetDatastore ?? na} />
      <Row label={t("repl.form.networks")} value={networkMapLabel(r, t("repl.network.sameNames"))} />
      <Row label={t("repl.about.replica")} value={r.replica.vmId ? (r.replica.vmName ?? r.replicaName) : t("repl.stats.notCreated")} />
      <Row
        label={t("repl.about.replicaPoint")}
        value={r.replica.pointCreatedAt ? formatDateTime(r.replica.pointCreatedAt) : na}
        title={utcTitle(r.replica.pointCreatedAt)}
      />
      <Row
        label={t("repl.about.lastUpdate")}
        value={r.replica.lastSuccessAt ? formatDateTime(r.replica.lastSuccessAt) : t("repl.stats.never")}
        title={utcTitle(r.replica.lastSuccessAt)}
      />
    </>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-medium" title={title ?? value}>
        {value}
      </span>
    </div>
  );
}

/**
 * What waits for the next run: a run requested while one was going (it starts
 * when that one ends), and a new replica name (the next run renames the VM).
 */
export function ReplicationPendingNotes({ replication: r }: { replication: ReplicationSettings }) {
  const { t } = useTranslation("jobs");
  const pendingTrigger = triggerLabel(r.pendingRun?.trigger ?? null);
  return (
    <>
      {r.pendingRun && (
        <div className="flex items-start gap-2.5 border border-info/30 bg-info/[0.06] px-3 py-2.5" role="status">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p className="text-xs text-foreground" title={utcTitle(r.pendingRun.since)}>
            {pendingTrigger && r.pendingRun.since
              ? t("repl.pending.run", { trigger: pendingTrigger, since: formatRelative(r.pendingRun.since) })
              : t("repl.pending.runPlain")}
          </p>
        </div>
      )}
      {r.replica.pendingName && (
        <div className="flex items-start gap-2.5 border border-info/30 bg-info/[0.06] px-3 py-2.5" role="status">
          <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p className="text-xs text-foreground">
            {t("repl.pending.rename", { from: r.replica.vmName ?? r.replicaName, to: r.replica.pendingName })}
          </p>
        </div>
      )}
    </>
  );
}

/** The Settings tab's card for a replication job, in place of retention and a
 *  repository, which it has none of. */
export function ReplicationSettingsCard({ replication: r }: { replication: ReplicationSettings }) {
  const { t } = useTranslation("jobs");
  const jobs = useWorldStore((s) => s.jobs);
  const jobIds = new Set(jobs.map((j) => j.id));
  const na = t("common:generic.na");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CopyPlus className="h-4 w-4 text-muted-foreground" />
          {t("repl.settings.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2.5 pt-0 text-sm md:grid-cols-2">
        <div className="space-y-2.5">
          <SettingRow icon={DatabaseBackup} label={t("repl.about.sourceJob")}>
            {r.sourceJob && jobIds.has(r.sourceJob.id) ? (
              <Link to={`/jobs/${r.sourceJob.id}`} className="font-medium hover:underline">
                {r.sourceJob.name}
              </Link>
            ) : (
              <span className="font-medium">{r.sourceJob?.name ?? na}</span>
            )}
          </SettingRow>
          <SettingRow icon={Server} label={t("repl.about.sourceVm")}>
            <span className="font-medium">{r.sourceVm?.name ?? na}</span>
          </SettingRow>
          <SettingRow icon={ChevronsRight} label={t("repl.settings.afterSource")}>
            <span className="font-medium">{r.runAfterSource ? t("state.on") : t("state.off")}</span>
          </SettingRow>
          <SettingRow icon={CalendarClock} label={t("repl.settings.startPoint")}>
            <span className="font-medium">
              {r.replica.vmId
                ? t("repl.settings.startPointUsed")
                : r.startPointId
                  ? r.startPointId
                  : t("repl.summary.newestPoint")}
            </span>
          </SettingRow>
        </div>
        <div className="space-y-2.5">
          <SettingRow icon={Globe} label={t("repl.about.target")}>
            <span className="font-medium">{r.targetEnvironment?.name ?? na}</span>
          </SettingRow>
          <SettingRow icon={Server} label={t("summary.host")}>
            <span className="font-medium">{r.targetHost ?? na}</span>
          </SettingRow>
          <SettingRow icon={Database} label={t("repl.about.datastore")}>
            <span className="font-medium">{r.targetDatastore ?? na}</span>
          </SettingRow>
          <SettingRow icon={Network} label={t("repl.form.networks")}>
            <span className="font-medium">{networkMapLabel(r, t("repl.network.sameNames"))}</span>
          </SettingRow>
          <SettingRow icon={CopyPlus} label={t("repl.about.replica")}>
            <span className="font-medium" title={r.replica.lastSuccessAt ? formatFullDateTime(r.replica.lastSuccessAt) : undefined}>
              {r.replica.vmId ? (r.replica.vmName ?? r.replicaName) : t("repl.settings.notCreatedNamed", { name: r.replicaName })}
            </span>
          </SettingRow>
        </div>
        {r.replica.vmId && <p className="text-xs text-muted-foreground md:col-span-2">{t("repl.form.lockedNote")}</p>}
      </CardContent>
    </Card>
  );
}

function SettingRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}
