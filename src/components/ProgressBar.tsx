// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { toneBg, type Tone } from "@/lib/status";

interface ProgressBarProps {
  value: number; // 0..100
  tone?: Tone;
  className?: string;
  /** Animated diagonal stripes — for active/running bars. */
  active?: boolean;
  size?: "sm" | "md" | "lg";
  /** Accessible name for the bar, surfaced as aria-label. */
  label?: string;
}

export function ProgressBar({ value, tone = "info", className, active, size = "md", label }: ProgressBarProps) {
  const { t } = useTranslation("components");
  const height = size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2";
  const clamped = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div
      className={cn("relative w-full overflow-hidden bg-muted/70", height, className)}
      role="progressbar"
      aria-label={label ?? t("progressBar.label")}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cn("relative h-full overflow-hidden", toneBg(tone))}
        initial={false}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      >
        {active && (
          <>
            {/* Soft light bands flowing toward the write head — data in motion. */}
            <div
              aria-hidden
              className="absolute inset-0 animate-data-flow"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent 0%, hsl(0 0% 100% / 0.22) 50%, transparent 100%)",
                backgroundSize: "34px 100%",
              }}
            />
            {/* The write head: a brighter, breathing leading edge where data lands. */}
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 w-6 animate-comet"
              style={{ backgroundImage: "linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.5))" }}
            />
          </>
        )}
      </motion.div>
    </div>
  );
}
