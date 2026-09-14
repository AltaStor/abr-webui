// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Layers } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The "Synthetic" marker on a restore point that was built by merging the
 * chain in the repository rather than by reading the VM.
 *
 * Shared rather than owned by the synthetic-full dialog: restore points are
 * listed on the VM detail page, its calendar view and the Backups tab, and a
 * merged full has to look identical in all three. Keeping it here also stops
 * the Backups tab pulling the whole dialog into its chunk.
 *
 * It sits NEXT to the full/incremental badge, never instead of it — a synthetic
 * full is a full restore point in every way that matters to a restore.
 */
export function SyntheticFullBadge({ className }: { className?: string }) {
  const { t } = useTranslation("inventory");
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal text-muted-foreground", className)}
      title={t("syntheticFull.badgeTip")}
    >
      <Layers className="h-3 w-3" />
      {t("syntheticFull.badge")}
    </Badge>
  );
}
