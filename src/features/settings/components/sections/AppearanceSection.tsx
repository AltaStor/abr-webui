// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ (AltaStor.com)

import { useTranslation } from "react-i18next";
import { Check, Moon, Palette, Sun } from "@/lib/icons";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import type { AccentKey, DateFormat, Language, TimeFormat } from "@/types";
import { LANGUAGES, languageMeta } from "@/i18n/languages";
import { SettingsSection, SettingDivider } from "../SettingsSection";
import { SettingRow } from "../SettingRow";
import { Switch } from "@/components/ui/switch";
import { Segmented, SaveBar } from "../controls";
import { ACCENT_SWATCHES, useDraft } from "../../lib";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";
import { useDateTimeFormat } from "@/lib/useDateTimeFormat";
import { useServerNow } from "@/store/serverClock";

/** In the order they are offered: the spelled month first, the numeric
 *  ones after it. The format is its own name. */
const DATE_FORMATS: DateFormat[] = ["D MMM YYYY", "MMM D, YYYY", "YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"];
const TIME_FORMATS: { value: TimeFormat; key: string }[] = [
  { value: "24h", key: "h24" },
  { value: "12h", key: "h12" },
];

/** An option as the design has it: how a time reads in the format on the
 *  left, the format's name on the right, muted; the check after both. The
 *  trigger shows the same two, side by side. */
const formatItemClass =
  "group data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary data-[highlighted]:data-[state=checked]:bg-primary/15 data-[highlighted]:data-[state=checked]:text-primary";

