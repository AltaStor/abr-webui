// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

/**
 * True for anything rendered inside a <KpiBand>. A KpiCard reads it to drop its
 * own frame, so no call site has to pass a prop to say where it lives.
 */
export const KpiBandContext = createContext(false);

export const useInKpiBand = () => useContext(KpiBandContext);

interface KpiBandProps {
  children: React.ReactNode;
  /**
   * Override the column rule (e.g. a five-stat band). Pick counts that divide
   * the number of cells: a leftover slot has no cell to paint it, so it shows
   * the band's hairline colour as a filled block.
   */
  className?: string;
}

/**
 * The stats band: one framed block divided into cells, rather than a row of
 * separately floating cards.
 *
 * The cell hairlines are the band's own background showing through 1px grid
 * gaps, which is what keeps them exact at every breakpoint — a per-cell border
 * would double up on wrap, and a directional border would need a different rule
 * per column count. Cells therefore have to paint an opaque surface (bg-card);
 * a transparent cell reads as a filled block of hairline colour.
 */
export function KpiBand({ children, className }: KpiBandProps) {
  return (
    <KpiBandContext.Provider value={true}>
      <div
        className={cn(
          "grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4",
          className,
        )}
      >
        {children}
      </div>
    </KpiBandContext.Provider>
  );
}
