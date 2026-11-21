// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * VMware access, asked after sign-in while nobody has chosen it.
 *
 * A new appliance starts with the server-wide API and VDDK library of its
 * server.conf and reports them as not confirmed until someone saves them. The
 * CLI then prints a note at sign-in and asks in `abr settings vsphere set`;
 * the console sends a user who may change environments here instead: after
 * the forced password change of the first sign-in, and before the setup
 * wizard. It offers AltaVDDK or SOAP, and for AltaVDDK its own library or a
 * library named by its full path, which is how VMware's original VDDK is
 * chosen (lib/vsphereLibrary.ts).
 *
 * What is preselected is what the appliance uses now (ABR-595), and only what
 * the user changed is sent, so saving the values as they are confirms them
 * and changes nothing else. "Decide later" leaves them for this browser
 * session. Settings → VMware changes them afterwards.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { qk } from "@/lib/query";
import { cn } from "@/lib/utils";
import { apiErrorFields, apiErrorMessage, getVsphereSettings, updateVsphereSettings } from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import type { VsphereApi, VsphereSettings, VsphereSettingsPatch } from "@/types";
import { altaVddkLibrary, libraryChange, libraryFieldOf } from "@/lib/vsphereLibrary";
import { AuthLayout } from "./components/AuthLayout";
import { markVmwareChoiceSkipped } from "./vmwareChoice";

/** AltaVDDK's own library, or a library named by its full path. */
type LibraryChoice = "alta" | "path";

interface Choice {
  api: VsphereApi;
  library: LibraryChoice;
  path: string;
}

/** The choice as the appliance stands: the API and library it uses now. */
function initialChoice(s: VsphereSettings): Choice {
  const field = libraryFieldOf(s);
  // While SOAP is in use no library is, and AltaVDDK is the one to offer.
  const alta = altaVddkLibrary(s) !== null && s.libraryFileSupported && (field === "" || s.api === "soap");
  return { api: s.api, library: alta ? "alta" : "path", path: field };
}

/** The library field the choice amounts to: empty for AltaVDDK. */
const fieldOf = (choice: Choice) => (choice.library === "alta" ? "" : choice.path);

