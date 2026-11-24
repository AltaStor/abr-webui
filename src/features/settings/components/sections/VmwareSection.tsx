// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, ServerCog } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { qk } from "@/lib/query";
import { cn } from "@/lib/utils";
import { apiErrorFields, apiErrorMessage, getVsphereSettings, updateVsphereSettings } from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import type { VsphereSettings, VsphereSettingsPatch } from "@/types";
import {
  VMWARE_CHOICES,
  apiOfChoice,
  choiceOf,
  libraryChange,
  libraryOfChoice,
  libreVddkLibrary,
  otherVddkLibraries,
  usesLibreVddk,
  vddkPathOf,
  type VmwareChoice,
} from "@/lib/vsphereLibrary";
import { SettingRow } from "../SettingRow";
import { SettingDivider, SettingsSection } from "../SettingsSection";

export function VmwareSection() {
  return (
    <div className="space-y-4">
      <VmwareAccessCard />
    </div>
  );
}

interface Draft {
  choice: VmwareChoice;
  /** VMware's VDDK library, by its full path; only VDDK uses it. */
  path: string;
  updateAll: boolean;
}

const draftOf = (settings: VsphereSettings): Draft => ({
  choice: choiceOf(settings),
  path: vddkPathOf(settings),
  updateAll: false,
});

/** The change a draft makes: only what differs from the saved values. */
function patchOf(draft: Draft, settings: VsphereSettings): VsphereSettingsPatch {
  const patch: VsphereSettingsPatch = {};
  const api = apiOfChoice(draft.choice);
  if (api !== settings.api) patch.api = api;
  const library = libraryChange(draft.choice, draft.path, settings);
  if (library !== undefined) patch.library = library;
  if (draft.updateAll) patch.applyToExistingEnvironments = true;
  return patch;
}

/**
 * The server-wide API and VDDK library (ABR-497, ABR-552): what every vCenter
 * and ESXi environment without its own uses. The Default API is LibreVDDK
 * (the VDDK library that comes with AltaStor), VDDK (VMware's own, named by
 * the full path of its library) or SOAP; lib/vsphereLibrary.ts maps them to
 * the appliance's API and library. "Update all existing environment
 * settings" removes every environment's own values on save, after a
 * confirmation that names them, so they all follow these.
 */
