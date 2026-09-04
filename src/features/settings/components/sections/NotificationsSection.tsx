// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { AlertTriangle, Bell, CheckCircle2, DatabaseBackup, RotateCcw } from "@/lib/icons";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSettingsStore, type NotificationEvents } from "@/store/settings";
import type { LucideIcon } from "@/lib/icons";
import i18n from "@/i18n";
import { SettingsSection } from "../SettingsSection";
import { OfflineNotice, toastSettingSaved, useSettingsOffline } from "../controls";

/* -------------------------------------------------------------------------- */

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
  const offline = useSettingsOffline();

  /* This section is nothing but switches, and a switch IS the commit: by the
     time it has moved the operator has said everything they had to say. The
     Save / Discard bar that used to sit underneath asked them to confirm that
     again — and let four flipped switches be lost by navigating away, since
     nothing was written until Save. So each switch writes on change. The
     confirmation is one coalesced toast rather than four; the choice is still
     only RECORDED, which the notice above says plainly. */
  const setEvent = (k: keyof NotificationEvents, v: boolean) => {
    updateEvents({ [k]: v });
    toastSettingSaved(t("saved.title"), t("notifications.savedDescription"));
  };

  return (
    <SettingsSection
      title={t("notifications.events.title")}
      description={t("notifications.events.description")}
      icon={Bell}
      // No save bar: there is nothing here that needs one. What the bar did
      // still matter for is the unreachable appliance, which is all that is
      // left in the footer — and only when it happens.
      footer={offline ? <OfflineNotice /> : undefined}
    >
      <div className="grid gap-2 py-3 sm:grid-cols-2">
        {EVENT_META.map(({ key, label, blurb, icon: Icon }) => {
          const on = events[key];
          return (
            <label
              key={key}
              htmlFor={`ev-${key}`}
              className={cn(
                "flex items-center gap-3 border p-3 transition-colors",
                offline ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                on ? "border-primary/30 bg-primary/[0.04]" : "border-border hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center",
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
                disabled={offline}
                aria-label={label}
              />
            </label>
          );
        })}
      </div>
    </SettingsSection>
  );
}
