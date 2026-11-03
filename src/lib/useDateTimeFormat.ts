// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo } from "react";
import { useSettingsStore } from "@/store/settings";
import { formatDate, formatDateTime, formatTime, userTimeZone, utcTitle } from "@/lib/time";

/**
 * The console's time formatting for a component, which re-renders when the
 * user saves another time zone, date format or time format in Settings →
 * Appearance. The functions are lib/time.ts's own; a plain function that
 * calls those directly prints the same, it just is not told of a change.
 */
export function useDateTimeFormat() {
  const timeZone = useSettingsStore((s) => s.appearance.timeZone);
  const dateFormat = useSettingsStore((s) => s.appearance.dateFormat);
  const timeFormat = useSettingsStore((s) => s.appearance.timeFormat);
  return useMemo(
    () => ({
      /** The display zone: the user's pick, or the browser's on "Auto". */
      zone: userTimeZone(),
      timeZone,
      dateFormat,
      timeFormat,
      formatDate,
      formatTime,
      formatDateTime,
      /** The same moment in UTC: "22/10/2026 22:00:03 UTC". */
      formatUtc: utcTitle,
    }),
    [timeZone, dateFormat, timeFormat],
  );
}
