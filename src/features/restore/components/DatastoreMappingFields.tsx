// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Where each of the source VM's datastores is restored to.
 *
 * A VM's disks do not all live on one datastore — a system disk on flash and a
 * database on bulk storage is the ordinary shape of a real machine — so a
 * restore to a new location is one placement decision per SOURCE datastore, not
 * one for the VM. This is the list of those decisions, and the answer to the
 * question that follows from them: does what lands on each target actually fit
 * there.
 *
 * The capacity arithmetic is the appliance's own (see ../datastore-mapping.ts,
 * which mirrors `_ensure_restore_target_capacity`), so the wizard refuses
 * exactly what the appliance would refuse, before the operator waits for a
 * restore to fail on it.
 */

import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, HardDrive } from "@/lib/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatStorage } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RestoreDatastoreMapping, RestoreDatastoreOption } from "@/types";
import {
  datastoreMappingProblems,
  targetDatastoreLoads,
  type SourceDatastoreGroup,
} from "../datastore-mapping";

/** Same decimal GB the rest of the console derives its sizes from (see `GB` in
 *  api.http.ts) — a byte figure from the wire must divide by this one or the
 *  comparison against a `*GB` field silently drifts. */
const GB = 1_000_000_000;

const size = (bytes: number) => formatStorage(bytes / GB);

export function DatastoreMappingFields({
  groups,
  targets,
  mappings,
  onChange,
  loading,
  disabled,
  noHostDatastores,
  terms,
}: {
  groups: SourceDatastoreGroup[];
  /** Target datastores the chosen host actually mounts. */
  targets: RestoreDatastoreOption[];
  mappings: RestoreDatastoreMapping[];
  onChange: (next: RestoreDatastoreMapping[]) => void;
  loading: boolean;
  disabled: boolean;
  /** The target host mounts nothing — a different problem from an unmapped
   *  row, and one the operator fixes by changing host, not by picking here. */
  noHostDatastores: boolean;
  /** "hyperv" words a datastore as a storage location (an i18n context). */
  terms?: "hyperv";
}) {
  const { t: translate } = useTranslation("restore");
  const t = (key: string, options: Record<string, unknown> = {}) => translate(key, { ...options, context: terms });
  const bySource = new Map(mappings.map((m) => [m.sourceDatastore, m.targetDatastoreId]));
  const problems = datastoreMappingProblems(groups, bySource, targets);
  const loads = targetDatastoreLoads(groups, bySource, targets);
  const shortOf = new Set(
    problems.filter((p) => p.kind === "insufficient").map((p) => p.datastoreName),
  );

  const setTarget = (sourceDatastore: string, targetDatastoreId: string) =>
    onChange(
      groups.map((group) => ({
        sourceDatastore: group.name,
        targetDatastoreId:
          group.name === sourceDatastore ? targetDatastoreId : (bySource.get(group.name) ?? ""),
      })),
    );

  return (
    <div className="space-y-1.5 pt-1">
      <span className="text-xs font-medium text-muted-foreground">{t("mode.datastoreMap")}</span>

      {loading ? (
        <Skeleton className="h-9 w-full max-w-md" />
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("mode.datastoreMapNone")}</p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const targetId = bySource.get(group.name) ?? "";
            const unmapped = !disabled && !loading && targetId === "";
            return (
              <div key={group.name || "unrecorded-source-datastore"} className="flex flex-wrap items-center gap-2">
                <div
                  className={cn(
                    "flex min-w-0 max-w-[240px] flex-1 items-center gap-2 border border-border bg-muted/20 px-3 py-1.5 text-sm",
                    !group.name && "text-muted-foreground",
                  )}
                >
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={group.name || t("mode.datastoreMapUnknownSource")}>
                    {group.name || t("mode.datastoreMapUnknownSource")}
                  </span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Select
                  value={targetId}
                  onValueChange={(value) => setTarget(group.name, value)}
                  disabled={disabled || targets.length === 0}
                >
                  <SelectTrigger
                    className={cn("max-w-[240px]", unmapped && "border-danger")}
                    aria-label={t("mode.datastoreMapTarget")}
                    aria-invalid={unmapped}
                  >
                    <SelectValue placeholder={t("mode.datastoreMapTargetPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        {target.name}
                        {target.freeBytes != null &&
                          ` · ${t("mode.datastoreFree", { free: size(target.freeBytes) })}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* What this source datastore's disks will need wherever they
                    land — the figure the target has to have room for. */}
                <span className="text-[11px] text-muted-foreground">
                  {t("mode.datastoreMapDisks", { count: group.disks.length })}
                  {" · "}
                  {group.requiredBytes == null
                    ? t("mode.datastoreMapNeedsUnknown")
                    : t("mode.datastoreMapNeeds", { size: size(group.requiredBytes) })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Where two source datastores share one target, what fits is a question
          about the pair, not either one — so the total is shown per target. */}
      {loads
        .filter((load) => load.sourceDatastores.length > 1 && !shortOf.has(load.datastore.name))
        .map((load) => (
          <p key={load.datastore.id} className="text-[11px] text-muted-foreground">
            {t("mode.datastoreMapCombined", {
              count: load.sourceDatastores.length,
              datastore: load.datastore.name,
              required: load.requiredBytes == null ? t("mode.datastoreMapNeedsUnknown") : size(load.requiredBytes),
              free: load.datastore.freeBytes == null ? t("mode.datastoreMapFreeUnknown") : size(load.datastore.freeBytes),
            })}
          </p>
        ))}

      {noHostDatastores ? (
        <p className="text-xs text-warning-text">{t("mode.datastoreMapHostNone")}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t("mode.datastoreMapHint")}</p>
      )}

      {problems.map((problem) => (
        <p
          key={problem.kind === "unmapped" ? `unmapped:${problem.sourceDatastore}` : `short:${problem.datastoreName}`}
          className="flex items-start gap-1.5 text-xs text-danger"
          role="alert"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {problem.kind === "unmapped"
              ? t("mode.datastoreMapUnmapped", {
                  name: problem.sourceDatastore || t("mode.datastoreMapUnknownSource"),
                })
              : t("mode.datastoreMapInsufficient", {
                  datastore: problem.datastoreName,
                  required: size(problem.requiredBytes),
                  free: size(problem.freeBytes),
                  short: size(problem.shortfallBytes),
                })}
          </span>
        </p>
      ))}
    </div>
  );
}
