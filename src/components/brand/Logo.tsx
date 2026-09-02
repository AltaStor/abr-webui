// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * AltaStor "Keystone" mark — a hexagonal containment seal enclosing three
 * stacked basalt strata. The seal = sealed/immutable (the boundary nothing
 * crosses); the strata read as a peak cooling downward: brightest (ice) on top
 * = newest restore point, graphite below = older recovery points. Regular
 * hexagon, miter joins, deliberately vertically centred — do not re-stretch or
 * recolour. Reference hexes are hardcoded per theme so the mark stays canonical
 * even when the user picks a different UI accent.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* containment seal */}
      <polygon
        points="48,8 82,28 82,68 48,88 14,68 14,28"
        fill="none"
        strokeWidth={4}
        strokeLinejoin="miter"
        className="stroke-[#9BAAB5] dark:stroke-[#43525C]"
      />
      {/* strata — cooling downward, ice peak on top */}
      <polygon points="38,52 58,52 68,63 58,74 38,74 28,63" className="fill-[#B4C2CB] dark:fill-[#3D4A54]" />
      <polygon points="38,37 58,37 68,48 58,59 38,59 28,48" className="fill-[#6E8494] dark:fill-[#6B7E8B]" />
      <polygon points="38,22 58,22 68,33 58,44 38,44 28,33" className="fill-[#26719A] dark:fill-[#A5D3E8]" />
    </svg>
  );
}

/**
 * Horizontal lockup — Keystone mark + the ALTASTOR wordmark. Wordmark is one
 * word, all caps, Outfit 700; "ALTA" in the primary text colour and "STOR" in
 * the brand accent (ice on dark, glacial on light). Descriptor set in mono.
 */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const { t } = useTranslation("components");
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-7 w-7" />
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="font-display text-[15px] font-bold uppercase leading-none tracking-[0.02em] text-foreground">
            ALTA<span className="text-primary">STOR</span>
          </span>
          <span className="mt-1 font-mono text-[8.5px] font-semibold uppercase leading-none tracking-[0.32em] text-muted-foreground">
            {t("brand.tagline")}
          </span>
        </div>
      )}
    </div>
  );
}