export default function VmwareAccessPage() {
  const { t } = useTranslation("auth");
  const { t: tSettings } = useTranslation("settings");
  const { t: tDomain } = useTranslation("domain");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mode = useWorldStore((s) => s.mode);
  const status = useAuthStore((s) => s.status);
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);
  const canEdit = useCan("inventory.edit");
  const allowed = mode === "live" && status === "signed-in" && !mustChangePassword && canEdit;

  const query = useQuery({ queryKey: qk.vsphereSettings, queryFn: getVsphereSettings, enabled: allowed });
  const settings = query.data;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  // Only for a signed-in user who may choose, and only while it is open: a
  // choice someone else saved meanwhile leaves nothing to ask.
  useEffect(() => {
    if (mode !== "live" || status !== "signed-in") navigate("/login", { replace: true });
    else if (mustChangePassword) navigate("/change-password", { replace: true });
    else if (!canEdit || settings?.confirmed) navigate("/", { replace: true });
  }, [mode, status, mustChangePassword, canEdit, settings?.confirmed, navigate]);

  useEffect(() => {
    if (settings && choice === null) setChoice(initialChoice(settings));
  }, [settings, choice]);

  const save = useMutation({
    mutationFn: (c: Choice) => {
      // The API is always sent: saving the values as they are confirms them.
      // The library only when it changed, so an unchanged save keeps it.
      const patch: VsphereSettingsPatch = { api: c.api };
      const library = c.api === "vddk" && settings ? libraryChange(fieldOf(c), settings) : undefined;
      if (library !== undefined) patch.library = library;
      return updateVsphereSettings(patch);
    },
    onSuccess: ({ settings: next }) => {
      queryClient.setQueryData(qk.vsphereSettings, next);
      toast.success(tSettings("vmware.saved"));
      navigate("/", { replace: true });
    },
    onError: (err) => {
      const fields = apiErrorFields(err) ?? {};
      setErrors(fields);
      setFailure(Object.keys(fields).length > 0 ? null : (apiErrorMessage(err) ?? t("vmwareAccess.saveFailed")));
    },
  });

  const later = () => {
    markVmwareChoiceSkipped();
    navigate("/", { replace: true });
  };

  const update = (change: Partial<Choice>) => {
    setChoice((c) => (c ? { ...c, ...change } : c));
    setErrors({});
    setFailure(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (choice) save.mutate(choice);
  };

  const apiName = (api: VsphereApi) => tDomain(`vsphere.api.${api}`);

  if (query.isError || !settings || !choice) {
    return (
      <AuthLayout title={t("vmwareAccess.title")} subtitle={t("vmwareAccess.subtitle")}>
        {query.isError ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-danger-text" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {apiErrorMessage(query.error) ?? t("vmwareAccess.loadFailed")}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => void query.refetch()}>
                {t("common:actions.retry")}
              </Button>
              <Button variant="ghost" className="flex-1" onClick={later}>
                {t("vmwareAccess.later")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("vmwareAccess.loading")}
          </p>
        )}
      </AuthLayout>
    );
  }

  const alta = altaVddkLibrary(settings);
  const inUseField = libraryFieldOf(settings);
  const chosenField = fieldOf(choice);
  // The appliance's reason against AltaVDDK holds for the library in use; a
  // different one is checked when it is saved.
  const vddkProblem = chosenField.trim() === inUseField.trim() ? settings.unavailable.vddk : null;
  const missingPath = choice.api === "vddk" && choice.library === "path" && choice.path.trim() === "";
  const vddkInUse = settings.api === "vddk";
  // Libraries found on the appliance other than AltaVDDK's, to fill the path.
  const others = settings.detectedLibraries.filter((lib) => lib.kind !== "ovddk");
  const strip = (p: string) => p.trim().replace(/\/+$/, "");
  const fileOfPath = (path: string) =>
    settings.detectedLibraries.find((lib) => strip(lib.path) === strip(path))?.file ??
    (strip(path) === strip(settings.defaultLibrary) ? settings.defaultLibraryFile : null);

  return (
    <AuthLayout
      title={t("vmwareAccess.title")}
      subtitle={t("vmwareAccess.subtitle")}
      footer={
        // A library path has no spaces to wrap at on a phone.
        <span className="block max-w-md [overflow-wrap:anywhere]">
          {t("vmwareAccess.laterHint", {
            api: apiName(settings.api),
            library: settings.api === "vddk" ? settings.effectiveLibrary : t("vmwareAccess.noLibrary"),
          })}
        </span>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("vmwareAccess.apiLabel")}</legend>
          <ChoiceList label={t("vmwareAccess.apiLabel")}>
            {(["vddk", "soap"] as const).map((api) => {
              const problem = api === "vddk" ? vddkProblem : settings.unavailable.soap;
              return (
                <ChoiceRow
                  key={api}
                  checked={choice.api === api}
                  // VDDK stays open: another library can be what makes it work.
                  disabled={api === "soap" && problem !== null && settings.api !== "soap"}
                  onSelect={() => update({ api })}
                  title={apiName(api)}
                  tag={settings.api === api ? t("vmwareAccess.current") : undefined}
                  detail={t(`vmwareAccess.api.${api}`)}
                  warning={problem !== null ? t("vmwareAccess.unavailable", { reason: problem }) : undefined}
                  testId={`vmware-api-${api}`}
                />
              );
            })}
          </ChoiceList>
          {errors.api && <p className="text-xs text-danger-text">{errors.api}</p>}
        </fieldset>

        {choice.api === "vddk" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("vmwareAccess.libraryLabel")}</legend>
            <ChoiceList label={t("vmwareAccess.libraryLabel")}>
              <ChoiceRow
                checked={choice.library === "alta"}
                disabled={alta === null || !settings.libraryFileSupported}
                onSelect={() => update({ library: "alta" })}
                title={tDomain("vsphere.libraryKind.ovddk")}
                tag={vddkInUse && inUseField === "" ? t("vmwareAccess.current") : undefined}
                detail={t("vmwareAccess.altaDetail")}
                path={alta?.path}
                file={alta?.file}
                warning={alta === null ? t("vmwareAccess.altaMissing") : undefined}
                testId="vmware-library-alta"
              />
              <ChoiceRow
                checked={choice.library === "path"}
                onSelect={() => update({ library: "path" })}
                title={t("vmwareAccess.pathTitle")}
                tag={vddkInUse && inUseField !== "" ? t("vmwareAccess.current") : undefined}
                detail={t("vmwareAccess.pathDetail")}
                testId="vmware-library-path"
              />
            </ChoiceList>
            {choice.library === "path" && (
              <div className="space-y-1.5">
                <Input
                  value={choice.path}
                  onChange={(e) => update({ path: e.target.value })}
                  placeholder="/opt/vmware-vix-disklib-distrib/lib64/libvixDiskLib.so"
                  aria-label={t("vmwareAccess.pathLabel")}
                  aria-invalid={Boolean(errors.vddk_library)}
                  disabled={!settings.libraryFileSupported}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={choice.path === ""}
                  className={cn("nums font-mono text-xs", errors.vddk_library && "border-danger")}
                />
                {choice.path.trim() !== "" && fileOfPath(choice.path) && (
                  <p className="nums break-all font-mono text-[11px] text-muted-foreground">
                    → {fileOfPath(choice.path)}
                  </p>
                )}
                {others.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{t("vmwareAccess.found")}</span>
                    {others.map((lib) => (
                      <button
                        key={lib.path}
                        type="button"
                        onClick={() => update({ path: lib.path })}
                        disabled={!settings.libraryFileSupported}
                        title={lib.file ?? undefined}
                        className="nums break-all border border-border px-1.5 py-0.5 text-left font-mono transition-colors hover:bg-muted/40 hover:text-foreground"
                      >
                        {lib.path}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t("vmwareAccess.pathHint")}</p>
              </div>
            )}
            {errors.vddk_library && <p className="text-xs text-danger-text">{errors.vddk_library}</p>}
            {!settings.libraryFileSupported && (
              <p className="text-xs text-warning-text">{tSettings("vmware.library.unsupported")}</p>
            )}
          </fieldset>
        )}

        {failure && (
          <p className="flex items-start gap-2 text-xs text-danger-text" role="alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {failure}
          </p>
        )}

        <div className="space-y-2">
          <Button type="submit" className="w-full" size="lg" disabled={save.isPending || missingPath}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {save.isPending ? t("vmwareAccess.saving") : t("vmwareAccess.save")}
          </Button>
          <button
            type="button"
            onClick={later}
            disabled={save.isPending}
            className="w-full text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("vmwareAccess.later")}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

function ChoiceList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-border/60 border border-border" role="radiogroup" aria-label={label}>
      {children}
    </ul>
  );
}

function ChoiceRow({
  checked,
  disabled = false,
  onSelect,
  title,
  tag,
  detail,
  path,
  file,
  warning,
  testId,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  tag?: string;
  detail?: string;
  path?: string;
  file?: string | null;
  warning?: string;
  testId?: string;
}) {
  // The file only when the path does not already end in it.
  const showFile = path !== undefined && file && path.split("/").pop() !== file;
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        data-testid={testId}
        className={cn(
          "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "hover:bg-muted/30",
          checked && "bg-primary/[0.06]",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            checked ? "border-primary" : "border-muted-foreground/50",
          )}
          aria-hidden
        >
          {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-2 text-sm">
            {title}
            {tag && (
              <span className="border border-border px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {tag}
              </span>
            )}
          </span>
          {detail && <span className="block text-xs leading-relaxed text-muted-foreground">{detail}</span>}
          {path && (
            <span className="nums block break-all font-mono text-[11px] text-muted-foreground">
              {path}
              {showFile && <> → {file}</>}
            </span>
          )}
          {warning && <span className="block text-xs text-warning-text">{warning}</span>}
        </span>
      </button>
    </li>
  );
}
