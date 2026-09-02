// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Check, Moon, Palette, Sun } from "@/lib/icons";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import type { AccentKey, Language } from "@/types";
import { LANGUAGES } from "@/i18n/languages";
import { SettingsSection, SettingDivider } from "../SettingsSection";
import { SettingRow } from "../SettingRow";
import { Segmented, SaveBar } from "../controls";
import { ACCENT_SWATCHES, useDraft } from "../../lib";

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
  const { accent } = appearance;
  const { draft, patch, dirty, reset } = useDraft({ accent });

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
      <SettingRow label={t("appearance.language.label")} description={t("appearance.language.description")}>
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
        "group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active ? "border-transparent ring-2 ring-offset-2 ring-offset-background" : "border-border/70 hover:scale-105",
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
