// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Activity, CheckCircle2, Database, Loader2, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toneChip, toneFg, type Tone } from "@/lib/status";
import { formatStorage } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import { within24h } from "../lib";

interface Tile {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: Tone;
  /** Render the icon spinning (for the running tile when active). */
  spin?: boolean;
}

/**
 * Four compact, live-updating stat tiles.
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
  // report, and a green tile beside a "0 of 0" hint invents an all-clear.
  const successRate = finished24.length ? Math.round((ok24 / finished24.length) * 100) : null;
  const transferred24 = last24.reduce((sum, s) => sum + s.transferredGB, 0);

  const successTone: Tone =
    successRate === null ? "muted" : successRate >= 95 ? "success" : successRate >= 85 ? "warning" : "danger";

  const tiles: Tile[] = [
    {
      label: t("summary.running.label"),
      value: String(running.length),
      // Hint must add context, not restate the number already shown as the value.
      hint:
        running.length === 0
          ? t("summary.running.hintNone")
          : t("summary.running.hint", { count: running.length }),
      icon: running.length ? Loader2 : Activity,
      tone: running.length ? "info" : "muted",
      spin: running.length > 0,
    },
    {
      label: t("summary.runs24.label"),
      value: String(last24.length),
      hint: t("summary.runs24.hint", { count: finished24.length }),
      icon: Activity,
      tone: "muted",
    },
    {
      label: t("summary.successRate.label"),
      value: successRate === null ? "—" : `${successRate}%`,
      hint:
        successRate === null
          ? t("summary.successRate.hintNone")
          : t("summary.successRate.hint", { ok: ok24, total: finished24.length }),
      icon: CheckCircle2,
      tone: successTone,
    },
    {
      label: t("summary.transferred.label"),
      value: formatStorage(transferred24, 0),
      hint: t("summary.transferred.hint"),
      icon: Database,
      tone: "immutable",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <div
            key={t.label}
            className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-card"
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneChip(t.tone))}>
              <Icon className={cn("h-4 w-4", t.spin && "animate-spin")} />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className={cn("nums text-xl font-semibold tracking-tight", toneFg(t.tone))}>{t.value}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">{t.label}</p>
              <p className="truncate text-[11px] text-muted-foreground/70" title={t.hint}>
                {t.hint}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
