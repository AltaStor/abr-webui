// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";
import { formatDateTime, utcTitle, type FormatOptions, type TimeInput } from "@/lib/time";

/**
 * One absolute time, the way every screen prints one: in the display zone
 * with its label ("Oct 23, 01:00 GMT+3"), and the same moment in UTC on hover.
 * A `<time>` element, so assistive technology and tests get the ISO value.
 */
export function DateTime({
  value,
  className,
  ...options
}: { value: TimeInput; className?: string } & FormatOptions) {
  const date = value === null || value === undefined || value === "" ? null : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return <span className={className}>—</span>;
  return (
    <time dateTime={date.toISOString()} title={utcTitle(date)} className={cn("nums", className)}>
      {formatDateTime(date, options)}
    </time>
  );
}
