// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Clock,
  CopyPlus,
  Database,
  Globe,
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

/** Present only for replication jobs; drives the target-host recap on the right rail. */
export interface SummaryReplication {
  targetEnvName: string;
  targetPlatform: string;
  targetHostName: string;
  replicaNameExample: string;
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
  errors: string[];
  /** When set, the panel recaps a replication target instead of a repository. */
  replication?: SummaryReplication;
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
      <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {editMode ? t("summary.reviewChanges") : t("summary.yourNewJob")}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold">{data.name || t("summary.untitled")}</p>
      </div>

      <div className="space-y-3 p-4">
        <Row icon={Server} label={t("summary.objects")}>
          <span className="nums font-medium">{data.vmCount}</span>
          <span className="text-muted-foreground"> · {formatStorage(data.totalSizeGB)}</span>
        </Row>

        <Row icon={Timer} label={isReplication ? t("summary.estSeedWindow") : t("summary.estBackupWindow")}>
          <span className="nums font-medium">{estSeconds > 0 ? `~${formatDuration(estSeconds)}` : t("common:generic.na")}</span>
        </Row>

        <Row icon={Clock} label={t("summary.schedule")}>
          <span className="font-medium">{data.scheduleLabel}</span>
        </Row>

        <Row icon={Play} label={t("summary.firstRun")}>
          <span className="font-medium">{data.firstRunLabel}</span>
        </Row>

        <Row icon={Layers} label={t("summary.retention")}>
          <span className="font-medium">{data.retentionLabel}</span>
        </Row>

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
              <span className="truncate font-medium">{data.replication!.targetHostName}</span>
            </Row>

            <Row icon={CopyPlus} label={t("summary.replicaName")}>
              <span className="truncate font-medium">{data.replication!.replicaNameExample}</span>
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
          /* DR reassurance — a warm replica, ready to fail over */
          <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/[0.05] p-2.5 text-xs">
            <CopyPlus className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div className="space-y-1">
              <p className="font-medium text-info">{t("summary.readyToFailOver")}</p>
              <p className="text-muted-foreground">
                {t("summary.readyToFailOverBody")}
              </p>
            </div>
          </div>
        )}

        {/* Validation */}
        {!valid && (
          <div className="space-y-1 rounded-lg border border-danger/30 bg-danger-subtle/60 p-2.5">
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

function Row({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}
