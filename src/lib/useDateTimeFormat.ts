// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo } from "react";
import { useSettingsStore } from "@/store/settings";
import { useServerClockStore } from "@/store/serverClock";
import { displayTimeZone, formatDate, formatDateTime, formatTime, utcTitle } from "@/lib/time";

/**
 * The console's time formatting for a component, which re-renders when the
 * appliance's zone becomes known or the user saves another date or time format
 * in Settings → Appearance. The functions are lib/time.ts's own; a plain
 * function that calls those directly prints the same, it just is not told of
 * a change.
 */
export function useDateTimeFormat() {
  const serverZone = useServerClockStore((s) => s.zone);
  const dateFormat = useSettingsStore((s) => s.appearance.dateFormat);
  const timeFormat = useSettingsStore((s) => s.appearance.timeFormat);
  return useMemo(
    () => ({
      /** Server time's zone, or the browser's while it is not known. */
      zone: displayTimeZone(),
      serverZone,
      dateFormat,
      timeFormat,
      formatDate,
      formatTime,
      formatDateTime,
      /** The same moment in UTC, and on this computer when that differs. */
      formatUtc: utcTitle,
    }),
    [serverZone, dateFormat, timeFormat],
  );
}
