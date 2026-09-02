// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Network } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ApplianceInfo } from "@/services/api.http";
import { HOSTNAME_RE, type SetupForm } from "../types";
import { StepHeader } from "./StepHeader";

interface ApplianceStepProps {
  form: SetupForm;
  info: ApplianceInfo | null;
  onChange: (patch: Partial<SetupForm>) => void;
}

export function ApplianceStep({ form, info, onChange }: ApplianceStepProps) {
  const { t } = useTranslation("setup");
  const [touched, setTouched] = useState(false);
  const invalid = !HOSTNAME_RE.test(form.hostname.trim());
  const showError = touched && invalid;

  return (
    <div className="space-y-5">
      <StepHeader title={t("appliance.title")} description={t("appliance.description")} />

      <div className="space-y-2">
        <Label htmlFor="setup-hostname">{t("appliance.hostnameLabel")}</Label>
        <Input
          id="setup-hostname"
          value={form.hostname}
          onChange={(e) => onChange({ hostname: e.target.value })}
          onBlur={() => setTouched(true)}
          placeholder="altastor-01"
          autoComplete="off"
          spellCheck={false}
          className={cn("max-w-sm font-mono", showError && "border-danger focus-visible:ring-danger/40")}
          aria-invalid={showError}
        />
        {showError ? (
          <p className="text-xs text-danger">{t("appliance.hostnameError")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("appliance.hostnameHint")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t("appliance.networkLabel")}</Label>
        <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
          <Network className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">
            <Trans
              i18nKey="appliance.networkValue"
              ns="setup"
              values={{ ip: info?.mgmtIp ?? "—" }}
              components={{ 1: <span className="font-mono text-foreground/90" /> }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
