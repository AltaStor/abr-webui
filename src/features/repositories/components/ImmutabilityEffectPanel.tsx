// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { AlertTriangle, Database, Info, Lock } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ImmutabilityEffect } from "@/types";

/**
 * The appliance's account of what a repository's Object Lock setting actually
 * does — rendered as the three separate things it is, because collapsing them
 * into one paragraph is what makes immutability feel like it silently did more
 * than it did.
 *
 *  - **Effect** — what happens to backups written FROM NOW ON. This is the only
 *    part a setting change is guaranteed to deliver.
 *  - **Limitations** — what it does NOT reach. Above all the restore points
 *    already stored: they keep whatever retention they were written with (none,
 *    if they predate the lock) until they are explicitly placed under the
 *    current one. A longer period does not extend a lock already written, and a
 *    shorter one cannot shorten it either — S3 never shortens a written lock.
 *  - **Warnings** — where the lock and the jobs writing here disagree. A lock
 *    longer than a job's retention holds storage the job wanted freed; a lock
 *    shorter than it leaves a window where a backup is still needed but
 *    deletable, which is the gap ransomware is meant to be locked out of.
 *
 * Every line is the appliance's own text, not a client-side paraphrase — this
 * panel decides only where each kind goes and how loudly it reads.
 */
export function ImmutabilityEffectPanel({
  effect,
  className,
}: {
  effect: ImmutabilityEffect;
  className?: string;
}) {
  const { t } = useTranslation("repositories");
  const hasLimitations = effect.limitations.length > 0;
  const hasWarnings = effect.warnings.length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      <Block
        icon={Lock}
        tone="info"
        title={t("immutability.effect.title")}
        lines={effect.effect}
      />

      {hasLimitations && (
        <Block
          icon={Info}
          tone="neutral"
          title={t("immutability.effect.limitationsTitle")}
          lines={effect.limitations}
        />
      )}

      {hasWarnings && (
        <Block
          icon={AlertTriangle}
          tone="warning"
          title={t("immutability.effect.warningsTitle")}
          lines={effect.warnings}
        />
      )}

      {effect.existingRestorePoints > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Database className="mt-px h-3 w-3 shrink-0" />
          <span>
            {effect.existingDataProtected
              ? t("immutability.effect.existingProtected", { count: effect.existingRestorePoints })
              : t("immutability.effect.existingUnprotected", { count: effect.existingRestorePoints })}
          </span>
        </p>
      )}
    </div>
  );
}

function Block({
  icon: Icon,
  tone,
  title,
  lines,
}: {
  icon: typeof Lock;
  tone: "info" | "neutral" | "warning";
  title: string;
  lines: string[];
}) {
  if (lines.length === 0) return null;
  return (
    <div
      className={cn(
        "px-3 py-2 text-[11px] leading-relaxed",
        tone === "warning"
          ? "bg-warning-subtle text-warning-text"
          : tone === "info"
            ? "bg-info-subtle text-info-text"
            : "bg-muted/50 text-muted-foreground",
      )}
    >
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className="h-3 w-3 shrink-0" />
        {title}
      </p>
      <ul className="mt-1 space-y-1 pl-[1.125rem]">
        {lines.map((line) => (
          <li key={line} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
