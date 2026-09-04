// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  hydrateSettingsFromServer,
  useSettingsStore,
  type AppearanceSettings,
} from "@/store/settings";
import { SettingsRail } from "./components/SettingsRail";
import { AppearanceSection } from "./components/sections/AppearanceSection";
import { NotificationsSection } from "./components/sections/NotificationsSection";
import { SecuritySection } from "./components/sections/SecuritySection";
import { AboutSection } from "./components/sections/AboutSection";
import { SECTIONS, resolveSection, type SectionKey } from "./lib";

const SECTION_VIEW: Record<SectionKey, React.ComponentType> = {
  appearance: AppearanceSection,
  notifications: NotificationsSection,
  security: SecuritySection,
  about: AboutSection,
};

export default function SettingsPage() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const { section } = useParams<{ section: string }>();
  const active = resolveSection(section);

  // Respect the user's reduce-motion preference for the content transition.
  const reduceMotion = useSettingsStore((s: { appearance: AppearanceSettings }) => s.appearance.reduceMotion);

  const select = useCallback(
    (key: SectionKey) => {
      navigate(key === "appearance" ? "/settings" : `/settings/${key}`);
    },
    [navigate],
  );

  /* A failed `GET /settings` leaves the store holding shipped defaults or a
   * browser cache. Everything below would otherwise read as this appliance's
   * configuration — an organization, an SMTP relay, an enabled webhook, an IP
   * address — with nothing on screen saying it was never read. */
  const unreachable = useSettingsStore((s) => s.syncStatus === "unreachable");

  const meta = SECTIONS.find((s) => s.key === active);
  const View = SECTION_VIEW[active];

  return (
    <div>
      <PageHeader title={t("page.title")} description={t("page.description")} />

      {unreachable && (
        <div
          role="alert"
          className="mb-4 flex flex-col gap-3 border border-danger/30 bg-danger-subtle px-4 py-3 sm:flex-row sm:items-center"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-danger-text">{t("page.unreachable.title")}</div>
            <p className="text-xs text-danger-text/80">{t("page.unreachable.description")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void hydrateSettingsFromServer()}
          >
            {t("common:actions.retry")}
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsRail active={active} onSelect={select} />

        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            >
              {/* aria-live region label for context on the current section */}
              <span className="sr-only" aria-live="polite">
                {t("rail.sectionAnnounce", { section: meta?.label })}
              </span>
              <View />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
