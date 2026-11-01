// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Globe } from "@/lib/icons";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { qk } from "@/lib/query";
import { zonedScheduleTime, type ScheduleDays } from "@/lib/schedule";
import { allTimeZones, scheduleZoneName, userTimeZone, UTC, zoneLabel } from "@/lib/time";
import { getSystemClock } from "@/services/api.http";
import { useWorldStore } from "@/store/world";

/** The appliance's own zone (GET /system/clock), or null before it answers,
 *  outside live mode, and from an appliance that does not report one. */
export function useApplianceTimeZone(): string | null {
  const live = useWorldStore((s) => s.mode === "live" && s.ready);
  const { data } = useQuery({
    queryKey: qk.systemClock,
    queryFn: getSystemClock,
    enabled: live,
    staleTime: 5 * 60_000,
  });
  return live ? (data?.timezone ?? null) : null;
}

/**
 * The zone a job's schedule times are read in. Offers the viewer's own zone,
 * the appliance's and UTC first, then every zone the browser knows; a zone the
 * job came with stays selectable even if this browser does not know it.
 */
export function TimeZoneField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (zone: string) => void;
}) {
  const { t } = useTranslation("jobs");
  const appliance = useApplianceTimeZone();
  const user = userTimeZone();
  const suggested = useMemo(
    () => [...new Set([user, appliance, UTC].filter((z): z is string => !!z))],
    [user, appliance],
  );
  const others = useMemo(() => {
    const all = allTimeZones().filter((z) => !suggested.includes(z));
    return value && !suggested.includes(value) && !all.includes(value) ? [value, ...all] : all;
  }, [suggested, value]);

  const describe = (zone: string) => {
    const tags = [
      zone === user ? t("create.timezone.yours") : null,
      zone === appliance ? t("create.timezone.appliance") : null,
    ].filter(Boolean);
    const offset = zoneLabel(zone);
    const name = scheduleZoneName(zone) === offset ? offset : `${scheduleZoneName(zone)} (${offset})`;
    return tags.length ? `${name} · ${tags.join(", ")}` : name;
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("create.timezone.label")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-72" data-testid="job-timezone">
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectGroup>
            <SelectLabel>{t("create.timezone.suggested")}</SelectLabel>
            {suggested.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {describe(zone)}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>{t("create.timezone.all")}</SelectLabel>
            {others.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {describe(zone)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

/** What a schedule time means on the viewer's own clock, under the field
 *  that sets it. */
export function ZoneExplanation({
  atTime,
  zone,
  days,
  className,
}: {
  atTime: string;
  zone: string | undefined;
  days: ScheduleDays;
  className?: string;
}) {
  const { t } = useTranslation("jobs");
  const zoned = zonedScheduleTime(atTime, zone, days);
  let text: string;
  if (!zoned.viewerTime) text = t("create.timezone.explainSame", { time: zoned.time });
  else if (zoned.dayShift > 0) text = t("create.timezone.explainNextDay", { time: zoned.time, viewer: zoned.viewerTime });
  else if (zoned.dayShift < 0) text = t("create.timezone.explainPreviousDay", { time: zoned.time, viewer: zoned.viewerTime });
  else text = t("create.timezone.explain", { time: zoned.time, viewer: zoned.viewerTime });
  return (
    <p className={className ?? "text-xs text-muted-foreground"} data-testid="zone-explanation">
      {text}
    </p>
  );
}
