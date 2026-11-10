// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";
import type { FormatOptions, TimeInput } from "@/lib/time";
import { useDateTimeFormat } from "@/lib/useDateTimeFormat";

/**
 * One absolute time, the way every screen prints one: on server time
 * ("23 Oct 2026 01:00"), and the same moment in UTC (and on this computer,
 * when that reads differently) on hover.
 * A `<time>` element, so assistive technology and tests get the ISO value.
 */
export function DateTime({
  value,
  className,
  ...options
}: { value: TimeInput; className?: string } & FormatOptions) {
  const { formatDateTime, formatUtc } = useDateTimeFormat();
  const date = value === null || value === undefined || value === "" ? null : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return <span className={className}>—</span>;
  return (
    <time dateTime={date.toISOString()} title={formatUtc(date)} className={cn("nums", className)}>
      {formatDateTime(date, options)}
    </time>
  );
}
