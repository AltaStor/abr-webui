// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, XCircle } from "@/lib/icons";
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
import { useWorldStore } from "@/store/world";
import type { Session } from "@/types";

interface CancelRunDialogProps {
  /** The run to stop. `null` keeps the dialog closed — convenient for callers
   *  that track "which row is being cancelled" as one piece of state. */
  session: Session | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation for stopping one in-flight run (POST /sessions/{id}/stop).
 *
 * Confirmed, because there is no undo: the appliance unwinds the engine and the
 * run ends where it stood, so restarting means reading everything again. It is
 * NOT destructive, though — existing restore points are untouched, which the
 * body says outright so nobody reads "cancel" as "delete my backups".
 *
 * Owns the request and both toasts, so every surface that can stop a run says
 * the same thing about it.
 */
export function CancelRunDialog({ session, open, onOpenChange }: CancelRunDialogProps) {
  const { t } = useTranslation("common");
  const stopSession = useWorldStore((s) => s.stopSession);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!session) return;
    setSubmitting(true);
    const ok = await stopSession(session.id);
    setSubmitting(false);
    onOpenChange(false);
    if (ok) {
      toast.success(t("cancelRun.toast.requested.title"), {
        description: t("cancelRun.toast.requested.description", { job: session.jobName }),
      });
    } else {
      toast.error(t("cancelRun.toast.failed.title"), {
        description: t("cancelRun.toast.failed.description", { job: session.jobName }),
      });
    }
  }

  return (
    <Dialog open={open && session !== null} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-warning-subtle text-warning">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{t("cancelRun.confirm.title")}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="cancelRun.confirm.lead"
              ns="common"
              values={{ job: session?.jobName ?? "" }}
              components={{ 1: <span className="font-medium text-foreground" /> }}
            />{" "}
            {t("cancelRun.confirm.body")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t("cancelRun.confirm.keepRunning")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? t("cancelRun.confirm.stopping") : t("cancelRun.confirm.stop")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CancelRunButtonProps {
  session: Session;
  variant?: "outline" | "ghost" | "subtle";
  size?: "sm" | "default";
  className?: string;
}

/**
 * "Cancel run", wherever a live run is on screen.
 *
 * A stop is a request, not a kill. Once the appliance has taken it the session
 * is "stopping" and the button says so rather than inviting a second click at a
 * run that is already winding down.
 */
export function CancelRunButton({
  session,
  variant = "outline",
  size = "sm",
  className,
}: CancelRunButtonProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const stopping = Boolean(session.stopping);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={stopping}
        aria-label={t("cancelRun.aria", { job: session.jobName })}
        onClick={(e) => {
          // These buttons sit inside clickable rows and cards.
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <XCircle className="h-4 w-4" />
        {stopping ? t("cancelRun.stopping") : t("cancelRun.action")}
      </Button>
      <CancelRunDialog session={session} open={open} onOpenChange={setOpen} />
    </>
  );
}
