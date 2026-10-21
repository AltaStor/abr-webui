// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Loader2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { formatDateTime } from "@/lib/format";
import { confirmSystemClock, getSystemClock } from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import type { SystemClockStatus } from "@/types";

const POLL_MS = 60_000;

function jumpText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  if (days && hours) return `${days} d ${hours} h`;
  if (days) return `${days} d`;
  return `${Math.max(hours, 1)} h`;
}

export function ClockJumpBanner() {
  const { t } = useTranslation("layout");
  const mode = useWorldStore((s) => s.mode);
  const ready = useWorldStore((s) => s.ready);
  const canConfirm = useCan("system.clock_confirm");
  const [status, setStatus] = useState<SystemClockStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const live = mode === "live" && ready;

  const refresh = useCallback(() => {
    getSystemClock()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!live) {
      setStatus(null);
      return;
    }
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [live, refresh]);

  if (!live || !status?.blocked) return null;

  return (
    <>
      <div
        role="alert"
        data-testid="clock-jump-banner"
        className="flex items-start gap-2.5 border-b border-danger/40 bg-danger/10 px-4 py-2.5 text-xs text-danger sm:px-6 lg:px-8"
      >
        <Clock className="mt-px h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          <span className="font-display font-semibold">{t("clockJump.title")}</span>{" "}
          <span className="text-danger/85">{status.message ?? t("clockJump.body")}</span>
        </p>
        {canConfirm && (
          <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => setDialogOpen(true)}>
            {t("clockJump.confirm")}
          </Button>
        )}
      </div>
      <ConfirmClockDialog
        status={status}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirmed={(next) => {
          setStatus(next);
          setDialogOpen(false);
        }}
      />
    </>
  );
}

interface ConfirmClockDialogProps {
  status: SystemClockStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (status: SystemClockStatus) => void;
}

function ConfirmClockDialog({ status, open, onOpenChange, onConfirmed }: ConfirmClockDialogProps) {
  const { t } = useTranslation("layout");
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      const next = await confirmSystemClock();
      toast.success(t("clockJump.dialog.done"));
      onConfirmed(next);
    } catch (error) {
      toast.error(t("clockJump.dialog.failed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const rows: { label: string; value: string }[] = [
    { label: t("clockJump.dialog.serverTime"), value: status.serverTime ? formatDateTime(status.serverTime) : "—" },
    {
      label: t("clockJump.dialog.lastTrusted"),
      value: status.lastTrustedAt ? formatDateTime(status.lastTrustedAt) : "—",
    },
    { label: t("clockJump.dialog.jump"), value: jumpText(status.jumpSeconds) },
    {
      label: t("clockJump.dialog.threshold"),
      value: t("clockJump.dialog.thresholdValue", { count: status.thresholdHours }),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="clock-confirm-dialog">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-danger/10 text-danger">
            <Clock className="h-5 w-5" />
          </div>
          <DialogTitle>{t("clockJump.dialog.title")}</DialogTitle>
          <DialogDescription>{t("clockJump.dialog.lead")}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="nums font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("clockJump.dialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
