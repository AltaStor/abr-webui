// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleSlash } from "@/lib/icons";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

/**
 * What a route says when the console ships its UI but this orchestrator can't
 * back it.
 *
 * The alternative — a silent `<Navigate to="/" />` — is the worst of the three
 * options. Hiding a nav entry is honest (the feature isn't offered), and
 * explaining is honest (the feature isn't available *here*), but redirecting a
 * bookmark or a documented link to the dashboard with no message reads as the
 * console losing the page. Somebody arriving here typed the address or followed
 * a link, so they already believe the feature exists; the only useful answer is
 * to say plainly that it does not, on this appliance.
 */
export function FeatureUnavailable({
  titleKey,
  descriptionKey,
}: {
  titleKey: string;
  descriptionKey: string;
}) {
  const { t } = useTranslation("common");
  return (
    <EmptyState
      icon={CircleSlash}
      title={t(titleKey)}
      description={t(descriptionKey)}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/">{t("routeError.back")}</Link>
        </Button>
      }
    />
  );
}

/**
 * What a page says to a user whose role does not allow it — a deep link or a
 * bookmark into a part of the console the sidebar no longer offers them.
 */
export function NotPermitted() {
  return (
    <FeatureUnavailable
      titleKey="featureUnavailable.notPermitted.title"
      descriptionKey="featureUnavailable.notPermitted.description"
    />
  );
}
