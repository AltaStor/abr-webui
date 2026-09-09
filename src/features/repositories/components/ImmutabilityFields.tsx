// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Lock } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MAX_IMMUTABILITY_RETENTION_DAYS } from "@/types";
import { LOCK_MODES, lockDaysValid, type ImmutabilityDraft, type LockMode } from "./immutability";

/**
 * The Object Lock controls — a switch, a mode and a period — rendered
 * identically wherever a repository's immutability is configured.
 *
 * Its own bordered block rather than another line in a settings list: it is the
 * one setting here that changes what happens to data after it is written, and
 * for backups already stored under it, it cannot be undone.
 */
export function ImmutabilityFields({
  idPrefix,
  draft,
  onChange,
  disabled = false,
  /** Rendered under the fields — where each caller explains what its own
   *  change means for the data already in the repository. */
  children,
}: {
  idPrefix: string;
  draft: ImmutabilityDraft;
  onChange: (next: ImmutabilityDraft) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation("repositories");
  const daysOk = !draft.enabled || lockDaysValid(draft.days);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-immutability`} className="flex items-center gap-1.5 text-xs font-medium">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            {t("add.s3.immutability.label")}
          </Label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("add.s3.immutability.hint")}
          </p>
        </div>
        <Switch
          id={`${idPrefix}-immutability`}
          checked={draft.enabled}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ ...draft, enabled: checked })}
          aria-label={t("add.s3.immutability.aria")}
        />
      </div>

      {draft.enabled && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-lock-mode`}>{t("add.s3.immutability.modeLabel")}</Label>
            <Select
              value={draft.mode}
              disabled={disabled}
              onValueChange={(v) => onChange({ ...draft, mode: v as LockMode })}
            >
              <SelectTrigger id={`${idPrefix}-lock-mode`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCK_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`add.s3.immutability.mode.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-lock-days`}>{t("add.s3.immutability.retentionLabel")}</Label>
            <Input
              id={`${idPrefix}-lock-days`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_IMMUTABILITY_RETENTION_DAYS}
              value={draft.days}
              disabled={disabled}
              onChange={(e) => onChange({ ...draft, days: e.target.value })}
              aria-invalid={!daysOk}
              className={cn("nums", !daysOk && "border-danger")}
            />
          </div>
          <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground">
            {t(`add.s3.immutability.modeHint.${draft.mode}`)}
          </p>
          {!daysOk && (
            <p className="col-span-2 text-xs text-danger">
              {t("add.s3.immutability.retentionInvalid", { max: MAX_IMMUTABILITY_RETENTION_DAYS })}
            </p>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
