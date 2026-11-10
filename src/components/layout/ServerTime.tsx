// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "@/lib/icons";
import { Hint } from "@/components/ui/tooltip";
import { getSystemClock, inBackground } from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useServerClockStore } from "@/store/serverClock";
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

/**
 * Keeps the console on server time: reads the appliance's zone and clock
 * (`GET /system/clock`) when the console connects and every few minutes, and
 * hands the zone to lib/time.ts through the server clock store. The demo
 * world has no appliance, so it stays on the browser's zone.
 */
function useServerClockReading() {
  const mode = useWorldStore((s) => s.mode);
  const ready = useWorldStore((s) => s.ready);
  const canRead = useCan("system.view");
  const setReading = useServerClockStore((s) => s.setReading);
  const live = mode === "live" && ready && canRead;

  useEffect(() => {
    if (mode === "sim") {
      setReading(null);
      return;
    }
    if (!live) return;
    let stopped = false;
    const read = () =>
      inBackground(getSystemClock)
        .then((clock) => {
          if (!stopped) setReading(clock.timezone, clock.serverTime);
        })
        .catch(() => undefined);
    read();
    const id = window.setInterval(read, READ_EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
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
  useServerClockReading();
  const skewMs = useServerClockStore((s) => s.skewMs);
  // Re-renders when the zone becomes known or the time format changes.
  useDateTimeFormat();
  const [now, setNow] = useState(() => Date.now());

  // The tooltip's "on your computer" line, in the console's language.
  useEffect(() => {
    setDisplayPreferences({ localSuffix: t("serverTime.onYourComputer") });
  }, [t]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const at = now + skewMs;
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
