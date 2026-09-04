// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import type * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, HardDrive } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { capacityLevel, useCapacityThresholds, type CapacityLevel } from "@/lib/capacity";
import { formatStorage, usagePercent } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { DashboardSummary } from "@/types";

export function StorageCard({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation("dashboard");
  const repositories = useWorldStore((s) => s.repositories);
  const thresholds = useCapacityThresholds();
  /* Which segment of the total bar the pointer is inspecting, so its
     siblings can quiet the way the activity chart's do. */
  const [inspected, setInspected] = useState<string | null>(null);
  // An S3 bucket is elastic, so the orchestrator reports capacity 0 for it. With
  // only such repositories the aggregate capacity is 0 too, and the percentage
  // arithmetic below turns into fiction: "0% used" over stored terabytes, a
  // negative free figure, and a `width: Infinity%` share bar. Where there is no
  // capacity to divide by there is no verdict to give — so the card states the
  // amount stored and says the capacity wasn't reported.
  const hasCapacity = summary.capacityGB > 0;
  const freeGB = Math.max(0, summary.capacityGB - summary.usedGB);
  const overallPct = usagePercent(summary.usedGB, summary.capacityGB);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          {t("storage.title")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to="/repositories">
            {t("storage.repositories")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 pt-0">
        <div>
          <div className="flex items-end justify-between">
            <span className="nums text-2xl font-semibold">{formatStorage(summary.usedGB, 0)}</span>
            <span className="nums text-xs text-muted-foreground">
              {hasCapacity
                ? t("storage.ofFree", { total: formatStorage(summary.capacityGB, 0), free: formatStorage(freeGB, 0) })
                : t("storage.capacityUnknown")}
            </span>
          </div>
          {hasCapacity && (
            /* One `role="img"` for the whole split rather than a tab stop per
               segment: a screen reader wants the breakdown in one read, and the
               thinnest repository here is a couple of pixels wide — a keyboard
               target nobody could aim at anyway. Pointer users get the
               per-segment tooltip; the list below carries the same numbers
               focusably. */
            <div
              role="img"
              aria-label={`${t("storage.tip.shareAria")}: ${repositories
                .map((r) => `${r.name} ${formatStorage(r.usedGB, 0)}`)
                .join(", ")}`}
              className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden bg-muted/70"
              onPointerLeave={() => setInspected(null)}
            >
              {repositories.map((r) => {
                const share = (r.usedGB / summary.capacityGB) * 100;
                return (
                  <Hint
                    key={r.id}
                    label={
                      <TipBody title={r.name}>
                        <span className="nums block">
                          {t("storage.tip.share", {
                            used: formatStorage(r.usedGB, 0),
                            percent: Math.round(share),
                            total: formatStorage(summary.capacityGB, 0),
                          })}
                        </span>
                      </TipBody>
                    }
                  >
                  {/* Bar hover follows `charts.tsx`, not a bespoke effect: the
                      inspected series stays at full strength and its siblings
                      quiet to the same 0.28 `inspectionBarShape` uses on the
                      dashboard's activity chart. No `cursor-help` — a chart bar
                      does not change the pointer, and neither does this one. */}
                    <div
                      aria-hidden="true"
                      onPointerEnter={() => setInspected(r.id)}
                      className={cn(
                        "h-full bg-primary/70 transition-opacity duration-250 ease-brand",
                        inspected !== null && inspected !== r.id && "opacity-[0.28]",
                      )}
                      style={{ width: `${share}%` }}
                    />
                  </Hint>
                );
              })}
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {hasCapacity
              ? t("storage.usedAcross", { count: repositories.length, percent: Math.round(overallPct) })
              : t("storage.storedAcross", { count: repositories.length })}
          </p>
        </div>

        {/* Per-repository breakdown — only meaningful with 2+ repos. With one
            repository it renders an identical second bar to the total above.
            It follows the total directly: the card is stretched to the height of
            its taller neighbour, and pushing the list to the bottom of that box
            opened a void between the two halves rather than filling it. Slack
            below the last bar reads as card padding; slack in the middle reads
            as a bug. */}
        {repositories.length > 1 && (
          /* No `space-y` here any more: each row carries its own py-1, which
             keeps adjacent rows the same 8px apart while giving the hover wash
             the padding it needs to read as a band rather than a stripe clipped
             to the text. */
          <div>
            {repositories.map((r) => {
              const repoHasCapacity = r.capacityGB > 0;
              const pct = usagePercent(r.usedGB, r.capacityGB);
              const level = capacityLevel(pct, thresholds);
              const repoFreeGB = Math.max(0, r.capacityGB - r.usedGB);
              return (
                /* The hover target is the whole row, not the 6px bar inside it —
                   and it is focusable, so the real figures are reachable without
                   a pointer. The bar shows a proportion; only the tooltip has the
                   terabytes, and only it says what the colour means in words. */
                <Hint
                  key={r.id}
                  label={
                    <TipBody>
                      {repoHasCapacity ? (
                        <>
                          <span className="nums block">
                            {t("storage.tip.usedOfFree", {
                              used: formatStorage(r.usedGB, 0),
                              capacity: formatStorage(r.capacityGB, 0),
                              free: formatStorage(repoFreeGB, 0),
                            })}
                          </span>
                          {verdictKey(level) && <span className="block">{t(verdictKey(level)!)}</span>}
                        </>
                      ) : (
                        /* The row already prints the amount and "No capacity
                           reported"; the only thing left to say is why there is
                           no bar under it. */
                        <span className="block">{t("storage.tip.noCapacity")}</span>
                      )}
                    </TipBody>
                  }
                >
                  {/* No local focus style: globals.css paints one `:focus-visible`
                       outline for the whole console. */}
                  <div
                    tabIndex={0}
                    /* The same soft wash `barCursor` paints behind a hovered
                       chart bar, at the same `foreground/0.05`. The negative
                       inset lets it bleed into the card padding so the band
                       frames the row instead of boxing its text. */
                    className="-mx-2 px-2 py-1 text-xs transition-colors duration-250 ease-brand hover:bg-foreground/5"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 truncate font-medium">
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="nums shrink-0 text-muted-foreground">
                        {repoHasCapacity ? `${Math.round(pct)}%` : formatStorage(r.usedGB, 0)}
                      </span>
                    </div>
                    {repoHasCapacity ? (
                      <div className="h-1.5 w-full overflow-hidden bg-muted/70">
                        <div
                          className={cn(
                            "h-full",
                            level === "critical"
                              ? "bg-danger"
                              : level === "warn"
                                ? "bg-warning"
                                : "bg-primary/70",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : (
                      /* A fill bar needs something to be full OF. */
                      <p className="text-[11px] text-muted-foreground">{t("storage.repoCapacityUnknown")}</p>
                    )}
                  </div>
                </Hint>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Tooltip body. The title is for the segments of the total bar, which are
 * unlabelled colour blocks — a row names itself an inch from the pointer, so
 * repeating it there would spend a line saying what the reader is looking at.
 */
function TipBody({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <span className="block">
      {title && <span className="block font-medium">{title}</span>}
      <span className={cn("block space-y-0.5", title && "mt-0.5 text-muted-foreground")}>{children}</span>
    </span>
  );
}

/**
 * The fill verdict in words, since the bar carries it in colour alone. `ok` says
 * nothing: the row already prints the percentage, and "58% used" under a row
 * reading "58%" is a line that tells the reader what they just read.
 */
function verdictKey(level: CapacityLevel): string | null {
  return level === "critical"
    ? "storage.tip.criticallyFull"
    : level === "warn"
      ? "storage.tip.runningLow"
      : null;
}
