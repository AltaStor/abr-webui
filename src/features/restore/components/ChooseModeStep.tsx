// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  MapPin,
  Power,
  Server,
  ServerCog,
  ShieldCheck,
  Zap,
} from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatStorage } from "@/lib/format";
import { qk } from "@/lib/query";
import { PLATFORM_META } from "@/lib/platform";
import { computeConversionPlan, platformLabel } from "@/lib/conversion";
import { useWorldStore } from "@/store/world";
import { ConversionPlanCard } from "./ConversionPlanCard";
import type { RestorePoint, VM } from "@/types";

export type RestoreDestination = "original" | "new-location";

/** Matches the decimal GB the rest of the console derives `sizeGB`/`provisionedGB`
 *  from (see `GB` in api.http.ts) — bytes-from-the-wire fields here must divide by
 *  the same unit or the datastore-capacity comparison silently drifts. */
const GB = 1_000_000_000;

/** One row in the network-mapping list — keyed by the source NIC's own id
 *  (not its network name), so two adapters on the same source network still
 *  map independently. `target` is a target-network id. */
export interface NetworkMapping {
  nicId: string;
  source: string;
  target: string;
}

/** Client-side rules for the "Restored VM name" field — mirrors the
 *  characters vSphere/Hyper-V forbid in a VM/folder name, checked up front
 *  so the wizard never round-trips an invalid name to the appliance. Empty
 *  is valid: the appliance then defaults to "<source>-restored". A name that
 *  passes these syntax checks can still collide with a VM already in the
 *  target environment — pass `existingNames` (case-insensitive) to catch
 *  that too; when it's omitted (data not loaded yet) uniqueness is left to
 *  the appliance's own check on submit. */
export const RESTORED_VM_NAME_MAX_LENGTH = 80;
const RESTORED_VM_NAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/;
const RESTORED_VM_NAME_NON_ASCII = /[^\x20-\x7e]/;

export type RestoredVmNameError = "whitespace" | "tooLong" | "forbiddenChars" | "nonAscii" | "duplicate";

export function validateRestoredVmName(
  name: string,
  existingNames?: ReadonlySet<string>,
): RestoredVmNameError | null {
  if (!name) return null;
  if (name !== name.trim()) return "whitespace";
  if (name.length > RESTORED_VM_NAME_MAX_LENGTH) return "tooLong";
  if (RESTORED_VM_NAME_FORBIDDEN_CHARS.test(name)) return "forbiddenChars";
  if (RESTORED_VM_NAME_NON_ASCII.test(name)) return "nonAscii";
  if (existingNames?.has(name.toLowerCase())) return "duplicate";
  return null;
}

interface ChooseModeStepProps {
  vm: VM;
  point: RestorePoint;
  destination: RestoreDestination;
  onDestinationChange: (d: RestoreDestination) => void;
  targetEnvId: string;
  onTargetEnvChange: (id: string) => void;
  newName: string;
  onNewNameChange: (name: string) => void;
  nameTouched: boolean;
  onNameBlur: () => void;
  /** Reported whenever the client-side duplicate check flips, so the parent
   *  can hold "Start restore" disabled the same way it already does for a
   *  syntactically invalid name. */
  onNameConflictChange: (conflict: boolean) => void;
  /** The appliance's own rejection of the name (e.g. 409 target_vm_exists),
   *  surfaced here when the client-side check missed it — a stale existing-VM
   *  list, or a name someone else claimed between page-load and submit. */
  nameSubmitError?: string;
  targetHostId: string;
  onTargetHostIdChange: (id: string) => void;
  datastore: string;
  onDatastoreChange: (v: string) => void;
  /** What an "Automatic" host/datastore actually resolves to for the target
   *  currently chosen. Reported up so the restore request names them outright
   *  instead of leaving the appliance to re-derive defaults that only ever
   *  covered the restore point's own environment. */
  onAutoPlacementChange: (placement: { hostId: string; datastore: string }) => void;
  networkMappings: NetworkMapping[];
  onNetworkMappingsChange: (mappings: NetworkMapping[]) => void;
  powerOn: boolean;
  onPowerOnChange: (v: boolean) => void;
  /** True when "Original location" will overwrite a still-live VM — the
   *  in-place restore path, which destroys that VM once its replacement is
   *  fully written and so needs explicit typed confirmation before it can
   *  be authorized. */
  originalLocationOverwrite: boolean;
  /** Reported whenever the typed-confirmation input starts/stops matching
   *  the VM's name — same one-way reporting shape as onNameConflictChange. */
  onOverwriteConfirmedChange: (confirmed: boolean) => void;
}

