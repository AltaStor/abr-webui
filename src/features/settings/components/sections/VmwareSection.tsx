// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, RotateCcw, ServerCog } from "@/lib/icons";
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
import type { VsphereApi, VsphereSettings, VsphereSettingsPatch } from "@/types";
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
  api: VsphereApi;
  /** Empty follows the VDDK directory. */
  library: string;
  updateAll: boolean;
}

const draftOf = (settings: VsphereSettings): Draft => ({
  api: settings.api,
  library: settings.library ?? "",
  updateAll: false,
});

/** The change a draft makes; a library equal to the VDDK directory's own is
 *  the default, which the appliance stores as no library at all. */
function patchOf(draft: Draft, settings: VsphereSettings): VsphereSettingsPatch {
  const patch: VsphereSettingsPatch = {};
  if (draft.api !== settings.api) patch.api = draft.api;
  const library = draft.library.trim();
  if (library !== (settings.library ?? "")) patch.library = library === "" ? null : library;
  if (draft.updateAll) patch.applyToExistingEnvironments = true;
  return patch;
}

/**
 * The server-wide API and VDDK library (ABR-497, ABR-552): what every vCenter
 * and ESXi environment without its own uses. The library, when left empty,
 * follows the VDDK directory — the appliance names it and the file it
 * resolves to, which is what support asks for. "Update all existing
 * environment settings" removes every environment's own values on save,
 * after a confirmation that names them, so they all follow these.
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
  const apiName = (api: VsphereApi) => tDomain(`vsphere.api.${api}`);
  const unavailable = settings.unavailable[draft.api];
  const library = draft.library.trim();
  const overriding = settings.overriding;
  const names = overriding.map((e) => e.name).join(", ");

  const onSave = () => {
    if (draft.updateAll && overriding.length > 0) setConfirming(true);
    else save.mutate(draft);
  };

  const footer = canEdit ? (
    <div className="flex w-full justify-end">
      <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
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
              <Select value={draft.api} onValueChange={(v) => update({ api: v as VsphereApi })} disabled={readOnly}>
                <SelectTrigger id="vmware-api">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["vddk", "soap"] as const).map((api) => (
                    <SelectItem key={api} value={api}>
                      {settings.unavailable[api] !== null
                        ? t("vmware.api.optionUnavailable", { api: apiName(api) })
                        : apiName(api)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(errors.transport ?? unavailable) && (
                <p className="flex items-start gap-1.5 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {/* The appliance's own reason, which names the API and the way out. */}
                  <span>{errors.transport ?? unavailable}</span>
                </p>
              )}
            </div>
          </SettingRow>

          {draft.api === "vddk" && (
            <>
              <SettingDivider />
              <SettingRow
                label={t("vmware.library.label")}
                description={t("vmware.library.hint")}
                htmlFor="vmware-library"
                stacked
              >
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      id="vmware-library"
                      value={draft.library}
                      onChange={(e) => update({ library: e.target.value })}
                      placeholder={settings.defaultLibrary}
                      disabled={readOnly}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={Boolean(errors.vddk_library)}
                      className={cn("nums font-mono text-xs", errors.vddk_library && "border-danger")}
                    />
                    {library !== "" && !readOnly && (
                      <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => update({ library: "" })}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t("vmware.library.reset")}
                      </Button>
                    )}
                  </div>
                  {errors.vddk_library ? (
                    <p className="text-xs text-danger">{errors.vddk_library}</p>
                  ) : (
                    <LibraryInEffect
                      path={library || settings.defaultLibrary}
                      // Known only for what the appliance has looked at: its
                      // default and the saved library, not a path being typed.
                      known={library === "" || library === settings.library}
                      file={library === "" ? settings.defaultLibraryFile : settings.libraryFile}
                      source={tDomain(`vsphere.source.${library === "" ? "vddk_directory" : "global"}`)}
                    />
                  )}
                  {!settings.libraryFileSupported && (
                    <p className="text-xs text-warning-text">{t("vmware.library.unsupported")}</p>
                  )}
                </div>
              </SettingRow>
            </>
          )}

          <SettingDivider />
          <SettingRow
            label={t("vmware.directory.label")}
            description={t(`vmware.directory.${settings.directorySource}`)}
          >
            <code className="nums block break-all bg-muted/60 px-2 py-1 text-xs sm:text-right">{settings.directory}</code>
          </SettingRow>

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

function LibraryInEffect({
  path,
  known,
  file,
  source,
}: {
  path: string;
  known: boolean;
  file: string | null;
  source: string;
}) {
  const { t } = useTranslation("settings");
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
      {" · "}
      {source}
      {known && file === null && <span className="text-warning-text"> · {t("vmware.library.missing")}</span>}
    </p>
  );
}
