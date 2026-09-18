// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  RESOURCE_NAME_MAX_LENGTH,
  resourceNameErrorKey,
  resourceNameProblem,
} from "@/lib/resource-name";
import type { SetupForm } from "../types";
import { StepHeader } from "./StepHeader";

interface RepositoryStepProps {
  form: SetupForm;
  onChange: (patch: Partial<SetupForm>) => void;
}

export function RepositoryStep({ form, onChange }: RepositoryStepProps) {
  const { t } = useTranslation("setup");
  const { t: tCommon } = useTranslation("common");
  // Checked as typed, not trimmed — the appliance refuses a repository name
  // with surrounding whitespace (see src/lib/resource-name.ts).
  const nameProblem = resourceNameProblem(form.repoName);
  const nameErrorKey = resourceNameErrorKey(nameProblem);
  const nameInvalid = nameProblem !== null;

  return (
    <div className="space-y-5">
      <StepHeader title={t("repository.title")} description={t("repository.description")} />

      <div className="space-y-2">
        <Label htmlFor="setup-repo-name">{t("repository.nameLabel")}</Label>
        <Input
          id="setup-repo-name"
          value={form.repoName}
          onChange={(e) => onChange({ repoName: e.target.value })}
          placeholder={t("repository.namePlaceholder")}
          maxLength={RESOURCE_NAME_MAX_LENGTH}
          className={cn("max-w-sm", nameInvalid && "border-danger")}
          aria-invalid={nameInvalid}
        />
        {nameInvalid && (
          <p className="text-xs text-danger">
            {nameErrorKey ? tCommon(nameErrorKey) : t("repository.nameError")}
          </p>
        )}
      </div>

      {/* -------- encryption -------- */}
      <label className="flex cursor-pointer items-start justify-between gap-3 border border-border bg-muted/20 p-4">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            {t("repository.encryption.label")}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("repository.encryption.description")}
          </span>
        </span>
        <Switch
          checked={form.encryption}
          onCheckedChange={(v) => onChange({ encryption: v })}
          aria-label={t("repository.encryption.label")}
        />
      </label>
    </div>
  );
}
