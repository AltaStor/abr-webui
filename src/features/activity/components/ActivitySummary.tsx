// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Activity, CheckCircle2, Database, Loader2, type LucideIcon } from "@/lib/icons";
import { KpiCard } from "@/components/KpiCard";
import { KpiBand } from "@/components/KpiBand";
import { rateTone, type Tone } from "@/lib/status";
import { formatStorage } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import { within24h } from "../lib";

interface Tile {
  label: string;
  value: number | string;
  format?: (n: number) => string;
  unit?: string;
  hint: string;
  icon: LucideIcon;
  /** Render the icon spinning (for the running tile when active). */
  iconSpin?: boolean;
  tone: Tone;
}

/**
 * Four compact, live-updating KPI cards.
 * Recomputed straight from the world store so they advance with the simulation.
 */
export function ActivitySummary() {
  const { t } = useTranslation("activity");
  const sessions = useWorldStore((s) => s.sessions);

  const running = sessions.filter((s) => s.status === "running");
  const last24 = within24h(sessions);
  const finished24 = last24.filter((s) => s.status !== "running" && s.status !== "queued");
  const ok24 = finished24.filter((s) => s.status === "success").length;
  // null, not 100: with nothing finished in the window there is no rate to
  // report, and a healthy tile beside a "0 of 0" hint invents an all-clear.
  const successRate = finished24.length ? Math.round((ok24 / finished24.length) * 100) : null;
  const transferred24 = last24.reduce((sum, s) => sum + s.transferredGB, 0);

  const tiles: Tile[] = [
    {
      label: t("summary.running.label"),
      value: running.length,
      // Hint must add context, not restate the number already shown as the value.
      hint:
        running.length === 0
          ? t("summary.running.hintNone")
          : t("summary.running.hint", { count: running.length }),
      icon: running.length ? Loader2 : Activity,
      iconSpin: running.length > 0,
      tone: running.length ? "info" : "muted",
    },
    {
      label: t("summary.runs24.label"),
      value: last24.length,
      hint: t("summary.runs24.hint", { count: finished24.length }),
      icon: Activity,
      tone: "neutral",
    },
    {
      label: t("summary.successRate.label"),
      value: successRate === null ? "—" : successRate,
      format: (n) => `${Math.round(n)}%`,
      hint:
        successRate === null
          ? t("summary.successRate.hintNone")
          : t("summary.successRate.hint", { ok: ok24, total: finished24.length }),
      icon: CheckCircle2,
      tone: rateTone(successRate),
    },
    {
      label: t("summary.transferred.label"),
      value: transferred24,
      format: (n) => formatStorage(n, 0),
      hint: t("summary.transferred.hint"),
      icon: Database,
      tone: "neutral",
    },
  ];

  return (
    <KpiBand>
      {tiles.map((tile) => (
        <KpiCard
          key={tile.label}
          icon={tile.icon}
          iconSpin={tile.iconSpin}
          tone={tile.tone}
          label={tile.label}
          value={tile.value}
          format={tile.format}
          unit={tile.unit}
          hint={tile.hint}
        />
      ))}
    </KpiBand>
  );
}
