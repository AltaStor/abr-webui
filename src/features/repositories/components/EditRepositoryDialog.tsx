// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Wrench } from "@/lib/icons";
import {
  Dialog,
  DialogClose,
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
import { useWorldStore } from "@/store/world";
import type { RepositoryEdit } from "@/store/world.types";
import type { Repository } from "@/types";

interface EditRepositoryDialogProps {
  repo: Repository | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit an existing repository's settings. Seeded from the repo; saving calls the
 * world store's `editRepository`, which mutates the repository in both sim and
 * live worlds.
 */
export function EditRepositoryDialog({ repo, open, onOpenChange }: EditRepositoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        {repo && (
          <EditRepositoryForm
            key={repo.id}
            repo={repo}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditRepositoryForm({ repo, onClose }: { repo: Repository; onClose: () => void }) {
  const { t } = useTranslation("repositories");
  const editRepository = useWorldStore((s) => s.editRepository);
  const [name, setName] = useState(repo.name);
  const [saving, setSaving] = useState(false);

  // Keep the form in sync if the same dialog is reused for a different repo.
  useEffect(() => {
    setName(repo.name);
  }, [repo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const nextName = name.trim() || repo.name;

    // Only send the fields that actually changed.
    const patch: RepositoryEdit = {};
    if (nextName !== repo.name) patch.name = nextName;

    setSaving(true);
    try {
      await editRepository(repo.id, patch);
      toast.success(t("edit.toast.saved.title"), {
        description: t("edit.toast.saved.descriptionGeneric", { name: nextName }),
      });
      onClose();
    } catch {
      toast.error(t("edit.toast.failed.title"), {
        description: t("edit.toast.failed.description", { name: nextName }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="border-b border-border p-6 pb-5">
        <div className="mb-1 flex h-10 w-10 items-center justify-center bg-muted text-muted-foreground">
          <Wrench className="h-5 w-5" />
        </div>
        <DialogTitle>{t("edit.title")}</DialogTitle>
        <DialogDescription>{t("edit.description")}</DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6 py-5">
        <div className="space-y-1.5">
          <Label htmlFor="edit-repo-name">{t("add.nameLabel")}</Label>
          <Input
            id="edit-repo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={repo.name}
          />
        </div>
      </div>

      <DialogFooter className="border-t border-border p-6 pt-4">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            {t("common:actions.cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving}>
          <ShieldCheck className="h-4 w-4" />
          {saving ? t("edit.saving") : t("edit.saveSettings")}
        </Button>
      </DialogFooter>
    </form>
  );
}
