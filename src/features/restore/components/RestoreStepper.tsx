// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Check } from "@/lib/icons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface StepDef {
  id: number;
  label: string;
  /** Optional second line. The restore wizard's step names stand alone; the
   *  import wizard still qualifies each step with one. */
  hint?: string;
}

interface RestoreStepperProps {
  steps: StepDef[];
  current: number;
  /** Allow jumping back to an already-completed step. */
  onStepClick?: (id: number) => void;
}

/** Horizontal numbered stepper that mirrors the calm dashboard styling. */
export function RestoreStepper({ steps, current, onStepClick }: RestoreStepperProps) {
  const { t } = useTranslation("restore");
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label={t("stepper.aria")}>
      {steps.map((step, i) => {
        const done = step.id < current;
        const active = step.id === current;
        const clickable = done && !!onStepClick;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-1 sm:gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(step.id)}
              aria-current={active ? "step" : undefined}
              title={step.label}
              className={cn(
                "group flex min-w-0 flex-1 items-center gap-3 border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary/40 bg-primary/[0.06]"
                  : done
                    ? "border-border bg-card"
                    : "border-dashed border-border bg-transparent",
                clickable && "hover:border-primary/40 hover:bg-primary/[0.04] cursor-pointer",
                !clickable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-7 shrink-0 items-center justify-center text-xs font-semibold transition-colors",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary/15 text-primary ring-2 ring-primary/30"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? (
                  <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    <Check className="h-4 w-4" />
                  </motion.span>
                ) : (
                  step.id
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    active ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {step.hint && (
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{step.hint}</span>
                )}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn("hidden h-px w-4 shrink-0 sm:block", done ? "bg-primary/40" : "bg-border")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
