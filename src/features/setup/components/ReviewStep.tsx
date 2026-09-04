// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ApplianceInfo, ManifestArraySpec } from "@/services/api.http";
import { HYPERVISOR_LABEL, isCompleteRow, type SetupForm, type StepKey } from "../types";
import { StepHeader } from "./StepHeader";

interface ReviewStepProps {
  form: SetupForm;
  plan: ManifestArraySpec[] | null;
  info: ApplianceInfo | null;
  onEdit: (step: StepKey) => void;
}

function ReviewGroup({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: StepKey;
  onEdit: (step: StepKey) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <section className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onEdit(step)}>
          {t("actions.edit")}
        </Button>
      </div>
      <dl className="space-y-2 px-4 py-3">{children}</dl>
    </section>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? "min-w-0 flex-1 truncate text-right font-mono text-xs"
            : "min-w-0 flex-1 truncate text-right"
        }
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

export function ReviewStep({ form, plan, info, onEdit }: ReviewStepProps) {
  const { t } = useTranslation("setup");
  const hypervisors = form.hypervisors.filter(isCompleteRow);

  return (
    <div className="space-y-4">
      <StepHeader title={t("review.title")} description={t("review.description")} />

      <ReviewGroup title={t("review.groups.appliance")} step="appliance" onEdit={onEdit}>
        <ReviewRow label={t("review.hostname")} value={form.hostname.trim() || "—"} mono />
        <ReviewRow
          label={t("review.network")}
          value={t("review.networkValue", { ip: info?.mgmtIp ?? "—" })}
        />
      </ReviewGroup>

      <ReviewGroup title={t("review.groups.storage")} step="storage" onEdit={onEdit}>
        {plan && plan.length > 0 ? (
          plan.map((spec) => (
            <ReviewRow
              key={spec.name}
              label={spec.name}
              value={`${spec.level.toUpperCase()} · ${spec.diskCount}× ${spec.media.toUpperCase()}${
                spec.spares > 0 ? t("review.spares", { count: spec.spares }) : ""
              }`}
            />
          ))
        ) : (
          <ReviewRow label={t("review.layout")} value={t("review.layoutAutomatic")} />
        )}
      </ReviewGroup>

      <ReviewGroup title={t("review.groups.repository")} step="repository" onEdit={onEdit}>
        <ReviewRow label={t("review.name")} value={form.repoName.trim() || "—"} />
        <ReviewRow
          label={t("review.encryption")}
          value={form.encryption ? t("review.encryptionValue") : t("review.off")}
        />
      </ReviewGroup>

      <ReviewGroup title={t("review.groups.hypervisors")} step="hypervisors" onEdit={onEdit}>
        {hypervisors.length > 0 ? (
          hypervisors.map((r) => (
            <ReviewRow
              key={r.id}
              label={HYPERVISOR_LABEL[r.type]}
              value={t("review.hypervisorValue", { endpoint: r.endpoint, username: r.username })}
            />
          ))
        ) : (
          <ReviewRow label={t("common:generic.none")} value={t("review.hypervisorsEmpty")} />
        )}
      </ReviewGroup>

      <p className="text-xs text-muted-foreground">{t("review.destructiveNote")}</p>
    </div>
  );
}
