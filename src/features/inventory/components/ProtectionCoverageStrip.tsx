// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Database, ShieldCheck } from "@/lib/icons";
import { KpiBand } from "@/components/KpiBand";
import { KpiCard } from "@/components/KpiCard";
import { formatStorage } from "@/lib/format";
import { PROTECTION_META, rateTone } from "@/lib/status";
import type { ProtectionStatus } from "@/types";

interface Props {
  counts: Record<ProtectionStatus, number>;
  total: number;
  running: number;
  /** Provisioned data sitting in VMs that are not fully protected — the
   *  magnitude of the exposure the percentage only describes as a share. */
  exposedGB: number;
}

/**
 * The estate's protection posture, in the stat band every other page uses.
 *
 * Tiles take icon / tone / label / value / format / hint and nothing else,
 * because that is the exact set every other band in the console uses. A footer
 * or a badge here would make these tiles a different height and push their
 * numbers off the baseline the rest of the band sits on — which is what made
 * Inventory look like a different page in the first place.
 *
 * The two exposure tiles carry SHARES, not counts: the protection chips
 * directly below already carry the counts, so counts here would put the same
 * three numbers on screen twice, forty pixels apart.
 */
export function ProtectionCoverageStrip({ counts, total, running, exposedGB }: Props) {
  const { t } = useTranslation("inventory");
  const coverage = total ? Math.round((counts.protected / total) * 100) : 0;
  // An empty estate has nothing to cover — 0% there is not a failing grade, so
  // the tile stays grey rather than claiming a verdict it cannot have.
  const tone = rateTone(total ? coverage : null);
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const noun = t("coverage.vms");

  return (
    <KpiBand>
      <KpiCard
        icon={ShieldCheck}
        tone={tone}
        label={t("coverage.card.coverage")}
        value={coverage}
        format={(n) => `${Math.round(n)}%`}
        hint={t("coverage.card.coverageHint", {
          protected: counts.protected,
          total,
          noun,
          running,
          runningLabel: t("coverage.running"),
        })}
      />
      <KpiCard
        icon={PROTECTION_META.warning.icon}
        // Zero at-risk sources is a fact, not an achievement.
        tone={counts.warning > 0 ? "warning" : "neutral"}
        label={PROTECTION_META.warning.label}
        value={share(counts.warning)}
        format={(n) => `${Math.round(n)}%`}
        hint={t("coverage.card.ofEstate", { count: counts.warning, noun })}
      />
      <KpiCard
        icon={PROTECTION_META.unprotected.icon}
        tone={counts.unprotected > 0 ? "danger" : "neutral"}
        label={PROTECTION_META.unprotected.label}
        value={share(counts.unprotected)}
        format={(n) => `${Math.round(n)}%`}
        hint={t("coverage.card.ofEstate", { count: counts.unprotected, noun })}
      />
      <KpiCard
        icon={Database}
        // A byte total is a measurement, not a verdict — the two tiles beside
        // it already carry the judgement about the same sources.
        tone="neutral"
        label={t("coverage.card.exposed")}
        value={exposedGB}
        format={(n) => formatStorage(n, 0)}
        hint={t("coverage.card.exposedHint", {
          count: counts.warning + counts.unprotected,
          noun,
        })}
      />
    </KpiBand>
  );
}