function VmwareAccessCard() {
  const { t } = useTranslation("settings");
  const { t: tDomain } = useTranslation("domain");
  const live = useWorldStore((s) => s.mode === "live" && s.ready);
  const reloadEnvironments = useWorldStore((s) => s.reloadEnvironments);
  const canEdit = useCan("inventory.edit");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.vsphereSettings, queryFn: getVsphereSettings, enabled: live });
  const settings = query.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  // Seed the draft from the first answer, and again after each save.
  useEffect(() => {
    if (settings && draft === null) setDraft(draftOf(settings));
  }, [settings, draft]);

  const save = useMutation({
    mutationFn: (d: Draft) => updateVsphereSettings(patchOf(d, settings!)),
    onSuccess: ({ settings: next, updated }) => {
      queryClient.setQueryData(qk.vsphereSettings, next);
      setDraft(draftOf(next));
      setErrors({});
      setConfirming(false);
      if (updated.length > 0) void reloadEnvironments();
      toast.success(t("vmware.saved"), {
        description:
          updated.length > 0
            ? t("vmware.updated", { count: updated.length, names: updated.map((e) => e.name).join(", ") })
            : undefined,
      });
    },
    onError: (err) => {
      setErrors(apiErrorFields(err) ?? {});
      setConfirming(false);
      toast.error(t("vmware.saveFailed"), { description: apiErrorMessage(err) ?? undefined });
    },
  });

  const section = (children: React.ReactNode, footer?: React.ReactNode) => (
    <SettingsSection title={t("vmware.title")} description={t("vmware.description")} icon={ServerCog} footer={footer}>
      {children}
    </SettingsSection>
  );

  if (!live) return section(<p className="py-4 text-sm text-muted-foreground">{t("vmware.liveOnly")}</p>);
  if (query.isError) {
    return section(
      <div className="flex items-center gap-2 py-4 text-sm text-danger-text" role="alert">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {apiErrorMessage(query.error) ?? t("vmware.loadFailed")}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void query.refetch()}>
          {t("common:actions.retry")}
        </Button>
      </div>,
    );
  }
  if (!settings || !draft) {
    return section(
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("vmware.loading")}
      </div>,
    );
  }

  const readOnly = !canEdit;
  const patch = patchOf(draft, settings);
  const dirty = Object.keys(patch).length > 0;
  const update = (change: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...change } : d));
    setErrors({});
  };
  const choiceName = (choice: VmwareChoice) => tDomain(`vsphere.choice.${choice}`);
  const libre = libreVddkLibrary(settings);
  // LibreVDDK is a library file: it needs to be installed, and a tool that loads one.
  const libreOffered = libre !== null && settings.libraryFileSupported;
  // The appliance's reason against the VDDK API holds for the library it has
  // saved, even while SOAP is in use; another library is checked when it is
  // saved. SOAP loads none, so its reason holds whatever the library.
  const savedLibrary: VmwareChoice = usesLibreVddk(settings) ? "libre" : "vddk";
  const pathChanged = libraryChange("vddk", draft.path, settings) !== undefined;
  const problemOf = (choice: VmwareChoice) =>
    choice === "soap"
      ? settings.unavailable.soap
      : choice === savedLibrary && !(choice === "vddk" && pathChanged)
        ? settings.unavailable.vddk
        : null;
  const unavailable = problemOf(draft.choice);
  const libreMissing = draft.choice === "libre" && libre === null;
  const pathMissing = draft.choice === "vddk" && draft.path.trim() === "";
  const others = otherVddkLibraries(settings);
  const overriding = settings.overriding;
  const names = overriding.map((e) => e.name).join(", ");

  const onSave = () => {
    if (draft.updateAll && overriding.length > 0) setConfirming(true);
    else save.mutate(draft);
  };

  const footer = canEdit ? (
    <div className="flex w-full justify-end">
      <Button size="sm" onClick={onSave} disabled={!dirty || libreMissing || pathMissing || save.isPending}>
        {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {save.isPending ? t("vmware.saving") : t("vmware.save")}
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      {section(
        <>
          <SettingRow label={t("vmware.api.label")} description={t("vmware.api.hint")} htmlFor="vmware-api">
            <div className="space-y-1.5">
              <Select
                value={draft.choice}
                onValueChange={(v) => update({ choice: v as VmwareChoice })}
                disabled={readOnly}
              >
                <SelectTrigger id="vmware-api">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VMWARE_CHOICES.map((choice) => (
                    <SelectItem key={choice} value={choice} disabled={choice === "libre" && !libreOffered}>
                      {choice === "libre" && libre === null
                        ? t("vmware.api.optionNotInstalled", { api: choiceName(choice) })
                        : (choice === "libre" && !libreOffered) || problemOf(choice) !== null
                          ? t("vmware.api.optionUnavailable", { api: choiceName(choice) })
                          : choiceName(choice)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(errors.api ?? unavailable) && (
                <p className="flex items-start gap-1.5 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {/* The appliance's own reason, which names the API and the way out. */}
                  <span>{errors.api ?? unavailable}</span>
                </p>
              )}
              {draft.choice === "libre" &&
                (libreMissing ? (
                  <p className="text-xs text-danger">{t("vmware.library.libreMissing")}</p>
                ) : errors.vddk_library ? (
                  <p className="text-xs text-danger">{errors.vddk_library}</p>
                ) : (
                  <LibraryInEffect settings={settings} path={libraryOfChoice("libre", "", settings)} />
                ))}
            </div>
          </SettingRow>

          {draft.choice === "vddk" && (
            <>
              <SettingDivider />
              <SettingRow
                label={t("vmware.library.label")}
                description={t("vmware.library.hint")}
                htmlFor="vmware-library"
                stacked
              >
                <div className="space-y-1.5">
                  <Input
                    id="vmware-library"
                    value={draft.path}
                    onChange={(e) => update({ path: e.target.value })}
                    placeholder={VMWARE_VDDK_EXAMPLE}
                    disabled={readOnly || !settings.libraryFileSupported}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(errors.vddk_library) || pathMissing}
                    className={cn("nums font-mono text-xs", (errors.vddk_library || pathMissing) && "border-danger")}
                  />
                  {others.length > 0 && !readOnly && settings.libraryFileSupported && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{t("vmware.library.found")}</span>
                      {others.map((lib) => (
                        <button
                          key={lib.path}
                          type="button"
                          onClick={() => update({ path: lib.path })}
                          title={lib.file ?? undefined}
                          className="nums break-all border border-border px-1.5 py-0.5 text-left font-mono transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                          {lib.path}
                        </button>
                      ))}
                    </div>
                  )}
                  {errors.vddk_library ? (
                    <p className="text-xs text-danger">{errors.vddk_library}</p>
                  ) : pathMissing ? (
                    <p className="text-xs text-danger">{t("vmware.library.pathMissing")}</p>
                  ) : (
                    <LibraryInEffect settings={settings} path={libraryOfChoice("vddk", draft.path, settings)} />
                  )}
                  {!settings.libraryFileSupported && (
                    <p className="text-xs text-warning-text">{t("vmware.library.unsupported")}</p>
                  )}
                </div>
              </SettingRow>

              {/* Where VMware's VDDK is looked for; LibreVDDK and SOAP do not use it. */}
              <SettingDivider />
              <SettingRow
                label={t("vmware.directory.label")}
                description={t(`vmware.directory.${settings.directorySource}`)}
              >
                <code className="nums block break-all bg-muted/60 px-2 py-1 text-xs sm:text-right">
                  {settings.directory}
                </code>
              </SettingRow>
            </>
          )}

          {canEdit && (
            <>
              <SettingDivider />
              <label className="flex cursor-pointer items-start gap-2.5 py-3.5" htmlFor="vmware-update-all">
                <Checkbox
                  id="vmware-update-all"
                  className="mt-0.5"
                  checked={draft.updateAll}
                  onCheckedChange={(checked) => update({ updateAll: checked === true })}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">{t("vmware.updateAll.label")}</span>
                  <span className="block text-[13px] leading-relaxed text-muted-foreground">
                    {overriding.length === 0
                      ? t("vmware.updateAll.hintNone")
                      : t("vmware.updateAll.hint", { count: overriding.length, names })}
                  </span>
                </span>
              </label>
            </>
          )}
        </>,
        footer,
      )}

      <Dialog open={confirming} onOpenChange={(open) => !save.isPending && setConfirming(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("vmware.confirm.title", { count: overriding.length })}</DialogTitle>
            <DialogDescription>{t("vmware.confirm.description", { names })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={save.isPending}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("vmware.confirm.action", { count: overriding.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A VMware VDDK library where its bundle installs it, as an example path. */
const VMWARE_VDDK_EXAMPLE = "/opt/vmware-vix-disklib-distrib/lib64/libvixDiskLib.so";

/**
 * "In effect: <path> → <file> · <what it is>" for the library a choice
 * loads. The file and the kind are known for what the appliance has looked
 * at (LibreVDDK, the libraries it found, the one saved and the VDDK
 * directory's), not for a path being typed.
 */
function LibraryInEffect({ settings, path }: { settings: VsphereSettings; path: string | null }) {
  const { t } = useTranslation("settings");
  const { t: tDomain } = useTranslation("domain");
  if (path === null) return null;
  const strip = (p: string) => p.replace(/\/+$/, "");
  const found = settings.detectedLibraries.find((lib) => strip(lib.path) === strip(path));
  const file =
    found !== undefined
      ? found.file
      : strip(path) === strip(settings.effectiveLibrary)
        ? settings.libraryFile
        : strip(path) === strip(settings.defaultLibrary)
          ? settings.defaultLibraryFile
          : undefined;
  const known = file !== undefined;
  const showFile = known && file !== null && path.split("/").pop() !== file;
  return (
    <p className="min-w-0 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">{t("vmware.library.inEffect")}:</span>{" "}
      <code className="nums break-all">{path}</code>
      {showFile && (
        <>
          {" → "}
          <code className="nums break-all text-foreground">{file}</code>
        </>
      )}
      {found && <> · {tDomain(`vsphere.libraryKind.${found.kind}`)}</>}
      {known && file === null && <span className="text-warning-text"> · {t("vmware.library.missing")}</span>}
    </p>
  );
}
