// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * What used to stand here was a "cross-platform conversion plan": a numbered
 * VMDK → VHDX pipeline, a firmware readout and a green "High boot confidence"
 * verdict, shown the moment an operator picked a target environment on
 * another hypervisor.
 *
 * None of it was true. Every field came from `computeConversionPlan`, a pure
 * client-side guess — the appliance was never asked and had nothing to say:
 * this orchestrator restores each platform's VMs with that platform's own
 * plugin and contains no disk-format conversion and no driver injection at all. The
 * card promised a recovery that cannot happen, in a wizard people open during
 * an outage, and staked a boot-confidence verdict on it.
 *
 * So the card now states the constraint instead of the plan. The wizard holds
 * "Start restore" disabled while it is up (see `crossHypervisorRestoreBlocked`
 * in ../refusals.ts), so the refusal lands on the step that offers the target
 * rather than after a typed confirmation.
 */
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Server } from "@/lib/icons";
import { Card, CardContent } from "@/components/ui/card";
import { PLATFORM_META } from "@/lib/platform";
import type { Hypervisor } from "@/types";

export function CrossHypervisorBlockCard({
  from,
  to,
  targetEnvName,
}: {
  from: Hypervisor;
  to: Hypervisor;
  targetEnvName: string;
}) {
  const { t } = useTranslation("restore");
  return (
    <Card className="border-danger/30 bg-danger-subtle">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 space-y-1">
            <p className="font-display text-sm font-semibold text-danger-text">
              {t("conversion.blocked.title")}
            </p>
            <p className="text-xs leading-relaxed text-danger-text/90">
              {t("conversion.blocked.body", {
                name: targetEnvName,
                from: PLATFORM_META[from].label,
                to: PLATFORM_META[to].label,
              })}
            </p>
          </div>
        </div>

        {/* The move that is being refused, stated plainly — a measurement, not
            a verdict, so it stays neutral rather than borrowing the tone. */}
        <div className="flex flex-wrap items-center gap-2.5 border border-border bg-card px-3 py-2">
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold">
            <Server className="h-4 w-4 text-muted-foreground" />
            {PLATFORM_META[from].short}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold">
            <Server className="h-4 w-4 text-muted-foreground" />
            {PLATFORM_META[to].short}
          </span>
          <span className="text-xs text-muted-foreground">{t("conversion.blocked.notBuilt")}</span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("conversion.blocked.unaffected")}
        </p>
      </CardContent>
    </Card>
  );
}
