// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Globe, Search } from "@/lib/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  allTimeZones,
  AUTO_TIME_ZONE,
  browserTimeZone,
  currentZoneName,
  isValidTimeZone,
  offsetMinutes,
  zonePickerLabel,
} from "@/lib/time";

/**
 * The display zone setting: "Auto (browser time zone)" first, then every zone
 * the browser knows by its offset today, so DST is the current one
 * ("(UTC +02:00) Kyiv"), west to east. Typing filters by city, IANA name or
 * offset.
 */
export function TimeZonePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (setting: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);

  // Recomputed on each opening: the offsets are today's.
  const zones = useMemo(() => {
    if (!open) return [];
    const now = Date.now();
    const names = allTimeZones();
    // A saved zone this browser lists under another name stays selectable.
    if (value !== AUTO_TIME_ZONE && isValidTimeZone(value) && !names.includes(value)) names.push(value);
    return names
      .map((zone) => ({ zone, offset: offsetMinutes(zone, now), label: zonePickerLabel(zone, now) }))
      .sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));
  }, [open, value]);

  const autoLabel = t("appearance.timeZone.auto");
  const browserLabel = zonePickerLabel(browserTimeZone());
  const auto = value === AUTO_TIME_ZONE || !isValidTimeZone(value);

  const choose = (setting: string) => {
    onChange(setting);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={t("appearance.timeZone.label")}
          data-testid="time-zone-picker"
          className="flex h-9 w-full items-center justify-between gap-2 border border-input bg-background/40 px-3 py-2 text-sm transition-colors duration-250"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">
              {auto ? `${t("appearance.timeZone.autoShort")} · ${browserLabel}` : zonePickerLabel(value)}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command
          defaultValue={auto ? AUTO_TIME_ZONE : value}
          filter={(item, search, keywords) => {
            const text = `${item} ${keywords?.join(" ") ?? ""}`.toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .every((word) => text.includes(word))
              ? 1
              : 0;
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              placeholder={t("appearance.timeZone.search")}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {t("appearance.timeZone.noMatch")}
            </Command.Empty>
            <Option
              value={AUTO_TIME_ZONE}
              keywords={[autoLabel, currentZoneName(browserTimeZone()), browserLabel]}
              selected={auto}
              onSelect={() => choose(AUTO_TIME_ZONE)}
            >
              <span className="truncate">{autoLabel}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{browserLabel}</span>
            </Option>
            {zones.map(({ zone, label }) => (
              <Option
                key={zone}
                value={zone}
                keywords={[label, currentZoneName(zone)]}
                selected={!auto && zone === value}
                onSelect={() => choose(zone)}
              >
                <span className="nums truncate">{label}</span>
                <span className="ml-auto shrink-0 truncate pl-3 text-xs text-muted-foreground">
                  {currentZoneName(zone)}
                </span>
              </Option>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Option({
  value,
  keywords,
  selected,
  onSelect,
  children,
}: {
  value: string;
  keywords: string[];
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="relative flex cursor-pointer items-center gap-2 py-1.5 pl-8 pr-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {selected && <Check className="h-4 w-4" />}
      </span>
      {children}
    </Command.Item>
  );
}
