// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { STEPS, stepIndex, type StepKey } from "../types";

interface StepRailProps {
  current: StepKey;
  /** Highest step index the user has reached — earlier steps stay clickable. */
  furthest: number;
  /** True while the manifest is applying — navigation is frozen. */
  locked: boolean;
  onSelect: (key: StepKey) => void;
}

/** Left-hand step list (horizontal strip on small screens). */
export function StepRail({ current, furthest, locked, onSelect }: StepRailProps) {
  const { t } = useTranslation("setup");
  const currentIdx = stepIndex(current);
  return (
    <nav aria-label={t("nav.stepsAria")} className="lg:sticky lg:top-6 lg:self-start">
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:pb-0">
        {STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const reachable = !locked && !active && i <= furthest;
          return (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(s.key)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : done
                      ? "text-foreground/80"
                      : "text-muted-foreground",
                  reachable && "hover:bg-muted/40",
                  !reachable && !active && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] font-semibold",
                    done
                      ? "border-success/40 bg-success-subtle text-success"
                      : active
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn("whitespace-nowrap font-medium", active && "text-foreground")}>
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
