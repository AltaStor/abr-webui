// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { CalendarClock, Hand, RotateCw } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { SESSION_META } from "@/lib/status";
import { formatDuration, formatRelative, formatStorage } from "@/lib/format";
import i18n from "@/i18n";
import type { Session } from "@/types";
import { runKind, runKindIcon, runKindTone } from "../lib";

/** Grid template shared by the header and every row so columns line up. */
export const ROW_GRID =
  "grid grid-cols-[8.5rem_minmax(12rem,1.6fr)_6rem_5.5rem_5rem_5rem_6rem] items-center gap-x-4";

const TRIGGER_META: Record<Session["triggeredBy"], { label: string; icon: typeof Hand }> = {
  schedule: { get label() { return i18n.t("activity:trigger.schedule"); }, icon: CalendarClock },
  manual: { get label() { return i18n.t("activity:trigger.manual"); }, icon: Hand },
  retry: { get label() { return i18n.t("common:actions.retry"); }, icon: RotateCw },
};

export function RunRow({ session: s, onOpen }: { session: Session; onOpen: (sessionId: string) => void }) {
  const { t } = useTranslation("activity");
  const meta = SESSION_META[s.status];
  const running = s.status === "running";
  const trigger = TRIGGER_META[s.triggeredBy];
  const TriggerIcon = trigger.icon;
  const KindIcon = runKindIcon(s);

  // One coherent label so screen readers announce the whole run, not column fragments.
  const ariaLabel = [
    meta.label,
    s.jobName,
    runKind(s),
    trigger.label,
    t("row.aria.started", { time: formatRelative(s.startedAt) }),
    running
      ? t("row.aria.percentComplete", { percent: Math.round(s.progress) })
      : t("row.aria.ranIn", { duration: formatDuration(s.durationSec) }),
    ...(running && s.stageMessage ? [s.stageMessage] : []),
    t("row.aria.objects", { count: s.vmCount }),
    ...(s.transferredGB > 0 ? [t("row.aria.transferred", { size: formatStorage(s.transferredGB, 0) })] : []),
  ].join(", ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      onClick={() => onOpen(s.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(s.id);
        }
      }}
      className={cn(
        "cursor-pointer px-4 py-2.5 text-sm transition-colors hover:bg-muted/40",
        running && "bg-info/[0.035]",
      )}
    >
      <div className={ROW_GRID} aria-hidden="true">
        {/* Status */}
        <div className="min-w-0">
          <StatusPill meta={meta} size="sm" />
        </div>

        {/* Run kind icon + job name + trigger */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              runKindTone(s),
            )}
            title={runKind(s)}
          >
            <KindIcon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <span className="block truncate font-medium" title={s.jobName}>
              {s.jobName}
            </span>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium">{runKind(s)}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1">
                <TriggerIcon className="h-3 w-3" />
                {trigger.label}
              </span>
            </div>
          </div>
        </div>

        {/* Started */}
        <span className="nums truncate text-xs text-muted-foreground" title={s.startedAt}>
          {formatRelative(s.startedAt)}
        </span>

        {/* Duration */}
        <span className="nums text-xs text-muted-foreground">
          {running ? "—" : formatDuration(s.durationSec)}
        </span>

        {/* Objects (VMs) */}
        <span className="nums text-xs text-muted-foreground">{s.vmCount}</span>

        {/* Processed — 0 means untracked (no byte-level telemetry for this run),
            not "nothing moved", so it reads as unknown rather than a false zero. */}
        <span className="nums text-xs text-muted-foreground">
          {s.processedGB > 0 ? formatStorage(s.processedGB, 0) : "—"}
        </span>

        {/* Sent — cumulative transferred VOLUME, for running and finished runs
            alike (matches the READ column and the in-progress card). The live
            rate belongs to the card's meter + this row's progress bar, not this
            data column — showing MB/s here read as "0 sent" while bytes moved. */}
        <span className="nums text-right text-xs text-muted-foreground">
          {s.transferredGB > 0 ? formatStorage(s.transferredGB, 0) : "—"}
        </span>
      </div>

      {/* Inline live progress for running rows */}
      {running && (
        <div className="mt-2" aria-hidden="true">
          <div className="flex items-center gap-2">
            <ProgressBar value={s.progress} tone="info" active size="sm" className="flex-1" label={t("row.progressLabel", { job: s.jobName, kind: runKind(s).toLowerCase() })} />
            <span aria-hidden className="nums w-9 shrink-0 text-right text-[11px] font-semibold text-info">
              {Math.round(s.progress)}%
            </span>
          </div>
          {s.stageMessage && (
            <p className="mt-1 truncate pl-0.5 text-[11px] text-muted-foreground" title={s.stageMessage}>
              {s.stageMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
