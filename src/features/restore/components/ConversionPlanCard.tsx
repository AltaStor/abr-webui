// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Cpu,
  Server,
  ShieldCheck,
  Zap,
} from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toneChip, type Tone } from "@/lib/status";
import { PLATFORM_META } from "@/lib/platform";
import { platformLabel } from "@/lib/conversion";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";
import type { ConversionConfidence, ConversionPlan } from "@/types";

const CONFIDENCE_META: Record<ConversionConfidence, { label: string; tone: Tone }> = {
  high: { get label() { return i18n.t("restore:conversion.confidence.high"); }, tone: "success" },
  medium: { get label() { return i18n.t("restore:conversion.confidence.medium"); }, tone: "warning" },
  low: { get label() { return i18n.t("restore:conversion.confidence.low"); }, tone: "danger" },
};

/** Small labelled key/value tile used for firmware + confidence. */
function MetaTile({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Cpu;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

export function ConversionPlanCard({
  plan,
  targetEnvName,
}: {
  plan: ConversionPlan;
  targetEnvName: string;
}) {
  const { t } = useTranslation("restore");
  const confidence = CONFIDENCE_META[plan.confidence];

  return (
    <Card className="border-primary/25 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </span>
          {t("conversion.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("conversion.subtitle", { name: targetEnvName })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Platform move + disk format pill */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Server className="h-4 w-4 text-muted-foreground" />
              {PLATFORM_META[plan.sourcePlatform].short}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Server className="h-4 w-4" />
              {PLATFORM_META[plan.targetPlatform].short}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {platformLabel(plan.sourcePlatform)} → {platformLabel(plan.targetPlatform)}
          </span>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs font-semibold",
              plan.formatChange
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {plan.formatChange ? (
              <>
                {plan.sourceFormat.toUpperCase()}
                <ArrowRight className="h-3 w-3" />
                {plan.targetFormat.toUpperCase()}
              </>
            ) : (
              t("conversion.noFormatChange")
            )}
          </span>
        </div>

        {/* Firmware + confidence */}
        <div className="grid gap-3 sm:grid-cols-2">
          <MetaTile icon={Cpu} label={t("conversion.firmware")}>
            <span className="uppercase">{plan.firmware}</span>
          </MetaTile>
          <MetaTile icon={ShieldCheck} label={t("conversion.bootConfidence")}>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 text-xs font-semibold",
                toneChip(confidence.tone),
              )}
            >
              {confidence.label}
            </span>
          </MetaTile>
        </div>

        {/* Driver / guest-adaptation strategy */}
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Cpu className="h-3.5 w-3.5" />
            {t("conversion.guestAdaptation")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {plan.driverStrategy}
          </p>
        </div>

        {/* Ordered steps */}
        <div>
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {t("conversion.planLabel")}
          </p>
          <ol className="space-y-2">
            {plan.steps.map((step, i) => (
              <li key={step.key} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-primary/10 text-[0.65rem] font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Warnings */}
        {plan.warnings.length > 0 && (
          <div className="space-y-2">
            {plan.warnings.map((warning) => (
              <div
                key={warning}
                className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2.5"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs text-warning-text">{warning}</p>
              </div>
            ))}
          </div>
        )}

        {/* Reassurance footer when no warnings — mirrors the "clean source" callouts */}
        {plan.warnings.length === 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-success/25 bg-success/[0.05] px-3 py-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs text-muted-foreground">
              {t("conversion.noCaveats", { platform: platformLabel(plan.targetPlatform) })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
