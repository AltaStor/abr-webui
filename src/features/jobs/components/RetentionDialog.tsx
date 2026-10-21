// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Clock, Layers, Loader2, Lock, ShieldCheck } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { formatDateTime } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { BackupJob, RetentionChainReport, RetentionRunResult } from "@/types";
import { retentionLabel } from "../lib";

interface RetentionDialogProps {
  job: BackupJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Apply a backup job's retention now.
 *
 * The appliance already applies retention after every backup, to that
 * backup's chain; this is the operator's "now" across every chain the job
 * wrote, and it always previews first: the dialog opens on a dry run, so what
 * the button will remove is on screen before it can be pressed. The preview
 * and the real pass are the same call (`POST /jobs/{id}/retention`), so they
 * cannot disagree about the rule.
 */
export function RetentionDialog({ job, open, onOpenChange }: RetentionDialogProps) {
  const { t } = useTranslation("jobs");
  const runRetention = useWorldStore((s) => s.runRetention);
  const [preview, setPreview] = useState<RetentionRunResult | null>(null);
  const [applied, setApplied] = useState<RetentionRunResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setApplied(null);
    setBusy(true);
    void runRetention(job.id, true).then((result) => {
      if (cancelled) return;
      setPreview(result);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, job.id, runRetention]);

  const shown = applied ?? preview;
  const removable = preview?.ok ? preview.summary.removed : 0;
  const clockBlocked = preview?.ok ? preview.clockBlocked : null;

  async function handleApply() {
    setBusy(true);
    const result = await runRetention(job.id, false);
    setBusy(false);
    setApplied(result);
    if (!result.ok) {
      toast.error(t("retentionRun.toast.failed", { name: job.name }), { description: result.message });
    } else if (result.summary.failed > 0) {
      toast.error(t("retentionRun.toast.partial", { name: job.name, count: result.summary.failed }));
    } else {
      toast.success(t("retentionRun.toast.done", { name: job.name, count: result.summary.removed }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <DialogTitle>{t("retentionRun.title")}</DialogTitle>
          <DialogDescription>
            {t("retentionRun.lead", { policy: retentionLabel(job.retention) })}
          </DialogDescription>
        </DialogHeader>

        {busy && !shown ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("retentionRun.checking")}
          </p>
        ) : shown && !shown.ok ? (
          <p className="flex items-start gap-2 py-4 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {shown.message}
          </p>
        ) : shown ? (
          <>
            {clockBlocked && (
              <p
                role="alert"
                data-testid="retention-clock-blocked"
                className="flex items-start gap-2 border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning-text"
              >
                <Clock className="mt-px h-4 w-4 shrink-0" />
                {t("retentionRun.clockBlocked")}
              </p>
            )}
            <RetentionReport result={shown} />
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {applied ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
          {!applied && (
            <Button variant="destructive" onClick={handleApply} disabled={busy || removable === 0 || Boolean(clockBlocked)}>
              {busy && preview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {clockBlocked
                ? t("retentionRun.blockedByClock")
                : removable === 0
                  ? t("retentionRun.nothingToRemove")
                  : t("retentionRun.apply", { count: removable })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RetentionReport({ result }: { result: RetentionRunResult }) {
  const { t } = useTranslation("jobs");
  const { summary } = result;
  const headline =
    summary.removed === 0 && summary.keptMinFulls > 0
      ? t("retentionRun.keptAll", { count: summary.keptMinFulls, total: summary.points })
      : result.dryRun
        ? summary.removed === 0
          ? t("retentionRun.previewNone", { count: summary.points })
          : t("retentionRun.previewSome", { count: summary.removed, total: summary.points })
        : t("retentionRun.doneSome", { count: summary.removed, total: summary.points });

  if (result.chains.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{t("retentionRun.noPoints")}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm">
        {result.dryRun ? null : summary.failed > 0 ? (
          <AlertTriangle className="h-4 w-4 text-danger" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        {headline}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("retentionRun.col.vm")}</TableHead>
            <TableHead>{t("retentionRun.col.repository")}</TableHead>
            <TableHead className="text-right">{t("retentionRun.col.points")}</TableHead>
            <TableHead className="text-right">
              {result.dryRun ? t("retentionRun.col.willRemove") : t("retentionRun.col.removed")}
            </TableHead>
            <TableHead>{t("retentionRun.col.note")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.chains.map((chain) => (
            <TableRow key={`${chain.vmId}:${chain.repositoryId}`}>
              <TableCell className="font-medium">{chain.vmName ?? chain.vmId}</TableCell>
              <TableCell>{chain.repositoryName ?? chain.repositoryId ?? "—"}</TableCell>
              <TableCell className="nums text-right">{chain.points}</TableCell>
              <TableCell className="nums text-right">{chain.removed.length}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <ChainNote chain={chain} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {summary.held > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("retentionRun.heldExplained")}
        </p>
      )}
      {summary.keptMinFulls > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("retentionRun.keptMinFullsExplained")}
        </p>
      )}
    </div>
  );
}

function ChainNote({ chain }: { chain: RetentionChainReport }) {
  const { t } = useTranslation("jobs");
  const notes: string[] = [];
  if (chain.skippedReason && chain.skippedReason !== chain.clockBlocked) {
    notes.push(t("retentionRun.note.skipped", { reason: chain.skippedReason }));
  }
  if (chain.held.length > 0) {
    const until = chain.held.map((item) => item.until).sort().at(-1) ?? "";
    notes.push(
      t("retentionRun.note.held", {
        count: chain.held.length + chain.keptForChain.length,
        until: until ? formatDateTime(until) : "—",
      }),
    );
  }
  if (chain.keptMinFulls.length > 0) {
    notes.push(t("retentionRun.note.keptMinFulls", { count: chain.keptMinFulls.length }));
  }
  if (chain.failed.length > 0) notes.push(t("retentionRun.note.failed", { count: chain.failed.length }));
  return <>{notes.length ? notes.join(" · ") : "—"}</>;
}
