// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Clock,
  CopyPlus,
  Database,
  DatabaseBackup,
  Globe,
  HardDriveDownload,
  Layers,
  Play,
  Server,
  Timer,
} from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDuration, formatStorage } from "@/lib/format";
import type { Repository } from "@/types";
import { compressionSpeedFactor } from "../lib";
import { cn } from "@/lib/utils";

/** Present only for backup copy jobs: what they copy, how, and when data may move. */
export interface SummaryCopy {
  /** Every VM of the sources, rather than the ones picked. */
  allVms: boolean;
  mode: string;
  sources: string;
  window: string;
}

/** Present only for replication jobs: what the replica is built from and
 *  where it lives, in place of a repository and a backup window. */
export interface SummaryReplication {
  /** "nightly · sql-01" */
  source: string;
  /** The restore point the first run uses, or that the replica exists. */
  startPoint: string;
  targetEnvName: string;
  targetPlatform: string;
  targetHostName: string;
  datastoreName: string;
  replicaName: string;
}

export interface SummaryData {
  name: string;
  vmCount: number;
  totalSizeGB: number;
  /** Effective MB/s used for the backup-window estimate — measured from recent
   *  real runs when available (see CreateJobPage), so the estimate reflects this
   *  appliance's actual throughput instead of a hardcoded rate. Assumed to have
   *  been measured at BASELINE_COMPRESSION_LEVEL; `compressionLevel` scales it. */
  effectiveMBps: number;
  /** zstd level the job will run at. Compression is inline and CPU-bound, so
   *  the level moves the window: higher = smaller output but slower. */
  compressionLevel: number;
  repository?: Repository;
  scheduleLabel: string;
  retentionLabel: string;
  firstRunLabel: string;
  /** Labels of the active/synthetic full schedules. Backup jobs only. */
  fullBackups?: { active: string; synthetic: string };
  errors: string[];
  /** When set, the panel recaps a replication target instead of a repository. */
  replication?: SummaryReplication;
  /** When set, the panel recaps a backup copy: its sources and copy window
   *  instead of a backup-window estimate, which a copy between repositories
   *  has nothing to measure against. */
  copy?: SummaryCopy;
}

interface Props {
  data: SummaryData;
  editMode: boolean;
  submitting: boolean;
  onCreate: () => void;
  onCreateAndRun: () => void;
}

