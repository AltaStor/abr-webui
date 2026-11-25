// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ (AltaStor.com)

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "@/lib/icons";
import { Hint } from "@/components/ui/tooltip";
import { getSystemClock, inBackground } from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useServerClockStore, useServerNow } from "@/store/serverClock";
import { useAuthStore } from "@/store/auth";
import { useWorldStore } from "@/store/world";
import { useDateTimeFormat } from "@/lib/useDateTimeFormat";
import {
  UTC,
  browserTimeZone,
  displayTimeZone,
  formatDateTime,
  formatTime,
  offsetMinutes,
  scheduleZoneName,
  setDisplayPreferences,
  utcOffsetLabel,
  zoneCity,
} from "@/lib/time";

/** How often the appliance's clock is read again: its zone almost never
 *  changes, and the clock ticks here between readings. */
const READ_EVERY_MS = 10 * 60_000;
/** After a failed reading, how long until the next try: soon at first, since
 *  every time on screen waits for the zone. */
const RETRY_AFTER_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * Keeps the console on server time: reads the appliance's zone and clock
 * (`GET /system/clock`) as soon as there is a session, and every few minutes
 * after, and hands the zone to lib/time.ts through the server clock store.
 * It does not wait for the world's first load: on an appliance with much to
 * load, a page that fetches its own data (Logs → System log) drew it in the
 * browser's zone until that load ended (ABR-615). A failed reading is tried
 * again within seconds. The demo world has no appliance, so it stays on the
 * browser's zone.
 */
function useServerClockReading() {
  const mode = useWorldStore((s) => s.mode);
  const signedIn = useAuthStore((s) => s.status === "signed-in");
  const canRead = useCan("system.view");
  const setReading = useServerClockStore((s) => s.setReading);
  const live = mode === "live" && signedIn && canRead;

  useEffect(() => {
    if (mode === "sim") {
      setReading(null);
      return;
    }
    if (!live) return;
    let stopped = false;
    let timer = 0;
    let failures = 0;
    const read = () =>
      inBackground(getSystemClock)
        .then((clock) => {
          if (stopped) return;
          failures = 0;
          setReading(clock.timezone, clock.serverTime);
          timer = window.setTimeout(read, READ_EVERY_MS);
        })
        .catch(() => {
          if (stopped) return;
          const wait = RETRY_AFTER_MS[Math.min(failures, RETRY_AFTER_MS.length - 1)];
          failures++;
          timer = window.setTimeout(read, wait);
        });
    void read();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [mode, live, setReading]);
}

/**
 * "Server time 16:08 · Tallinn (UTC+2)": the one place the console names the
 * zone every time on it is printed in, so no time needs a label of its own.
 * Its tooltip gives the zone by name, the time in UTC and, when the viewer's
 * computer is on another clock, the time there.
 */
export function ServerTime() {
  const { t } = useTranslation("layout");
  const mode = useWorldStore((s) => s.mode);
  const serverZone = useServerClockStore((s) => s.zone);
  useServerClockReading();
  // Re-renders when the zone becomes known or the time format changes.
  useDateTimeFormat();
  // The appliance's clock, turning over with its minute.
  const at = useServerNow();

  // The tooltip's "on your computer" line, in the console's language.
  useEffect(() => {
    setDisplayPreferences({ localSuffix: t("serverTime.onYourComputer") });
  }, [t]);

  // Until the appliance has named its zone, the time here would be the
  // browser's under the words "Server time": say nothing instead. The demo
  // world has no appliance, so its server time is the browser's.
  if (mode !== "sim" && serverZone === null) return null;

  const zone = displayTimeZone();
  const offset = utcOffsetLabel(offsetMinutes(zone, at));
  const isUtc = scheduleZoneName(zone) === UTC;
  const place = isUtc ? UTC : `${zoneCity(zone)} (${offset})`;
  const local = browserTimeZone();
  const localDiffers = offsetMinutes(local, at) !== offsetMinutes(zone, at);

  const tooltip = (
    <span className="block max-w-xs space-y-1">
      <span className="block">
        {t("serverTime.zone", { zone: isUtc ? UTC : `${scheduleZoneName(zone)} (${offset})` })}
      </span>
      <span className="block text-muted-foreground">
        {t("serverTime.utc", { time: formatDateTime(at, { zone: UTC }) })}
      </span>
      {localDiffers && (
        <span className="block text-muted-foreground">
          {t("serverTime.local", {
            time: formatDateTime(at, { zone: local }),
            zone: `${scheduleZoneName(local)}, ${utcOffsetLabel(offsetMinutes(local, at))}`,
          })}
        </span>
      )}
    </span>
  );

  return (
    <Hint label={tooltip} side="bottom">
      <span
        tabIndex={0}
        data-testid="server-time"
        className="hidden shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground md:inline-flex"
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        <span>{t("serverTime.label")}</span>
        <time dateTime={new Date(at).toISOString()} className="nums font-medium text-foreground">
          {formatTime(at)}
        </time>
        <span aria-hidden>·</span>
        <span>{place}</span>
      </span>
    </Hint>
  );
}
