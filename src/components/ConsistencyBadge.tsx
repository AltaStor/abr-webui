// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { ShieldAlert, ShieldCheck } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BackupConsistency } from "@/types";

const REASONS = ["tools_not_installed", "tools_not_running", "quiesce_failed", "not_quiesced"];

export function useConsistencyExplanation(
  consistency: BackupConsistency | null | undefined,
  reason: string | null | undefined,
): string | null {
  const { t } = useTranslation("domain");
  if (!consistency) return null;
  if (consistency === "quiesced") return t("consistency.quiescedTip");
  return t(`consistency.reason.${reason && REASONS.includes(reason) ? reason : "not_quiesced"}`);
}

export function ConsistencyBadge({
  consistency,
  reason,
  className,
}: {
  consistency?: BackupConsistency | null;
  reason?: string | null;
  className?: string;
}) {
  const { t } = useTranslation("domain");
  const explanation = useConsistencyExplanation(consistency, reason);
  if (!consistency) return null;
  const quiesced = consistency === "quiesced";
  const Icon = quiesced ? ShieldCheck : ShieldAlert;
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 gap-1 font-normal",
        quiesced ? "text-muted-foreground" : "border-warning/40 text-warning-text",
        className,
      )}
      title={explanation ?? undefined}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t(`consistency.${consistency}`)}
    </Badge>
  );
}
