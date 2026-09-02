// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { AlertTriangle, Loader2, Trash2 } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useWorldStore } from "@/store/world";
import type { BlockingJobRef } from "@/store/world.types";
import type { Environment } from "@/types";

interface DeleteEnvironmentDialogProps {
  environment: Environment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation for removing a registered hypervisor environment. The
 * orchestrator is the authority: it refuses (409) while a job still targets
 * the environment — surfaced here by name, not just a count, alongside a
 * proactive client-side estimate (via each job's VM scope) shown before the
 * operator even attempts to delete.
 */
export function DeleteEnvironmentDialog({ environment, open, onOpenChange }: DeleteEnvironmentDialogProps) {
  const { t } = useTranslation("inventory");
  const deleteEnvironment = useWorldStore((s) => s.deleteEnvironment);
  const jobs = useWorldStore((s) => s.jobs);
  const vms = useWorldStore((s) => s.vms);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockingJobs, setBlockingJobs] = useState<BlockingJobRef[] | null>(null);

  useEffect(() => {
    if (open) {
      setDeleting(false);
      setError(null);
      setBlockingJobs(null);
    }
  }, [open, environment?.id]);

  const referencingJobs = useMemo(() => {
    if (!environment) return [];
    const envVmIds = new Set(vms.filter((v) => v.environmentId === environment.id).map((v) => v.id));
    return jobs.filter((j) => j.vmIds.some((vmId) => envVmIds.has(vmId)));
  }, [environment, jobs, vms]);

  if (!environment) return null;

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    setBlockingJobs(null);
    try {
      const res = await deleteEnvironment(environment.id);
      if (res.ok) {
        toast.success(t("removeEnvironment.toast.removed.title"), {
          description: t("removeEnvironment.toast.removed.description", { name: environment.name }),
        });
        onOpenChange(false);
        return;
      }
      if (res.reason === "jobs") {
        setBlockingJobs(res.jobs);
      } else {
        setError(res.message);
      }
    } catch {
      setError(t("removeEnvironment.toast.failed.description"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (deleting ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-danger-subtle text-danger">
            <Trash2 className="h-5 w-5" />
          </div>
          <DialogTitle>{t("removeEnvironment.title", { name: environment.name })}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="removeEnvironment.description"
              ns="inventory"
              values={{ hosts: environment.hostCount, vms: environment.vmCount }}
              components={{ 1: <span className="font-medium text-foreground" /> }}
            />
          </DialogDescription>
        </DialogHeader>

        {blockingJobs && blockingJobs.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="space-y-1 text-xs text-danger">
              <Trans
                i18nKey="removeEnvironment.jobsBlock"
                ns="inventory"
                count={blockingJobs.length}
                values={{ count: blockingJobs.length }}
                components={{ 1: <span className="nums font-semibold" /> }}
              />
              <ul className="list-inside list-disc space-y-0.5">
                {blockingJobs.map((job) => (
                  <li key={job.id} className="font-medium">
                    {job.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {!blockingJobs && referencingJobs.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
            <div className="space-y-1 text-xs text-warning-text">
              <Trans
                i18nKey="removeEnvironment.jobsWarning"
                ns="inventory"
                count={referencingJobs.length}
                values={{ count: referencingJobs.length }}
                components={{ 1: <span className="nums font-semibold" /> }}
              />
              <ul className="list-inside list-disc space-y-0.5">
                {referencingJobs.map((job) => (
                  <li key={job.id} className="font-medium">
                    {job.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" disabled={deleting} onClick={() => void handleConfirm()}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleting ? t("removeEnvironment.removing") : t("removeEnvironment.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
