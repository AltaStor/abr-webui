// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The appliance's clock as the console knows it: the zone of its operating
 * system, which every time in the console is printed in (server time, see
 * doc/TimeZones.md), and how far its clock is from this computer's, so the top
 * bar's "Server time" reads the appliance's clock rather than this one.
 *
 * The zone is cached in the browser, so after the first visit the first paint
 * is already on server time; until the appliance has answered once, the
 * browser's zone stands in.
 */
import { create } from "zustand";
import { AUTO_TIME_ZONE, isValidTimeZone, preferredZoneName, setDisplayPreferences } from "@/lib/time";

const CACHE_KEY = "abr.serverTimeZone";

interface ServerClockState {
  /** The appliance's IANA zone; null while not known. */
  zone: string | null;
  /** The appliance's clock minus this computer's, in milliseconds, at the
   *  last reading. */
  skewMs: number;
  /** A reading of `GET /system/clock`: its `timezone` and `server_time`. */
  setReading(zone: string | null, serverTime?: string | null): void;
}

function readCache(): string | null {
  try {
    const zone = localStorage.getItem(CACHE_KEY);
    return zone && isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

function writeCache(zone: string): void {
  try {
    localStorage.setItem(CACHE_KEY, zone);
  } catch {
    /* private window or blocked storage: the next visit waits for the reading */
  }
}

const cached = readCache();
setDisplayPreferences({ timeZone: cached ?? AUTO_TIME_ZONE });

export const useServerClockStore = create<ServerClockState>((set) => ({
  zone: cached,
  skewMs: 0,
  setReading: (zone, serverTime) => {
    const known = zone && isValidTimeZone(zone) ? preferredZoneName(zone) : null;
    const at = serverTime ? Date.parse(serverTime) : NaN;
    setDisplayPreferences({ timeZone: known ?? AUTO_TIME_ZONE });
    if (known) writeCache(known);
    set({ zone: known, skewMs: Number.isFinite(at) ? at - Date.now() : 0 });
  },
}));
