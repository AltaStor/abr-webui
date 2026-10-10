// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { AlertTriangle } from "@/lib/icons";
import { Hint } from "@/components/ui/tooltip";

export function ClockAheadMark({ warnings }: { warnings?: string[] }) {
  const { t } = useTranslation("jobs");
  if (!warnings?.length) return null;
  return (
    <Hint
      label={
        <span className="block max-w-xs space-y-1">
          {warnings.map((warning) => (
            <span key={warning} className="block">
              {warning}
            </span>
          ))}
        </span>
      }
    >
      <span tabIndex={0} className="inline-flex shrink-0 items-center text-warning">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{t("clock.mark")}</span>
      </span>
    </Hint>
  );
}
