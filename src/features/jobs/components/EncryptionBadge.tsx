// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { HelpCircle, Lock, LockOpen } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EncryptionSummary } from "@/lib/restore-points";

/**
 * Encryption at rest for one VM's restore points under one job, as stored.
 *
 * What the points say and what the job is set to do next are different facts,
 * and conflating them is how an operator ends up believing a chain is encrypted
 * because its job's toggle is on: the badge reports only the points, and the
 * tooltip adds the job's current setting whenever that tells a different story
 * (turned on after these were written, turned off since, or off all along).
 */
export function VmEncryptionBadge({
  summary,
  jobEncrypts,
}: {
  summary: EncryptionSummary;
  /** The job's current setting; undefined when the job no longer exists. */
  jobEncrypts: boolean | undefined;
}) {
  const { t } = useTranslation("jobs");
  const { state, encrypted, unreported, total } = summary;

  const lines = [
    state === "all"
      ? t("backupsTab.encryption.allTip", { count: total - unreported })
      : state === "partial"
        ? t("backupsTab.encryption.partialTip", { encrypted, total })
        : state === "none"
          ? t("backupsTab.encryption.noneTip")
          : t("backupsTab.encryption.unknownTip"),
  ];
  if (state !== "unknown" && unreported > 0) {
    lines.push(t("backupsTab.encryption.unreportedTip", { count: unreported }));
  }
  if (jobEncrypts === true && state !== "all") {
    lines.push(t("backupsTab.encryption.jobOnTip"));
  } else if (jobEncrypts === false) {
    lines.push(state === "none" ? t("backupsTab.encryption.jobOffNoneTip") : t("backupsTab.encryption.jobOffTip"));
  }

  // Amber when this chain is, or is about to become, a mix: partly encrypted
  // already, or fully encrypted with the job no longer encrypting what's next.
  const drifting = state === "partial" || (state === "all" && jobEncrypts === false);
  const Icon = state === "unknown" ? HelpCircle : state === "none" ? LockOpen : Lock;

  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 gap-1 font-normal",
        drifting
          ? "border-warning/40 text-warning-text"
          : state === "all"
            ? "text-muted-foreground"
            : "text-muted-foreground/70",
      )}
      title={lines.join("\n")}
    >
      <Icon className="h-3 w-3" />
      {state === "all"
        ? t("backupsTab.encryption.all")
        : state === "partial"
          ? t("backupsTab.encryption.partial", { encrypted, total })
          : state === "none"
            ? t("backupsTab.encryption.none")
            : t("backupsTab.encryption.unknown")}
    </Badge>
  );
}

/**
 * One restore point's encryption. "Encrypted" is always shown, the same as in
 * every other restore point list; the unencrypted and unreported states only
 * when the chain is mixed, where telling the points apart is the point — in a
 * uniform chain the VM row above already says it once for all of them.
 */
export function PointEncryptionBadge({
  encrypted,
  mixedChain,
}: {
  encrypted: boolean | null;
  mixedChain: boolean;
}) {
  const { t } = useTranslation("jobs");
  if (encrypted === true) {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground" title={t("point.encryptedTip")}>
        <Lock className="h-3 w-3" />
        {t("point.encrypted")}
      </Badge>
    );
  }
  if (!mixedChain) return null;
  return encrypted === false ? (
    <Badge
      variant="outline"
      className="gap-1 border-warning/40 font-normal text-warning-text"
      title={t("point.unencryptedTip")}
    >
      <LockOpen className="h-3 w-3" />
      {t("point.unencrypted")}
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground/70" title={t("point.unreportedTip")}>
      <HelpCircle className="h-3 w-3" />
      {t("point.unreported")}
    </Badge>
  );
}
