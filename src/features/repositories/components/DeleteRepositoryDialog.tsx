// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  /** All jobs from the world store; one that targets the repo blocks the delete. */
  jobs: BackupJob[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Guarded, type-to-confirm repository deletion.
 *
 * The appliance refuses to delete a repository that a job still targets or
 * that still stores restore points, and says so in advance (`can_delete`,
 * mapped to `repo.deleteBlock`). Such a repository gets the reason and the
 * jobs up front and no confirm at all, instead of a confirm that can only
 * fail. The store's `deleteRepository` stays the authority: a refusal that
 * arrives anyway (a job created meanwhile) lands in the same panels.
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
  // A server-returned refusal (authoritative) that the panels below reflect.
  const [block, setBlock] = useState<Extract<RepoDeleteResult, { reason: "jobs" | "backups" }> | null>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setDeleting(false);
      setBlock(null);
    }
  }, [open, repo?.id]);

  // The jobs the appliance named, plus any the console knows of that target
  // the repository (one created since the repository list was read).
  const referencingJobs = useMemo(() => {
    if (!repo) return [];
    const byId = new Map<string, { id: string; name: string }>();
    for (const job of repo.deleteBlock?.jobs ?? []) byId.set(job.id, job);
    for (const job of jobs) if (job.repositoryId === repo.id) byId.set(job.id, { id: job.id, name: job.name });
    return [...byId.values()];
  }, [repo, jobs]);

  if (!repo) return null;

  const blockingJobs = block?.reason === "jobs" ? block.jobs : referencingJobs;
  const storedPoints =
    block?.reason === "backups" ? block.restorePointCount : (repo.deleteBlock?.restorePointCount ?? 0);
  // A refusal for a reason this console has no words of its own for.
  const otherReason =
    blockingJobs.length === 0 && storedPoints === 0 && !block ? (repo.deleteBlock?.reason ?? null) : null;
  const blocked = block !== null || blockingJobs.length > 0 || storedPoints > 0 || otherReason !== null;
  const confirmed = !blocked && typed.trim() === repo.name;

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
      if (res.reason === "jobs" || res.reason === "backups") {
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
          <DialogDescription>{t(blocked ? "delete.blockedDescription" : "delete.description")}</DialogDescription>
        </DialogHeader>

        {blockingJobs.length > 0 && (
          <BlockPanel>
            <Trans
              i18nKey="delete.jobsBlock"
              ns="repositories"
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
          </BlockPanel>
        )}
        {storedPoints > 0 && (
          <BlockPanel>
            <Trans
              i18nKey="delete.backupsBlock"
              ns="repositories"
              count={storedPoints}
              values={{ count: storedPoints }}
              components={{ 1: <span className="nums font-semibold" /> }}
            />
          </BlockPanel>
        )}
        {otherReason && (
          <BlockPanel>
            <p>{otherReason}</p>
          </BlockPanel>
        )}

        {!blocked && (
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t(blocked ? "common:actions.close" : "common:actions.cancel")}
          </Button>
          {!blocked && (
            <Button
              variant="destructive"
              disabled={!confirmed || deleting}
              onClick={() => void handleConfirm()}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? t("delete.deleting") : t("actions.delete")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One reason the repository cannot be deleted. */
function BlockPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 border border-danger/30 bg-danger-subtle px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="space-y-1 text-xs text-danger">{children}</div>
    </div>
  );
}
