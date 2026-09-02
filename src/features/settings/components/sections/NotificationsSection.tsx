// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { AlertTriangle, Bell, CheckCircle2, DatabaseBackup, RotateCcw } from "@/lib/icons";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSettingsStore, type NotificationEvents } from "@/store/settings";
import type { LucideIcon } from "@/lib/icons";
import i18n from "@/i18n";
import { SettingsSection } from "../SettingsSection";
import { SaveBar } from "../controls";
import { useDraft } from "../../lib";

/* -------------------------------------------------------------------------- */

interface EventsDraft {
  events: NotificationEvents;
}

const EVENT_META: { key: keyof NotificationEvents; label: string; blurb: string; icon: LucideIcon }[] = [
  { key: "jobFailure", get label() { return i18n.t("settings:notifications.events.jobFailure.label"); }, get blurb() { return i18n.t("settings:notifications.events.jobFailure.blurb"); }, icon: AlertTriangle },
  { key: "jobSuccess", get label() { return i18n.t("settings:notifications.events.jobSuccess.label"); }, get blurb() { return i18n.t("settings:notifications.events.jobSuccess.blurb"); }, icon: CheckCircle2 },
  { key: "capacityWarning", get label() { return i18n.t("settings:notifications.events.capacityWarning.label"); }, get blurb() { return i18n.t("settings:notifications.events.capacityWarning.blurb"); }, icon: DatabaseBackup },
  { key: "restoreCompleted", get label() { return i18n.t("settings:notifications.events.restoreCompleted.label"); }, get blurb() { return i18n.t("settings:notifications.events.restoreCompleted.blurb"); }, icon: RotateCcw },
];

/* -------------------------------------------------------------------------- */

export function NotificationsSection() {
  const { t } = useTranslation("settings");
  const events = useSettingsStore((s) => s.notifications.events);

  const updateEvents = useSettingsStore((s) => s.updateEvents);

  const { draft, patch, dirty, reset } = useDraft<EventsDraft>({ events });

  const setEvent = (k: keyof NotificationEvents, v: boolean) => patch({ events: { ...draft.events, [k]: v } });

  const save = () => {
    updateEvents(draft.events);
    toast.success(t("saved.title"), { description: t("notifications.savedDescription") });
  };

  return (
    <SettingsSection
      title={t("notifications.events.title")}
      description={t("notifications.events.description")}
      icon={Bell}
      footer={<SaveBar dirty={dirty} onSave={save} onDiscard={reset} />}
    >
      <div className="grid gap-2 py-3 sm:grid-cols-2">
        {EVENT_META.map(({ key, label, blurb, icon: Icon }) => {
          const on = draft.events[key];
          return (
            <label
              key={key}
              htmlFor={`ev-${key}`}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                on ? "border-primary/30 bg-primary/[0.04]" : "border-border/60 hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  on ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="truncate text-xs text-muted-foreground" title={blurb}>{blurb}</div>
              </div>
              <Switch
                id={`ev-${key}`}
                checked={on}
                onCheckedChange={(v) => setEvent(key, v)}
                aria-label={label}
              />
            </label>
          );
        })}
      </div>
    </SettingsSection>
  );
}
