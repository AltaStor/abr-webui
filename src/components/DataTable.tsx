// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useId, useState } from "react";
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
}: DataTableProps<TData>) {
  const { t } = useTranslation("components");
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });
  /* Namespaces the per-row cell ids that give a clickable row its accessible
   * name, so two tables on one page (tabs, a detail pane beside a list) can't
   * collide on `id`. */
  const labelPrefix = useId();

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
    <div className={cn("border border-border bg-card", className)}>
      <Table>
        <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-card")}>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const tooltip = header.column.columnDef.meta?.tooltip;
                const align = header.column.columnDef.meta?.align ?? "left";
                const alignmentClass =
                  align === "right"
                    ? "justify-end text-right"
                    : align === "center"
                      ? "justify-center text-center"
                      : "justify-start text-left";
                const label = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                const sortControl = canSort ? (
                  <button
                    type="button"
                    className={cn("inline-flex w-full select-none items-center gap-1", alignmentClass)}
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
                    style={{ width: header.column.columnDef.size != null ? header.getSize() : undefined }}
                    className={cn(align === "right" && "text-right", align === "center" && "text-center")}
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      canSort ? (
                        tooltip ? <Hint label={tooltip}>{sortControl}</Hint> : sortControl
                      ) : (
                        <span className={cn("inline-flex w-full items-center gap-1", alignmentClass)}>
                          {tooltip ? <HeaderHint label={tooltip}>{label}</HeaderHint> : label}
                        </span>
                      )
                    )}
                  </TableHead>
                );
              })}
              {/* Header slot for the drill-in chevron. Empty like any action
                  column, but always present so the affordance costs no layout
                  shift when it fades in. */}
              {onRowClick && <TableHead className="w-8 px-0" />}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length + (onRowClick ? 1 : 0)} className="h-48 p-0">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const cells = row.getVisibleCells();
              /* The row's accessible name comes from its first *data* cell — the
               * name/identity column. Display columns (a selection checkbox, a
               * kebab menu) carry no accessor, so they're skipped; without this
               * a selectable table would announce every row as "checkbox". */
              const labelCell = cells.find((c) => c.column.accessorFn) ?? cells[0];
              const labelId = labelCell ? `${labelPrefix}${row.id}-name` : undefined;
              /* A row that opens something is a control, and a control has to be
               * reachable from the keyboard: without this, Inventory, Jobs and a
               * job's objects could only be opened with a mouse (WCAG 2.1.1).
               * Built inside the `onRowClick` branch so the handler is narrowed
               * to non-null, and omitted entirely for a non-clickable row — an
               * inert tab stop is worse than none. */
              const interactive = onRowClick
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-labelledby": labelId,
                    onClick: () => onRowClick(row.original),
                    onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                      // A checkbox or a kebab menu inside the row owns its own
                      // keys; only act when the row itself holds focus.
                      if (e.target !== e.currentTarget) return;
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      onRowClick(row.original);
                    },
                  }
                : {};
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(onRowClick && "group/row cursor-pointer", rowClassName?.(row.original))}
                  {...interactive}
                >
                  {cells.map((cell) => (
                    <TableCell
                      key={cell.id}
                      id={labelId && cell === labelCell ? labelId : undefined}
                      className={cn(
                        cell.column.columnDef.meta?.align === "right" && "text-right",
                        cell.column.columnDef.meta?.align === "center" && "text-center",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                  {/* The row says "I open something" only while it is pointed
                      at or focused. Keyboard focus counts: the row is a
                      role="button" tab stop, so without the focus half a
                      keyboard user would never see the affordance at all. The
                      icon is decorative — the row already has an accessible
                      name and a role. */}
                  {onRowClick && (
                    <TableCell className="w-8 px-0 text-right">
                      <ChevronRight
                        aria-hidden="true"
                        className="mr-2 inline-block h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-250 ease-brand group-hover/row:opacity-100 group-focus-visible/row:opacity-100"
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {showPagination && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
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
