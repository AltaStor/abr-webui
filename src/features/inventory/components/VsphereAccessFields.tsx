// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, RotateCcw } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EnvironmentVsphereAccess, VsphereApi, VsphereSettings, VsphereSettingSource } from "@/types";

export interface VsphereAccessDraft {
  api: VsphereApi | "inherit";
  /** Empty inherits the server-wide library. */
  library: string;
}

export const vsphereDraftOf = (access: EnvironmentVsphereAccess): VsphereAccessDraft => ({
  api: access.apiSetting,
  library: access.library ?? "",
});

/** What a vSphere environment inherits: the server-wide values when the
 *  appliance's settings were read, else what the environment itself reports
 *  for a value it does not set (the demo, or a role without the read). */
function inherited(access: EnvironmentVsphereAccess, settings: VsphereSettings | undefined) {
  return {
    api: settings?.api ?? (access.apiSource === "global" ? access.api : undefined),
    library: settings
      ? { path: settings.effectiveLibrary, file: settings.libraryFile, source: settings.librarySource }
      : access.librarySource !== "inventory"
        ? { path: access.effectiveLibrary, file: access.libraryFile, source: access.librarySource }
        : undefined,
  };
}

/**
 * An environment's Advanced settings (ABR-497): the API its sessions reach the
 * disks over and the VDDK library they load, each either set here — an
 * override of Settings → VMware, marked as such — or inherited. The line
 * under each says what is in effect and where it comes from. The library is
 * not offered while the API in effect is vSphere SOAP: the appliance refuses
 * one there, and nothing would load it.
 */
export function VsphereAccessFields({
  access,
  draft,
  onChange,
  settings,
  libraryError,
}: {
  access: EnvironmentVsphereAccess;
  draft: VsphereAccessDraft;
  onChange: (draft: VsphereAccessDraft) => void;
  settings?: VsphereSettings;
  libraryError?: string | null;
}) {
  const { t } = useTranslation("inventory");
  const { t: tDomain } = useTranslation("domain");
  // Open from the start when something here differs from the server-wide values.
  const [open, setOpen] = useState(access.apiSetting !== "inherit" || access.library !== null);
  const parent = inherited(access, settings);
  const apiName = (api: VsphereApi) => tDomain(`vsphere.api.${api}`);
  const sourceName = (source: VsphereSettingSource) => tDomain(`vsphere.source.${source}`);

  const effectiveApi: VsphereApi | undefined = draft.api === "inherit" ? parent.api : draft.api;
  const unavailable = effectiveApi ? settings?.unavailable[effectiveApi] : null;
  const ownLibrary = draft.library.trim();
  const libraryShown = effectiveApi !== "soap";

  return (
    <div className="border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{t("editEnvironment.advanced.title")}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          <p className="text-xs text-muted-foreground">{t("editEnvironment.advanced.description")}</p>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="edit-env-vsphere-api">{t("editEnvironment.advanced.apiLabel")}</Label>
              {draft.api !== "inherit" && <Badge variant="info">{tDomain("vsphere.override")}</Badge>}
            </div>
            <Select value={draft.api} onValueChange={(v) => onChange({ ...draft, api: v as VsphereAccessDraft["api"] })}>
              <SelectTrigger id="edit-env-vsphere-api">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">
                  {parent.api
                    ? t("editEnvironment.advanced.inherit", { api: apiName(parent.api) })
                    : t("editEnvironment.advanced.inheritUnknown")}
                </SelectItem>
                <SelectItem value="vddk">{apiName("vddk")}</SelectItem>
                <SelectItem value="soap">{apiName("soap")}</SelectItem>
              </SelectContent>
            </Select>
            {effectiveApi && (
              <InEffect>
                {apiName(effectiveApi)} · {sourceName(draft.api === "inherit" ? "global" : "inventory")}
              </InEffect>
            )}
            {unavailable && (
              <p className="flex items-start gap-1.5 text-xs text-warning-text">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {/* The appliance's own reason, which names the API and the way out. */}
                <span>{unavailable}</span>
              </p>
            )}
          </div>

          {libraryShown ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="edit-env-vddk-library">{t("editEnvironment.advanced.libraryLabel")}</Label>
                {ownLibrary !== "" && <Badge variant="info">{tDomain("vsphere.override")}</Badge>}
              </div>
              <div className="flex gap-2">
                <Input
                  id="edit-env-vddk-library"
                  value={draft.library}
                  onChange={(e) => onChange({ ...draft, library: e.target.value })}
                  placeholder={parent.library?.path ?? ""}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(libraryError)}
                  className={cn("nums font-mono text-xs", libraryError && "border-danger")}
                />
                {ownLibrary !== "" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => onChange({ ...draft, library: "" })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("editEnvironment.advanced.reset")}
                  </Button>
                )}
              </div>
              {libraryError ? (
                <p className="text-xs text-danger">{libraryError}</p>
              ) : ownLibrary !== "" ? (
                <InEffect>
                  <code className="nums break-all">{ownLibrary}</code>
                  {ownLibrary === access.library && access.libraryFile && <ResolvesTo path={ownLibrary} file={access.libraryFile} />}
                  {" · "}
                  {sourceName("inventory")}
                </InEffect>
              ) : parent.library ? (
                <InEffect>
                  <code className="nums break-all">{parent.library.path}</code>
                  {parent.library.file && <ResolvesTo path={parent.library.path} file={parent.library.file} />}
                  {" · "}
                  {sourceName(parent.library.source)}
                </InEffect>
              ) : (
                <p className="text-xs text-muted-foreground">{t("editEnvironment.advanced.libraryHint")}</p>
              )}
              {settings && !settings.libraryFileSupported && (
                <p className="text-xs text-warning-text">{t("editEnvironment.advanced.libraryUnsupported")}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("editEnvironment.advanced.libraryNotUsed")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function InEffect({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("inventory");
  return (
    <p className="min-w-0 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">{t("editEnvironment.advanced.inEffect")}:</span> {children}
    </p>
  );
}

/** "→ libvixDiskLib.so.9.1.0.0" when the path is a link to another file. */
function ResolvesTo({ path, file }: { path: string; file: string }) {
  if (path.split("/").pop() === file) return null;
  return (
    <>
      {" → "}
      <code className="nums break-all text-foreground">{file}</code>
    </>
  );
}
