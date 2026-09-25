// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Lock, ShieldCheck, Wrench } from "@/lib/icons";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { useWorldStore } from "@/store/world";
import type { RepositoryEdit } from "@/store/world.types";
import type {
  ImmutabilityEffect,
  Repository,
  RepositoryValidationResult,
  S3ConnectionCheck,
} from "@/types";
import { ImmutabilityFields } from "./ImmutabilityFields";
import { ImmutabilityEffectPanel } from "./ImmutabilityEffectPanel";
import { ValidationResultPanel } from "./ValidationResultPanel";
import {
  RESOURCE_NAME_MAX_LENGTH,
  resourceNameErrorKey,
  resourceNameProblem,
} from "@/lib/resource-name";
import { immutabilityLabel } from "./repoMeta";
import {
  draftToImmutability,
  draftValid,
  immutabilityChange,
  immutabilityEnabled,
  immutabilityToDraft,
  sameImmutability,
  type ImmutabilityDraft,
} from "./immutability";

interface EditRepositoryDialogProps {
  repo: Repository | null;
  /** Restore points already stored here. Decides whether "apply to stored
   *  backups" has anything to act on, and whether a lock change needs the
   *  "this does not reach what is already written" warning at all. */
  restorePointCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit an existing repository — its name, and (for object storage) its Object
 * Lock configuration.
 *
 * Immutability used to be write-once: it could be set while creating a
 * repository and never seen again, so a lock that was too short, too long or
 * simply wrong was permanent as far as the console was concerned. Everything
 * the appliance offers for it is reachable from here now — read the current
 * setting, change it, validate it against the real bucket, and put the backups
 * already stored under it — through the common API rather than any console-side
 * notion of what immutability means.
 */
export function EditRepositoryDialog({
  repo,
  restorePointCount,
  open,
  onOpenChange,
}: EditRepositoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        {repo && (
          <EditRepositoryForm
            key={repo.id}
            repo={repo}
            restorePointCount={restorePointCount}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditRepositoryForm({
  repo,
  restorePointCount,
  onClose,
}: {
  repo: Repository;
  restorePointCount: number;
  onClose: () => void;
}) {
  const { t } = useTranslation("repositories");
  const { t: tCommon } = useTranslation("common");
  const editRepository = useWorldStore((s) => s.editRepository);
  const verifyRepositoryImmutability = useWorldStore((s) => s.verifyRepositoryImmutability);
  const applyRepositoryImmutability = useWorldStore((s) => s.applyRepositoryImmutability);

  const [name, setName] = useState(repo.name);
  const [lock, setLock] = useState<ImmutabilityDraft>(() => immutabilityToDraft(repo.immutability));
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyArmed, setApplyArmed] = useState(false);
  const [validation, setValidation] = useState<RepositoryValidationResult | null>(null);
  const [effect, setEffect] = useState<ImmutabilityEffect | null>(null);
  const [saveError, setSaveError] = useState<{ message: string; checks: S3ConnectionCheck[] } | null>(null);
  /* The save went through and the dialog stayed open for the effect report.
   * Without this it looked identical to a dialog that had done nothing. */
  const [justSaved, setJustSaved] = useState(false);

  /* The dialog is keyed on repo.id, so the form is seeded once per repository
   * and never fights the poll: a store refresh mid-edit must not overwrite what
   * the operator is typing. `saved` below is what the appliance last told us. */
  const saved = repo.immutability ?? { mode: "none" as const, retentionDays: 0 };
  const next = draftToImmutability(lock);
  const supportsLock = Boolean(repo.supportsImmutability);
  const lockDirty = supportsLock && !sameImmutability(saved, next);
  const change = immutabilityChange(saved, next);
  // Blank means "leave the name alone", so it is not an error. Anything else is
  // checked as typed rather than trimmed — see src/lib/resource-name.ts.
  const nameProblem = name === "" ? null : resourceNameProblem(name);
  const nameErrorKey = resourceNameErrorKey(nameProblem);
  const nameDirty = name !== "" && name !== repo.name;
  const lockValid = draftValid(lock);
  const dirty = nameDirty || lockDirty;
  const canSave = dirty && lockValid && nameProblem === null && !saving;
  /* Placing stored backups under the lock only makes sense once the lock is
   * saved: the appliance reads the repository's persisted setting, not the
   * draft in this form, and refuses outright when it is off. */
  const canApply =
    supportsLock &&
    immutabilityEnabled(saved) &&
    !lockDirty &&
    restorePointCount > 0 &&
    !applying;

  /** Any edit invalidates a validation run — it spoke to the settings as they
   *  were then. The effect report is the appliance's answer about the SAVED
   *  configuration, so it goes too. */
  function editLock(draft: ImmutabilityDraft) {
    setLock(draft);
    setValidation(null);
    setEffect(null);
    setSaveError(null);
    setApplyArmed(false);
    setJustSaved(false);
  }

  async function handleValidate() {
    setValidating(true);
    setValidation(null);
    try {
      const result = await verifyRepositoryImmutability(repo.id);
      setValidation(result);
      if (result.immutabilityEffect) setEffect(result.immutabilityEffect);
    } finally {
      setValidating(false);
    }
  }

  async function handleApply() {
    setApplying(true);
    setApplyArmed(false);
    try {
      const result = await applyRepositoryImmutability(repo.id);
      if (!result.ok) {
        toast.error(t("immutability.apply.toast.failed"), { description: result.message });
        return;
      }
      toast.success(t("immutability.apply.toast.done"), { description: result.message });
      // The report on screen said these points were not covered; they are now.
      setEffect((prev) =>
        prev ? { ...prev, existingDataProtected: result.failedRestorePoints === 0 } : prev,
      );
    } finally {
      setApplying(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    // Only the fields that actually changed — a PATCH with nothing in it is a
    // 422 ("repo edit requires at least one editable option") server-side.
    const patch: RepositoryEdit = {};
    if (nameDirty) patch.name = name;
    if (lockDirty) patch.immutability = next;

    setSaving(true);
    setSaveError(null);
    try {
      const result = await editRepository(repo.id, patch);
      if (!result.ok) {
        // The appliance names the probe that refused an unusable lock; keeping
        // that in the dialog is what lets the operator fix the setting rather
        // than guess at it.
        setSaveError({ message: result.message, checks: result.checks });
        toast.error(t("edit.toast.failed.title"), { description: result.message });
        return;
      }
      toast.success(t("edit.toast.saved.title"), {
        description: t("edit.toast.saved.descriptionGeneric", { name: result.repository.name }),
      });
      /* Stay open only while there is something left to DO here. A lock change
       * leaves the backups already stored outside it, and "apply to stored
       * backups" — the only place that can fix that — lives in this dialog, so
       * closing would hide the one action the save just made necessary.
       *
       * When there is nothing stored to protect, or it is already covered, the
       * report is just an account of a save that worked: it goes to the toast
       * and the dialog closes, which is what every other save in the console
       * does and what an operator waiting on a spinner expects. */
      const effectReport = result.immutabilityEffect;
      const leavesStoredDataUncovered =
        effectReport != null &&
        effectReport.existingRestorePoints > 0 &&
        !effectReport.existingDataProtected &&
        immutabilityEnabled(effectReport.current);
      if (leavesStoredDataUncovered) {
        setEffect(effectReport);
        setValidation(null);
        setJustSaved(true);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const currentLabel = immutabilityLabel(repo) ?? t("detail.immutabilityOff");

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader className="border-b border-border p-6 pb-5">
        <div className="mb-1 flex h-10 w-10 items-center justify-center bg-muted text-muted-foreground">
          <Wrench className="h-5 w-5" />
        </div>
        <DialogTitle>{t("edit.title")}</DialogTitle>
        <DialogDescription>{t("edit.description")}</DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-5 p-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="edit-repo-name">{t("add.nameLabel")}</Label>
            <Input
              id="edit-repo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={repo.name}
              maxLength={RESOURCE_NAME_MAX_LENGTH}
              aria-invalid={nameProblem !== null}
              className={cn(nameProblem !== null && "border-danger")}
            />
            {nameErrorKey && <p className="text-xs text-danger">{tCommon(nameErrorKey)}</p>}
          </div>

          {/* Object Lock — only where the backend has the concept, so a local
              repository isn't offered a setting that would mean nothing there. */}
          {supportsLock ? (
            <div className="space-y-3 border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("immutability.currentLabel")}
                </span>
                <span className="inline-flex items-center gap-1.5 bg-immutable-subtle px-2 py-0.5 text-[11px] font-medium text-immutable-text">
                  <Lock className="h-3 w-3" />
                  {currentLabel}
                </span>
              </div>

              <ImmutabilityFields idPrefix="edit-repo" draft={lock} onChange={editLock} disabled={saving}>
                {lockDirty && (
                  <p className="bg-info-subtle px-3 py-2 text-[11px] leading-relaxed text-info-text">
                    {t(`immutability.change.${change}`, { count: restorePointCount })}
                  </p>
                )}
              </ImmutabilityFields>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleValidate()}
                  disabled={validating || saving}
                >
                  {validating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {validating ? t("immutability.validating") : t("immutability.validate")}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {lockDirty ? t("immutability.validateDirtyHint") : t("immutability.validateHint")}
              </p>

              {validation && (
                <ValidationResultPanel
                  ok={validation.ok}
                  message={validation.message}
                  checks={validation.checks}
                />
              )}

              {justSaved && (
                <p className="flex items-start gap-1.5 bg-success-subtle px-3 py-2 text-[11px] leading-relaxed text-success-text">
                  <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
                  {t("edit.savedStaysOpen", { count: restorePointCount })}
                </p>
              )}

              {effect && <ImmutabilityEffectPanel effect={effect} />}

              {/* Bringing already-stored backups under the lock. Its own action,
                  not a side effect of saving: it rewrites retention on every
                  artifact in the repository, and in compliance mode that is a
                  storage bill nobody can cancel until it expires. */}
              {supportsLock && restorePointCount > 0 && (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-medium">{t("immutability.apply.title")}</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("immutability.apply.description", { count: restorePointCount })}
                  </p>
                  {!immutabilityEnabled(saved) ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("immutability.apply.needsEnabled")}
                    </p>
                  ) : lockDirty ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("immutability.apply.needsSaved")}
                    </p>
                  ) : applyArmed ? (
                    <div className="space-y-2 bg-warning-subtle px-3 py-2">
                      <p className="text-[11px] leading-relaxed text-warning-text">
                        {t("immutability.apply.confirm", {
                          count: restorePointCount,
                          mode: t(`immutability.mode.${saved.mode}`),
                          days: saved.retentionDays,
                        })}
                      </p>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => void handleApply()} disabled={applying}>
                          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                          {t("immutability.apply.confirmAction")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setApplyArmed(false)}
                          disabled={applying}
                        >
                          {t("common:actions.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setApplyArmed(true)}
                      disabled={!canApply}
                    >
                      <Lock className="h-4 w-4" />
                      {t("immutability.apply.action")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="border border-dashed border-border px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
              {t("immutability.unsupported")}
            </p>
          )}

          {saveError && (
            <ValidationResultPanel ok={false} message={saveError.message} checks={saveError.checks} />
          )}
        </div>
      </ScrollArea>

      <DialogFooter className="border-t border-border p-6 pt-4">
        <DialogClose asChild>
          {/* Once the save is in, closing is the way out, not cancelling
              something — there is nothing left to cancel. */}
          <Button type="button" variant={justSaved ? "default" : "ghost"}>
            {justSaved || effect ? t("common:actions.close") : t("common:actions.cancel")}
          </Button>
        </DialogClose>
        {!justSaved && (
          <Button type="submit" disabled={!canSave}>
            {/* A repository save can take a while — the appliance may be talking
                to the bucket — so the button holds the wait instead of looking
                like a click that did nothing. */}
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {saving ? t("edit.saving") : t("edit.saveSettings")}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