export function ChoiceCard({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof Server;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all",
        active
          ? "border-primary/50 bg-primary/[0.06] shadow-sm"
          : "border-border/70 bg-card hover:border-primary/30 hover:bg-primary/[0.03]",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
      {active && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

export function ChooseModeStep({
  vm,
  point,
  destination,
  onDestinationChange,
  targetEnvId,
  onTargetEnvChange,
  newName,
  onNewNameChange,
  nameTouched,
  onNameBlur,
  onNameConflictChange,
  nameSubmitError,
  targetHostId,
  onTargetHostIdChange,
  datastore,
  onDatastoreChange,
  onAutoPlacementChange,
  networkMappings,
  onNetworkMappingsChange,
  powerOn,
  onPowerOnChange,
  originalLocationOverwrite,
  onOverwriteConfirmedChange,
}: ChooseModeStepProps) {
  const { t } = useTranslation("restore");

  // Typed confirmation for an in-place restore — mirrors DeleteRepositoryDialog's
  // type-to-confirm pattern. Cleared whenever the VM changes so a stale "yes,
  // overwrite" typed for a different VM can never authorize this one.
  const [overwriteTyped, setOverwriteTyped] = useState("");
  useEffect(() => {
    setOverwriteTyped("");
  }, [vm.id]);
  const overwriteTypedConfirmed = overwriteTyped.trim() === vm.name;
  useEffect(() => {
    onOverwriteConfirmedChange(overwriteTypedConfirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overwriteTypedConfirmed]);

  const environments = useWorldStore((s) => s.environments);
  const hosts = useWorldStore((s) => s.hosts);
  const getRestorePlacementOptions = useWorldStore((s) => s.getRestorePlacementOptions);
  const connectedEnvs = useMemo(() => environments.filter((e) => e.connected), [environments]);
  const targetHostOptions = useMemo(
    () => hosts.filter((h) => h.environmentId === targetEnvId),
    [hosts, targetEnvId],
  );

  // Real datastores/networks for the destination — resolved from the source
  // VM's actual NICs and the candidate targets' live inventory, never typed
  // in free text. Only fetched for a new-location restore, where placement
  // actually matters.
  const { data: placement, isLoading: placementLoading } = useQuery({
    queryKey: qk.restorePlacement(point.id),
    queryFn: () => getRestorePlacementOptions(point.id),
    enabled: destination === "new-location",
  });
  const sourceNics = placement?.sourceNics ?? [];

  // VM names already registered in the chosen target environment — a
  // best-effort client-side uniqueness check. The appliance validates this
  // for real on submit (inventory-wide, not folder-scoped — it has no folder
  // concept), so a name this misses still comes back as a clear inline error.
  const existingNamesInEnv = useMemo(
    () =>
      new Set(
        (placement?.existingVms ?? [])
          .filter((v) => v.environmentId === targetEnvId)
          .map((v) => v.name.trim().toLowerCase()),
      ),
    [placement, targetEnvId],
  );
  const nameError = validateRestoredVmName(newName, existingNamesInEnv);
  // A backend rejection only ever appears right after a submit attempt, so it
  // shows regardless of whether the field itself was ever blurred — unlike
  // the live syntax/duplicate check, which only nags once the user leaves it.
  const showNameError = !!nameSubmitError || (nameTouched && !!nameError);
  const nameErrorMessage = nameSubmitError ?? (nameError ? t(`mode.restoredVmNameError.${nameError}`) : undefined);
  useEffect(() => {
    onNameConflictChange(nameError === "duplicate");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameError]);

  // "Automatic" is not "anywhere": the restore lands on exactly one host, and
  // a datastore or port group that host doesn't mount is not a choice the user
  // can actually make — offering the whole environment just moved the failure
  // to submit time ("Target datastore is not available on the selected host").
  // So resolve Automatic to a concrete host and scope both lists to it.
  // Mirrors the appliance's own rule (get_restore_context's default_host_id):
  // the source VM's original host when the target environment still has it,
  // otherwise that environment's first host. The appliance only computes this
  // for the restore point's own environment, so its answer is used only there.
  const autoHostId = useMemo(() => {
    if (targetHostOptions.length === 0) return "";
    if (placement?.defaultEnvironmentId === targetEnvId) {
      const applianceChoice = targetHostOptions.find((h) => h.id === placement?.defaultHostId);
      if (applianceChoice) return applianceChoice.id;
    }
    const original = placement?.originalHost?.trim().toLowerCase();
    const sameHost = original
      ? targetHostOptions.find((h) => h.name.trim().toLowerCase() === original)
      : undefined;
    return (sameHost ?? targetHostOptions[0]).id;
  }, [targetHostOptions, targetEnvId, placement]);
  const effectiveHostId = targetHostId || autoHostId;

  // A port group lives on one host's virtual switch, so the target host
  // narrows the list to what that host can actually reach. Networks whose host
  // scope is unknown (empty hostIds) stay on offer everywhere — hiding them
  // would leave the user with nothing to pick on older inventory data.
  const targetNetworkOptions = useMemo(() => {
    const inEnv = (placement?.networks ?? []).filter((n) => n.environmentId === targetEnvId);
    return effectiveHostId
      ? inEnv.filter((n) => n.hostIds.length === 0 || n.hostIds.includes(effectiveHostId))
      : inEnv;
  }, [placement, targetEnvId, effectiveHostId]);
  const targetDatastoreOptions = useMemo(() => {
    const inEnv = (placement?.datastores ?? []).filter((d) => d.environmentId === targetEnvId);
    return effectiveHostId ? inEnv.filter((d) => d.hostIds.includes(effectiveHostId)) : inEnv;
  }, [placement, targetEnvId, effectiveHostId]);

  // Non-blocking heads-up only — the VM's actual on-disk usage is often well
  // under its provisioned size (thin disks, dedup), so a tight datastore isn't
  // necessarily a real problem, just worth flagging before the restore runs.
  const selectedDatastoreLowSpace = useMemo(() => {
    if (!datastore.trim()) return null;
    const freeBytes = targetDatastoreOptions.find((d) => d.name === datastore)?.freeBytes;
    if (freeBytes == null) return null;
    return freeBytes / GB < vm.provisionedGB ? freeBytes : null;
  }, [datastore, targetDatastoreOptions, vm.provisionedGB]);

  // Re-derive the mapping rows (one per real source NIC — never deduped by
  // network name, so two adapters sharing a source network still get their
  // own row) whenever the point, target environment or target host changes —
  // auto-pairing by name where a network on the target host shares it,
  // leaving the rest for the user to pick. A pick the user already made
  // survives a host change as long as that network exists on the new host;
  // otherwise it falls back to the auto-match so nothing silently keeps
  // pointing at an unreachable switch. Keyed so an unrelated re-render never
  // clobbers a choice.
  const syncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!placement) return;
    const key = `${point.id}:${targetEnvId}:${effectiveHostId}`;
    if (syncedKeyRef.current === key) return;
    syncedKeyRef.current = key;
    const targetIdByName = new Map(targetNetworkOptions.map((n) => [n.name, n.id]));
    const targetIds = new Set(targetNetworkOptions.map((n) => n.id));
    const chosen = new Map(networkMappings.map((m) => [m.nicId, m.target]));
    onNetworkMappingsChange(
      sourceNics.map((nic) => {
        const source = nic.sourceNetwork ?? "";
        const previous = chosen.get(nic.id);
        if (previous && targetIds.has(previous)) return { nicId: nic.id, source, target: previous };
        const autoId = nic.sourceNetwork ? targetIdByName.get(nic.sourceNetwork) : undefined;
        return { nicId: nic.id, source, target: autoId ?? "" };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, point.id, targetEnvId, effectiveHostId]);

  // A datastore chosen under a previous host/environment may no longer be
  // valid (not mounted on the newly-selected host) — fall back to Automatic
  // rather than silently submitting a stale name.
  useEffect(() => {
    if (!placement || !datastore) return;
    if (!targetDatastoreOptions.some((d) => d.name === datastore)) onDatastoreChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, targetEnvId, effectiveHostId]);

  const updateNetworkTarget = (nicId: string, target: string) =>
    onNetworkMappingsChange(networkMappings.map((m) => (m.nicId === nicId ? { ...m, target } : m)));

  // Source platform = the hypervisor of the VM's own environment.
  const sourceEnv = useMemo(
    () => environments.find((e) => e.id === vm.environmentId),
    [environments, vm.environmentId],
  );
  const sourcePlatform = sourceEnv?.hypervisor;

  const targetEnv = useMemo(
    () => environments.find((e) => e.id === targetEnvId),
    [environments, targetEnvId],
  );

  // A conversion plan only exists for a New-location restore onto a target whose
  // platform differs from the source. Guard every lookup.
  const conversionPlan = useMemo(() => {
    if (destination !== "new-location") return undefined;
    if (!sourcePlatform || !targetEnv) return undefined;
    if (targetEnv.hypervisor === sourcePlatform) return undefined;
    return computeConversionPlan(sourcePlatform, targetEnv.hypervisor, vm.osFamily, vm.guestOs);
  }, [destination, sourcePlatform, targetEnv, vm.osFamily, vm.guestOs]);

  // The datastore Automatic resolves to, for the host it will actually land
  // on. Keeping the source VM's original datastore here regardless of host was
  // the bug: change the host and the label went on naming a datastore that
  // host never mounted, one the dropdown below no longer even listed.
  const autoDatastoreName = useMemo(() => {
    if (targetDatastoreOptions.length === 0) return null;
    const original = placement?.originalDatastore
      ? targetDatastoreOptions.find((d) => d.name === placement.originalDatastore)
      : undefined;
    const applianceChoice =
      placement?.defaultEnvironmentId === targetEnvId
        ? targetDatastoreOptions.find((d) => d.id === placement?.defaultDatastoreId)
        : undefined;
    return (original ?? applianceChoice ?? targetDatastoreOptions[0]).name;
  }, [targetDatastoreOptions, targetEnvId, placement]);
  const autoHostName = useMemo(
    () => targetHostOptions.find((h) => h.id === autoHostId)?.name ?? null,
    [targetHostOptions, autoHostId],
  );

  // Hand the resolved pair up so the request carries them explicitly. Without
  // this the appliance falls back to defaults it only computed for the restore
  // point's own environment — which, against any other target, names a host
  // that isn't in it.
  useEffect(() => {
    onAutoPlacementChange({ hostId: autoHostId, datastore: autoDatastoreName ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHostId, autoDatastoreName]);

  // "Automatic" on its own doesn't say what actually happens — show the
  // concrete value it resolves to wherever one is known.
  const hostAutoLabel = autoHostName
    ? t("mode.targetHostAutoWithValue", { name: autoHostName })
    : t("mode.targetHostAuto");
  const datastoreAutoLabel = autoDatastoreName
    ? t("mode.datastoreAutoWithValue", { name: autoDatastoreName })
    : t("mode.datastoreAuto");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("whereLand")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              active={destination === "original"}
              icon={MapPin}
              title={t("mode.original.title")}
              description={t("mode.original.desc")}
              onClick={() => onDestinationChange("original")}
            />
            <ChoiceCard
              active={destination === "new-location"}
              icon={ServerCog}
              title={t("mode.newLocation.title")}
              description={t("mode.newLocation.desc")}
              onClick={() => onDestinationChange("new-location")}
            />
          </div>
          {destination === "original" && originalLocationOverwrite && (
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs text-warning-text">
                  <Trans
                    i18nKey="mode.originalOverwriteWarning"
                    ns="restore"
                    values={{ name: vm.name }}
                    components={{ 1: <span className="font-medium" /> }}
                  />
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="restore-overwrite-confirm">
                  <Trans
                    i18nKey="mode.originalOverwriteConfirmLabel"
                    ns="restore"
                    values={{ name: vm.name }}
                    components={{ 1: <span className="font-semibold text-foreground" /> }}
                  />
                </Label>
                <Input
                  id="restore-overwrite-confirm"
                  className={cn("max-w-md", overwriteTypedConfirmed && "border-success")}
                  value={overwriteTyped}
                  onChange={(e) => setOverwriteTyped(e.target.value)}
                  placeholder={vm.name}
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          {destination === "new-location" && (
            <div className="space-y-1.5">
              <label htmlFor="restore-target-env" className="text-xs font-medium text-muted-foreground">
                {t("mode.targetEnv")}
              </label>
              <Select value={targetEnvId} onValueChange={onTargetEnvChange}>
                <SelectTrigger id="restore-target-env" className="max-w-md">
                  <SelectValue placeholder={t("mode.targetPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {connectedEnvs.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · {PLATFORM_META[e.hypervisor].short} {e.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {conversionPlan && targetEnv && (
                <ConversionPlanCard plan={conversionPlan} targetEnvName={targetEnv.name} />
              )}
              <div className="space-y-1.5 pt-1">
                <label htmlFor="restore-new-name" className="text-xs font-medium text-muted-foreground">
                  {t("mode.restoredVmName")}
                </label>
                <Input
                  id="restore-new-name"
                  value={newName}
                  onChange={(e) => onNewNameChange(e.target.value)}
                  onBlur={onNameBlur}
                  placeholder={`${vm.name}-restored`}
                  className={cn("max-w-md", showNameError && "border-danger focus-visible:ring-danger/40")}
                  aria-invalid={showNameError}
                  maxLength={RESTORED_VM_NAME_MAX_LENGTH + 20}
                />
                {showNameError ? (
                  <p className="text-xs text-danger">{nameErrorMessage}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    <Trans
                      i18nKey="mode.restoredVmNameHint"
                      ns="restore"
                      values={{ name: `${vm.name}-restored` }}
                      components={{ 1: <span className="font-medium" /> }}
                    />
                  </p>
                )}
              </div>

              {/* Advanced placement — target host, datastore, network mapping, power-on. */}
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="restore-target-host" className="text-xs font-medium text-muted-foreground">
                    {t("mode.targetHost")}
                  </label>
                  <Select
                    value={targetHostId}
                    onValueChange={onTargetHostIdChange}
                    disabled={!targetEnvId}
                  >
                    <SelectTrigger id="restore-target-host">
                      <SelectValue placeholder={hostAutoLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{hostAutoLabel}</SelectItem>
                      {targetHostOptions.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="restore-datastore" className="text-xs font-medium text-muted-foreground">
                    {t("mode.datastore")}
                  </label>
                  <Select value={datastore} onValueChange={onDatastoreChange} disabled={!targetEnvId}>
                    <SelectTrigger id="restore-datastore">
                      <SelectValue placeholder={datastoreAutoLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{datastoreAutoLabel}</SelectItem>
                      {targetDatastoreOptions.map((d) => (
                        <SelectItem key={d.id} value={d.name}>
                          {d.name}
                          {d.freeBytes != null && ` · ${t("mode.datastoreFree", { free: formatStorage(d.freeBytes / GB) })}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedDatastoreLowSpace != null && (
                    <p className="text-xs text-warning-text">
                      {t("mode.datastoreLowSpace", {
                        free: formatStorage(selectedDatastoreLowSpace / GB),
                        needed: formatStorage(vm.provisionedGB),
                      })}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-medium text-muted-foreground">{t("mode.networkMap")}</span>
                {destination === "new-location" && placementLoading ? (
                  <Skeleton className="h-9 w-full max-w-md" />
                ) : sourceNics.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("mode.networkMapNone")}</p>
                ) : (
                  <div className="space-y-2">
                    {networkMappings.map((mapping) => {
                      const nic = sourceNics.find((n) => n.id === mapping.nicId);
                      // Adapter label kept alongside the network name so two
                      // NICs on the same source network still read as the
                      // distinct, independently-mappable rows they are.
                      const sourceLabel = nic
                        ? mapping.source
                          ? `${nic.label} · ${mapping.source}`
                          : nic.label
                        : mapping.source;
                      return (
                        <div key={mapping.nicId} className="flex items-center gap-2">
                          <Select value={mapping.nicId} disabled>
                            <SelectTrigger className="max-w-[240px]" aria-label={t("mode.networkMapSource")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={mapping.nicId}>{sourceLabel}</SelectItem>
                            </SelectContent>
                          </Select>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <Select
                            value={mapping.target}
                            onValueChange={(value) => updateNetworkTarget(mapping.nicId, value)}
                            disabled={!targetEnvId || targetNetworkOptions.length === 0}
                          >
                            <SelectTrigger className="max-w-[200px]" aria-label={t("mode.networkMapTarget")}>
                              <SelectValue placeholder={t("mode.networkMapTargetPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {targetNetworkOptions.map((n) => (
                                <SelectItem key={n.id} value={n.id}>
                                  {n.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
                {targetEnvId && sourceNics.length > 0 && !placementLoading && targetNetworkOptions.length === 0 ? (
                  <p className="text-xs text-warning-text">
                    {targetHostId ? t("mode.networkMapHostNone") : t("mode.networkMapEnvNone")}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t("mode.networkMapHint")}</p>
                )}
              </div>

              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <span className="min-w-0">
                  <span className="text-sm font-medium">{t("mode.powerOn")}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{t("mode.powerOnHint")}</span>
                </span>
                <Switch checked={powerOn} onCheckedChange={onPowerOnChange} aria-label={t("mode.powerOn")} />
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("review.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("review.subtitle")}</p>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <SummaryRow icon={Server} label={t("summary.machine")} value={vm.name} sub={vm.guestOs} />
            <SummaryRow
              icon={ShieldCheck}
              label={t("summary.restorePoint")}
              value={format(new Date(point.createdAt), "EEE, MMM d · HH:mm")}
              sub={t("restorePointSub", {
                type: point.type === "full" ? t("point.full") : t("point.incremental"),
                size: formatStorage(point.sizeGB),
              })}
            />
            <SummaryRow
              icon={conversionPlan ? Zap : MapPin}
              label={t("summary.recoveryMode")}
              value={conversionPlan ? t("mode.crossPlatform") : t("mode.entireVm.title")}
              sub={
                destination === "original"
                  ? t("mode.sub.original")
                  : conversionPlan
                    ? `${platformLabel(conversionPlan.sourcePlatform)} → ${platformLabel(conversionPlan.targetPlatform)}`
                    : t("mode.sub.newLocation")
              }
            />
            <SummaryRow
              icon={MapPin}
              label={t("summary.destination")}
              value={
                destination === "original"
                  ? t("mode.original.title")
                  : (environments.find((e) => e.id === targetEnvId)?.name ?? t("mode.dest.selectTarget"))
              }
              sub={
                destination === "new-location" && !targetEnvId
                  ? t("mode.dest.pickTarget")
                  : conversionPlan?.formatChange
                    ? t("mode.dest.converted", {
                        from: conversionPlan.sourceFormat.toUpperCase(),
                        to: conversionPlan.targetFormat.toUpperCase(),
                      })
                    : undefined
              }
            />
            {destination === "new-location" && targetEnvId && (
              <SummaryRow
                icon={ServerCog}
                label={t("summary.placement")}
                value={targetHostOptions.find((h) => h.id === targetHostId)?.name ?? hostAutoLabel}
                sub={
                  datastore.trim()
                    ? t("summary.placementSub", { datastore: datastore.trim() })
                    : datastoreAutoLabel
                }
              />
            )}
            {destination === "new-location" && targetEnvId && (
              <SummaryRow
                icon={Power}
                label={t("summary.powerState")}
                value={powerOn ? t("mode.powerOnYes") : t("mode.powerOnNo")}
              />
            )}
          </dl>

          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("cleanSource.body")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Review-card row — shared with the non-VM recovery steps. */
export function SummaryRow({
  icon: Icon,
  label,
  value,
  sub,
  extra,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  sub?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{label}</dt>
        <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate">{value}</span>
          {extra}
        </dd>
        {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
      </div>
    </div>
  );
}
