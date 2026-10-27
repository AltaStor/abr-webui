// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import * as React from "react";
import { cn } from "@/lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** For the scrolling wrapper: a max height turns it into a viewport whose
   *  `sticky` header cells stay in view. */
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerProps, ...props }, ref) => (
    <div {...containerProps} className={cn("relative w-full overflow-auto", containerProps?.className)}>
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />);
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border transition-colors duration-250 hover:bg-muted/40 data-[state=selected]:bg-muted/60",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      // A column header is a label, not prose: "VM size" broken into "VM" over
      // "size" reads as two headers. The table scrolls horizontally (see the
      // wrapper above), so keeping them on one line costs nothing.
      "h-10 whitespace-nowrap px-3 text-left align-middle font-display text-xs font-medium uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
));
TableCell.displayName = "TableCell";