function FormatOption({ sample, name }: { sample: string; name: string }) {
  return (
    <span className="flex w-full items-baseline justify-between gap-4">
      <span className="nums whitespace-nowrap">{sample}</span>
      <span className="nums whitespace-nowrap text-xs text-muted-foreground group-data-[state=checked]:text-primary/70">
        {name}
      </span>
    </span>
  );
}

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  // Theme is global + applied instantly, so it lives outside the draft.
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const appearance = useSettingsStore((s) => s.appearance);
  const updateAppearance = useSettingsStore((s) => s.updateAppearance);
  // Language applies instantly like Theme, so keep it OUT of the Save/Discard
  // draft — switching it must not re-seed and clobber other unsaved edits.
  const language = appearance.language;
  const { density, reduceMotion, accent, sidebarAutoCollapse, dateFormat, timeFormat } = appearance;
  const { draft, patch, dirty, reset } = useDraft({
    density,
    reduceMotion,
    accent,
    sidebarAutoCollapse,
    dateFormat,
    timeFormat,
  });
  // How a time reads with the formats as picked, saved or not: the
  // appliance's clock now, on server time, as the top bar has it. The hook
  // draws the note again once the appliance has named its zone — until then
  // the browser's stands in (ABR-576).
  useDateTimeFormat();
  const now = useServerNow();
  const example = formatDateTime(now, {
    dateFormat: draft.dateFormat,
    timeFormat: draft.timeFormat,
  });

  const save = () => {
    updateAppearance(draft);
    toast.success(t("saved.title"), { description: t("appearance.savedDescription") });
  };

  return (
    <SettingsSection
      title={t("appearance.title")}
      description={t("appearance.description")}
      icon={Palette}
      footer={<SaveBar dirty={dirty} onSave={save} onDiscard={reset} />}
    >
      {/* The console ships one language today (see i18n/languages.ts), and a
          dropdown with a single option is a control that cannot be operated —
          it invites a click and then refuses to do anything. While LANGUAGES
          holds one entry this states the language instead; add a second entry
          there and the select comes back on its own. */}
      <SettingRow label={t("appearance.language.label")} description={t("appearance.language.description")}>
        {LANGUAGES.length > 1 ? (
          <Select value={language} onValueChange={(v) => updateAppearance({ language: v as Language })}>
            <SelectTrigger className="w-full sm:w-56" aria-label={t("appearance.language.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.nativeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex h-9 items-center text-sm text-muted-foreground sm:justify-end">
            {languageMeta(language).nativeName}
          </span>
        )}
      </SettingRow>

      <SettingDivider />

      {/* The formats every printed time uses (doc/TimeZones.md); they save
          with the section, like the rest of it. The zone is not a setting:
          every time is server time, which the top bar names. */}
      <SettingRow label={t("appearance.dateFormat.label")} description={t("appearance.dateFormat.description", { example })}>
        <Select value={draft.dateFormat} onValueChange={(v) => patch({ dateFormat: v as DateFormat })}>
          <SelectTrigger className="w-full" aria-label={t("appearance.dateFormat.label")} data-testid="date-format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_FORMATS.map((f) => (
              <SelectItem key={f} value={f} indicator="end" className={formatItemClass}>
                <FormatOption sample={formatDate(now, { dateFormat: f })} name={f} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingDivider />

      <SettingRow label={t("appearance.timeFormat.label")} description={t("appearance.timeFormat.description")}>
        <Select value={draft.timeFormat} onValueChange={(v) => patch({ timeFormat: v as TimeFormat })}>
          <SelectTrigger className="w-full" aria-label={t("appearance.timeFormat.label")} data-testid="time-format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_FORMATS.map((f) => (
              <SelectItem key={f.value} value={f.value} indicator="end" className={formatItemClass}>
                <FormatOption
                  sample={formatTime(now, { timeFormat: f.value })}
                  name={t(`appearance.timeFormat.${f.key}`)}
                />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingDivider />

      <SettingRow label={t("appearance.theme.label")} description={t("appearance.theme.description")}>
        <Segmented
          aria-label={t("appearance.theme.label")}
          value={theme}
          onChange={(v) => setTheme(v)}
          options={[
            { value: "dark", label: t("appearance.theme.dark"), icon: <Moon className="h-3.5 w-3.5" /> },
            { value: "light", label: t("appearance.theme.light"), icon: <Sun className="h-3.5 w-3.5" /> },
          ]}
        />
      </SettingRow>
      <SettingDivider />

      <SettingRow
        label={t("appearance.accent.label")}
        description={t("appearance.accent.description")}
        stacked
      >
        <div className="flex flex-wrap gap-2.5 pt-1">
          {ACCENT_SWATCHES.map((sw) => (
            <AccentSwatchButton
              key={sw.key}
              swatch={sw}
              active={draft.accent === sw.key}
              onSelect={() => patch({ accent: sw.key })}
            />
          ))}
        </div>
      </SettingRow>
      <SettingDivider />

      <SettingRow label={t("appearance.density.label")} description={t("appearance.density.description")}>
        <Segmented
          aria-label={t("appearance.density.label")}
          value={draft.density}
          onChange={(v) => patch({ density: v })}
          options={[
            { value: "comfortable", label: t("appearance.density.comfortable") },
            { value: "compact", label: t("appearance.density.compact") },
          ]}
        />
      </SettingRow>
      <SettingDivider />

      <SettingRow
        label={t("appearance.reduceMotion.label")}
        description={t("appearance.reduceMotion.description")}
        htmlFor="ap-motion"
      >
        <div className="flex justify-start sm:justify-end">
          <Switch
            id="ap-motion"
            checked={draft.reduceMotion}
            onCheckedChange={(v) => patch({ reduceMotion: v })}
            aria-label={t("appearance.reduceMotion.label")}
          />
        </div>
      </SettingRow>
      <SettingDivider />

      <SettingRow
        label={t("appearance.autoCollapse.label")}
        description={t("appearance.autoCollapse.description")}
        htmlFor="ap-collapse"
      >
        <div className="flex justify-start sm:justify-end">
          <Switch
            id="ap-collapse"
            checked={draft.sidebarAutoCollapse}
            onCheckedChange={(v) => patch({ sidebarAutoCollapse: v })}
            aria-label={t("appearance.autoCollapse.label")}
          />
        </div>
      </SettingRow>
    </SettingsSection>
  );
}

function AccentSwatchButton({
  swatch,
  active,
  onSelect,
}: {
  swatch: { key: AccentKey; label: string; hsl: string };
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={swatch.label}
      title={swatch.label}
      className={cn(
        "group relative flex h-10 w-10 items-center justify-center border transition-transform duration-250",
        active ? "border-transparent ring-2 ring-offset-2 ring-offset-background" : "border-border hover:scale-105",
      )}
      style={{
        backgroundColor: `hsl(${swatch.hsl} / ${active ? 1 : 0.9})`,
        ...(active ? ({ "--tw-ring-color": `hsl(${swatch.hsl})` } as React.CSSProperties) : {}),
      }}
    >
      {active && <Check className="h-4 w-4 text-white drop-shadow" />}
    </button>
  );
}
