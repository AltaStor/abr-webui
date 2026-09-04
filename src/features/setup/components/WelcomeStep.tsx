// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { LogoMark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStorage } from "@/lib/format";
import i18n from "@/i18n";
import type { ApplianceInfo, ProvisioningStatus } from "@/services/api.http";

interface WelcomeStepProps {
  info: ApplianceInfo | null;
  provisioning: ProvisioningStatus | null;
}

function stateBadge(provisioning: ProvisioningStatus | null) {
  if (!provisioning)
    return <Badge variant="outline">{i18n.t("setup:welcome.state.checking")}</Badge>;
  if (provisioning.stage === "unconfigured")
    return <Badge variant="info">{i18n.t("setup:welcome.state.unconfigured")}</Badge>;
  if (provisioning.stage === "complete")
    return <Badge variant="success">{i18n.t("setup:welcome.state.complete")}</Badge>;
  return <Badge variant="warning">{i18n.t("setup:welcome.state.inProgress")}</Badge>;
}

export function WelcomeStep({ info, provisioning }: WelcomeStepProps) {
  const { t } = useTranslation("setup");
  const facts: Array<{ label: string; value: string | null }> = [
    { label: t("welcome.facts.hostname"), value: info?.hostname ?? null },
    { label: t("welcome.facts.os"), value: info?.os ?? null },
    { label: t("welcome.facts.kernel"), value: info?.kernel ?? null },
    { label: t("welcome.facts.mgmtIp"), value: info?.mgmtIp ?? null },
    { label: t("welcome.facts.cpu"), value: info ? t("welcome.cores", { count: info.cpuCores }) : null },
    { label: t("welcome.facts.memory"), value: info ? formatStorage(info.memoryGB, 0) : null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-4">
        <LogoMark className="h-12 w-12" />
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t("welcome.title")}</h1>
          <p className="max-w-lg text-sm text-muted-foreground">{t("welcome.description")}</p>
        </div>
        {stateBadge(provisioning)}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className="border border-border bg-muted/20 p-3">
            <p className="label-overline">
              {f.label}
            </p>
            {f.value === null ? (
              <Skeleton className="mt-1.5 h-4 w-24" />
            ) : (
              <p className="mt-1 truncate text-sm font-medium" title={f.value}>
                {f.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {provisioning?.stage === "complete" && (
        <p className="text-xs text-muted-foreground">{t("welcome.completeNote")}</p>
      )}
    </div>
  );
}