/** Sticky right-rail: a live recap of the job + estimates + the primary CTA. */
export function JobSummaryPanel({ data, editMode, submitting, onCreate, onCreateAndRun }: Props) {
  const { t } = useTranslation("jobs");
  // Estimate window from the effective throughput measured on recent real runs
  // (falls back to a realistic default before there's any history) — not a
  // hardcoded 500 MB/s, which made a real 1-hour full read as ~15 min.
  //
  // Then scale by the chosen compression level: the mover compresses inline, so
  // the level is a real throughput lever and the window has to respond when the
  // operator drags the slider. Without this the estimate sat frozen at every
  // level, implying compression were free.
  const measured = data.effectiveMBps > 0 ? data.effectiveMBps : 120;
  const rate = measured * compressionSpeedFactor(data.compressionLevel);
  const estSeconds = data.totalSizeGB > 0 && rate > 0 ? (data.totalSizeGB * 1024) / rate : 0;
  const valid = data.errors.length === 0;
  const isReplication = !!data.replication;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted/20 px-4 py-3">
        <p className="label-overline">
          {editMode ? t("summary.reviewChanges") : t("summary.yourNewJob")}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold">{data.name || t("summary.untitled")}</p>
      </div>

      <div className="space-y-3 p-4">
        {data.replication ? (
          <>
            <Row icon={DatabaseBackup} label={t("repl.summary.source")} wrap>
              <span className="font-medium">{data.replication.source || t("common:generic.na")}</span>
            </Row>
            <Row icon={Layers} label={t("repl.summary.startPoint")} wrap>
              <span className="font-medium">{data.replication.startPoint}</span>
            </Row>
          </>
        ) : data.copy ? (
          <>
            <Row icon={HardDriveDownload} label={t("summary.copyFrom")} wrap>
              <span className="font-medium">{data.copy.sources}</span>
            </Row>
            <Row icon={Server} label={t("summary.objects")}>
              <span className="nums font-medium">
                {data.copy.allVms ? t("summary.copyAllVms", { count: data.vmCount }) : data.vmCount}
              </span>
            </Row>
            <Row icon={Layers} label={t("summary.copyMode")}>
              <span className="font-medium">{data.copy.mode}</span>
            </Row>
          </>
        ) : (
          <>
            <Row icon={Server} label={t("summary.objects")}>
              <span className="nums font-medium">{data.vmCount}</span>
              <span className="text-muted-foreground"> · {formatStorage(data.totalSizeGB)}</span>
            </Row>

            <Row icon={Timer} label={t("summary.estBackupWindow")}>
              <span className="nums font-medium">{estSeconds > 0 ? `~${formatDuration(estSeconds)}` : t("common:generic.na")}</span>
            </Row>
          </>
        )}

        <Row icon={Clock} label={t("summary.schedule")} wrap>
          <span className="font-medium">{data.scheduleLabel}</span>
        </Row>

        {data.fullBackups && (
          <>
            <Row icon={DatabaseBackup} label={t("fullSchedule.active")} wrap>
              <span className="font-medium">{data.fullBackups.active}</span>
            </Row>
            <Row icon={Layers} label={t("fullSchedule.synthetic")} wrap>
              <span className="font-medium">{data.fullBackups.synthetic}</span>
            </Row>
          </>
        )}

        {data.copy && (
          <Row icon={Clock} label={t("summary.copyWindow")} wrap>
            <span className="font-medium">{data.copy.window}</span>
          </Row>
        )}

        <Row icon={Play} label={t("summary.firstRun")} wrap>
          <span className="font-medium">{data.firstRunLabel}</span>
        </Row>

        {!isReplication && (
          <Row icon={Layers} label={t("summary.retention")}>
            <span className="font-medium">{data.retentionLabel}</span>
          </Row>
        )}

        {isReplication ? (
          <>
            <Row icon={Globe} label={t("summary.target")}>
              <span className="flex min-w-0 items-center justify-end gap-1.5">
                <span className="truncate font-medium">{data.replication!.targetEnvName || t("common:generic.na")}</span>
                {data.replication!.targetPlatform && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    · {data.replication!.targetPlatform}
                  </span>
                )}
              </span>
            </Row>

            <Row icon={Server} label={t("summary.host")}>
              <span className="truncate font-medium">{data.replication!.targetHostName || t("common:generic.na")}</span>
            </Row>

            <Row icon={Database} label={t("repl.summary.datastore")}>
              <span className="truncate font-medium">{data.replication!.datastoreName || t("common:generic.na")}</span>
            </Row>

            <Row icon={CopyPlus} label={t("summary.replicaName")}>
              <span className="truncate font-medium">{data.replication!.replicaName || t("common:generic.na")}</span>
            </Row>
          </>
        ) : (
          <Row icon={Database} label={t("summary.repository")}>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium">{data.repository?.name ?? t("common:generic.na")}</span>
            </span>
          </Row>
        )}

        {isReplication && (
          /* What the replica is, and what using it takes: no button here
             powers it on, and it must be left alone between runs. */
          <div className="flex items-start gap-2 border border-info/25 bg-info/[0.05] p-2.5 text-xs">
            <CopyPlus className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div className="space-y-1">
              <p className="font-medium text-info">{t("repl.summary.noteTitle")}</p>
              <p className="text-muted-foreground">{t("repl.summary.noteBody")}</p>
            </div>
          </div>
        )}

        {/* Validation */}
        {!valid && (
          <div className="space-y-1 border border-danger/30 bg-danger-subtle/60 p-2.5">
            {data.errors.map((err) => (
              <p key={err} className="flex items-center gap-1.5 text-xs text-danger">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {err}
              </p>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-2 pt-1">
          <Button className="w-full" disabled={!valid || submitting} onClick={onCreate}>
            {editMode ? t("summary.saveChanges") : isReplication ? t("summary.createReplication") : t("summary.createJob")}
          </Button>
          {!editMode && (
            <Button variant="outline" className="w-full" disabled={!valid || submitting} onClick={onCreateAndRun}>
              <Play className="h-4 w-4" />
              {t("summary.createAndRun")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** `wrap`: a value that must be read whole (a time with its zone and the
 *  viewer's equivalent) wraps instead of being cut off. */
function Row({
  icon: Icon,
  label,
  children,
  wrap,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-3 text-sm", wrap ? "items-start" : "items-center")}>
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={cn("min-w-0 text-right", wrap ? "break-words" : "truncate")}>{children}</span>
    </div>
  );
}
