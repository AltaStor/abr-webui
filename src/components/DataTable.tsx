// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Button } from "./ui/button";
import { HeaderHint, Hint } from "./ui/tooltip";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  initialSorting?: SortingState;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  globalFilter?: string;
  pageSize?: number;
  /**
   * Changing this returns the table to page 1.
   *
   * Pass whatever identifies the current filter set for a table that narrows
   * `data` itself — the built-in `globalFilter` already does this on its own.
   * Without it, a reader who filters from page 3 stays on page 3 of the new,
   * shorter result instead of seeing it from the top.
   */
  resetPageKey?: unknown;
  emptyState?: React.ReactNode;
  stickyHeader?: boolean;
  className?: string;
  rowClassName?: (row: TData) => string | undefined;
  /**
   * Size columns from their declared `size` instead of their content, so one
   * long value (a VM name, a host path) truncates with an ellipsis instead of
   * widening its column. Opt-in: tables whose columns carry no `size` still
   * read better auto-sized.
   *
   * The declared widths also become the table's minimum width, so a viewport
   * too narrow for them scrolls horizontally rather than crushing every column
   * into an unreadable sliver — truncation is for over-long *values*, not a
   * reason to deny the table the room it was designed for.
   */
  fixedLayout?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  onRowClick,
  initialSorting = [],
  enableRowSelection,
  rowSelection,
  onRowSelectionChange,
  globalFilter,
  pageSize = 12,
  resetPageKey,
  emptyState,
  stickyHeader,
  className,
  rowClassName,
  fixedLayout,
}: DataTableProps<TData>) {
  const { t } = useTranslation("components");
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      globalFilter,
      ...(rowSelection ? { rowSelection } : {}),
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange,
    enableRowSelection,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
    // The live driver re-hydrates the world every few seconds and hands us a
    // brand-new `data` array even when not a single row changed, which under
    // TanStack's default would reset the page index on every poll — that is
    // what kept throwing a reader on Inventory page 3 back to page 1 mid-read.
    // The page is managed explicitly below instead: reset it when the filters
    // change, clamp it when the list gets shorter, and otherwise leave it be.
    autoResetPageIndex: false,
  });

  // Sum of the declared column widths — the layout the columns were designed
  // for, used as the table's floor under a fixed layout (see `fixedLayout`).
  const minWidth = fixedLayout
    ? columns.reduce((sum, c) => sum + (typeof c.size === "number" ? c.size : 0), 0)
    : 0;

  // A filter change is the one thing that should send the reader back to the
  // top; a background refresh is not. (Returning the same object when already
  // on page 1 keeps this from re-rendering on mount.)
  useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [globalFilter, resetPageKey]);

  const totalRows = table.getFilteredRowModel().rows.length;
  const lastPageIndex = Math.max(0, Math.ceil(totalRows / pagination.pageSize) - 1);
  // Rows can vanish from under the current page — a filter narrows, a job is
  // deleted, a VM leaves the estate. Land on the last page that still exists.
  // Adjusting during render (rather than in an effect) means React re-renders
  // before painting, so the stale empty page is never shown.
  if (pagination.pageIndex > lastPageIndex) {
    setPagination((p) => ({ ...p, pageIndex: lastPageIndex }));
  }

  const rows = table.getRowModel().rows;
  const pageIndex = pagination.pageIndex;
  const showPagination = totalRows > pageSize;

  return (
    <div className={cn("rounded-xl border border-border/70 bg-card shadow-card", className)}>
      <Table
        className={cn(fixedLayout && "table-fixed")}
        style={minWidth > 0 ? { minWidth } : undefined}
      >
        <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-card")}>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const tooltip = header.column.columnDef.meta?.tooltip;
                const label = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                const sortControl = canSort ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 select-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {label}
                    {sorted === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : sorted === "desc" ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                ) : null;
                return (
                  <TableHead
                    key={header.id}
                    className={cn(fixedLayout && "overflow-hidden")}
                    style={{ width: header.column.columnDef.size != null ? header.getSize() : undefined }}
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      canSort ? (
                        tooltip ? <Hint label={tooltip}>{sortControl}</Hint> : sortControl
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {tooltip ? <HeaderHint label={tooltip}>{label}</HeaderHint> : label}
                        </span>
                      )
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-48 p-0">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cn(fixedLayout && "overflow-hidden")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {showPagination && (
        <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          <span className="nums">
            {t("dataTable.range", {
              start: totalRows === 0 ? 0 : pageIndex * pageSize + 1,
              end: Math.min((pageIndex + 1) * pageSize, totalRows),
              total: totalRows,
            })}
            {enableRowSelection && rowSelection && Object.keys(rowSelection).length > 0 && (
              <span className="ml-2 text-primary">· {t("dataTable.selected", { count: Object.keys(rowSelection).length })}</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label={t("dataTable.previousPage")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="nums px-1">
              {pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label={t("dataTable.nextPage")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
