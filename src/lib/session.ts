// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import i18n from "@/i18n";

/** A session timeout in words: "30 minutes", "1 hour 30 minutes". */
export function sessionDurationLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return [
    hours > 0 ? i18n.t("settings:security.session.hours", { count: hours }) : null,
    minutes > 0 || hours === 0 ? i18n.t("settings:security.session.minutes", { count: minutes }) : null,
  ]
    .filter(Boolean)
    .join(" ");
}
