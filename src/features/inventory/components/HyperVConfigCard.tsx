// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * A Hyper-V VM's configuration, as discovery last read it off the host: what a
 * backup will capture and what a recovery has to place.
 *
 * Each disk says whether a backup takes it. The rule mirrors
 * `Get-AbrDriveInfo` in abr-core's Hyper-V scripts: pass-through disks and
 * shared VHD Sets are skipped (with a warning in the session), so the operator
 * learns that here rather than from the first run.
 */
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardDrive, Info, Network, Settings2 } from "@/lib/icons";
import { formatStorage } from "@/lib/format";
import type { HyperVDisk, HyperVVmDetails } from "@/types";
import { SpecRow } from "./SpecRow";

type SkipReason = "passThrough" | "vhdSet";

/** Why a backup skips this disk, or null when it takes it. */
export function hypervDiskSkipReason(disk: HyperVDisk): SkipReason | null {
  const path = (disk.path ?? "").toLowerCase();
  if (!path) return "passThrough";
  if (path.endsWith(".vhds") || disk.format?.toUpperCase() === "VHDSET") return "vhdSet";
  return null;
}

export function HyperVConfigCard({ details }: { details: HyperVVmDetails }) {
  const { t } = useTranslation("inventory");
  const generation =
    details.generation === 1 || details.generation === 2
      ? t(`hypervConfig.generation${details.generation}`)
      : t("hypervConfig.unknown");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          {t("hypervConfig.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="divide-y divide-border/60">
          <SpecRow label={t("hypervConfig.generation")}>{generation}</SpecRow>
          <SpecRow label={t("hypervConfig.configurationVersion")}>
            <span className="nums">{details.configurationVersion ?? t("hypervConfig.unknown")}</span>
          </SpecRow>
          <SpecRow label={t("hypervConfig.placement")}>
            {details.clustered
              ? t("hypervConfig.clustered", { node: details.ownerNode ?? t("hypervConfig.unknown") })
              : t("hypervConfig.standalone", { node: details.ownerNode ?? t("hypervConfig.unknown") })}
          </SpecRow>
          <SpecRow label={t("hypervConfig.checkpoints")}>
            <span className="nums">{details.checkpointCount}</span>
          </SpecRow>
        </div>
        {details.checkpointCount > 0 && (
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("hypervConfig.checkpointsNote", { count: details.checkpointCount })}
          </p>
        )}

        <div className="space-y-1.5">
          <p className="label-overline flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5" />
            {t("hypervConfig.disks")}
          </p>
          {details.disks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("hypervConfig.noDisks")}</p>
          ) : (
            <ul className="space-y-1.5">
              {details.disks.map((disk) => {
                const skip = hypervDiskSkipReason(disk);
                return (
                  <li key={`${disk.controller}-${disk.name}`} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium" title={disk.path ?? undefined}>
                        {disk.name}
                      </span>
                      <span className="nums shrink-0 text-muted-foreground">
                        {disk.capacityGB > 0 ? formatStorage(disk.capacityGB, 0) : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {disk.controller && <span className="font-mono">{disk.controller}</span>}
                      {(disk.type || disk.format) && (
                        <span>{[disk.type, disk.format].filter(Boolean).join(" ")}</span>
                      )}
                      {skip && (
                        <Badge variant="outline" className="border-warning/40 text-warning-text">
                          {t(`hypervConfig.skip.${skip}`)}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="label-overline flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5" />
            {t("hypervConfig.adapters")}
          </p>
          {details.networkAdapters.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("hypervConfig.noAdapters")}</p>
          ) : (
            <ul className="space-y-1.5">
              {details.networkAdapters.map((nic, i) => (
                <li key={`${nic.mac ?? ""}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{nic.name}</span>
                  <span className="min-w-0 truncate text-right text-muted-foreground">
                    {nic.switchName ?? t("hypervConfig.notConnected")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
