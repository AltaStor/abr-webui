// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { AlertTriangle, Trash2 } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useWorldStore } from "@/store/world";
import type { RepoDeleteResult } from "@/store/world.types";
import type { BackupJob, Repository } from "@/types";

interface DeleteRepositoryDialogProps {
  repo: Repository | null;
  /** All jobs from the world store; ones targeting the repo trigger a warning. */
  jobs: BackupJob[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Guarded, type-to-confirm repository deletion. The world store's
 * `deleteRepository` is the authoritative check and drives the final outcome
 * (jobs / error / ok).
 */
export function DeleteRepositoryDialog({
  repo,
  jobs,
  open,
  onOpenChange,
}: DeleteRepositoryDialogProps) {
  const { t } = useTranslation("repositories");
  const deleteRepository = useWorldStore((s) => s.deleteRepository);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  // A server-returned refusal (authoritative) that the panel below reflects.
  const [block, setBlock] = useState<Extract<RepoDeleteResult, { reason: "jobs" }> | null>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setDeleting(false);
      setBlock(null);
    }
  }, [open, repo?.id]);

  const referencingJobs = useMemo(() => {
    if (!repo) return [];
    return jobs.filter((j) => j.repositoryId === repo.id);
  }, [repo, jobs]);

  if (!repo) return null;

  // A server "jobs" refusal blocks deletion until the operator repoints them.
  const jobsBlock = block?.reason === "jobs" ? block : null;
  const confirmed = typed.trim() === repo.name;

  const handleConfirm = async () => {
    if (!confirmed || deleting) return;
    setDeleting(true);
    try {
      const res = await deleteRepository(repo.id);
      if (res.ok) {
        toast.success(t("delete.toast.deleted.title"), {
          description: t("delete.toast.deleted.description", { name: repo.name }),
        });
        onOpenChange(false);
        return;
      }
      if (res.reason === "jobs") {
        setBlock(res);
      } else {
        toast.error(t("delete.toast.failed.title"), { description: res.message });
      }
    } catch {
      toast.error(t("delete.toast.failed.title"), {
        description: t("delete.toast.failed.description", { name: repo.name }),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-danger-subtle text-danger">
            <Trash2 className="h-5 w-5" />
          </div>
          <DialogTitle>{t("delete.title", { name: repo.name })}</DialogTitle>
          <DialogDescription>{t("delete.description")}</DialogDescription>
        </DialogHeader>

        {jobsBlock && (
          <div className="flex items-start gap-2.5 border border-danger/30 bg-danger-subtle px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="space-y-1 text-xs text-danger">
              <Trans
                i18nKey="delete.jobsBlock"
                ns="repositories"
                count={jobsBlock.jobs.length}
                values={{ count: jobsBlock.jobs.length }}
                components={{ 1: <span className="nums font-semibold" /> }}
              />
              <ul className="list-inside list-disc space-y-0.5">
                {jobsBlock.jobs.map((job) => (
                  <li key={job.id} className="font-medium">
                    {job.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {!jobsBlock && referencingJobs.length > 0 && (
          <div className="flex items-start gap-2.5 border border-warning/30 bg-warning-subtle px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
            <div className="space-y-1 text-xs text-warning-text">
              <Trans
                i18nKey="delete.jobsWarning"
                ns="repositories"
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

        <div className="space-y-1.5">
          <Label htmlFor="delete-repo-confirm">
            <Trans
              i18nKey="delete.typeToConfirm"
              ns="repositories"
              values={{ name: repo.name }}
              components={{ 1: <span className="font-semibold text-foreground" /> }}
            >
              Type <span className="font-semibold text-foreground">{repo.name}</span> to confirm
            </Trans>
          </Label>
          <Input
            id="delete-repo-confirm"
            className={cn(confirmed && "border-success")}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={repo.name}
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleConfirm();
              }
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!confirmed || deleting}
            onClick={() => void handleConfirm()}
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? t("delete.deleting") : t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
