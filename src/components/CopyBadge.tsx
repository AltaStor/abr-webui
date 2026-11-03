// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Copy } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { RestorePoint } from "@/types";

/**
 * The "Copy" marker on a restore point a backup copy job made, next to its
 * full/incremental badge like the synthetic-full one: a copy restores like any
 * other point, and differs only in where it came from, which the tooltip says.
 *
 * The point's `copySource` is what marks it. A point of a backup copy job is a
 * copy too when the appliance did not report one (an appliance from before
 * `GET /backups` carried it), and then the tooltip names only the copy job.
 */
export function CopyBadge({ point, className }: { point: RestorePoint; className?: string }) {
  const { t } = useTranslation("inventory");
  const ofCopyJob = useWorldStore((s) => s.jobs.some((j) => j.id === point.jobId && j.type === "backup-copy"));
  const source = point.copySource;
  if (!source && !ofCopyJob) return null;

  const tip = source
    ? t("copy.badgeTip", {
        job: point.jobName,
        source: source.jobName ?? t("copy.unknownJob"),
        repository: source.repositoryName ?? t("copy.unknownRepository"),
        when: formatDateTime(source.createdAt),
      })
    : t("copy.badgeTipJobOnly", { job: point.jobName });

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal text-muted-foreground", className)}
      title={tip}
      data-testid="copy-badge"
    >
      <Copy className="h-3 w-3" />
      {t("copy.badge")}
    </Badge>
  );
}
