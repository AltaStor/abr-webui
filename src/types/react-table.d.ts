// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { ReactNode } from "react";
import type { RowData } from "@tanstack/react-table";

/* Global augmentation of TanStack's per-column `meta` bag. `DataTable` is the
 * only place that knows where a header's label ends and its sort chevron
 * begins, so the tooltip capability lives there and columns stay plain data. */
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Explanation shown on hover over the column header. Optional everywhere. */
    tooltip?: ReactNode;
    /** Align the header control and every cell in the column. */
    align?: "left" | "center" | "right";
  }
}
