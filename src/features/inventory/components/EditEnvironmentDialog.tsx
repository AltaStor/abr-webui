// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ (AltaStor.com)

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Pencil } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  RESOURCE_NAME_MAX_LENGTH,
  resourceNameErrorKey,
  resourceNameProblem,
} from "@/lib/resource-name";
import { qk } from "@/lib/query";
import { apiErrorFields, apiErrorMessage, getVsphereSettings } from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import type { EnvironmentEdit } from "@/store/world.types";
import type { Environment, WinrmProtocol } from "@/types";
import { isValidEnvironmentAddress } from "./AddEnvironmentDialog";
import {
  DEFAULT_WINRM_PROTOCOL,
  WINRM_PORTS,
  WinrmProtocolNote,
  WinrmProtocolSelect,
  portAfterProtocolChange,
} from "./WinrmProtocolSelect";
import { VsphereAccessFields, vsphereDraftOf, type VsphereAccessDraft } from "./VsphereAccessFields";

interface EditEnvironmentDialogProps {
  environment: Environment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit a registered environment's connection details. Seeded from the
 * environment; the appliance never returns credentials back over GET, so
 * username/password start blank and are only sent when the user actually
 * types a replacement (see `edit_inventory_record` in abr_v41.py).
 */
export function EditEnvironmentDialog({ environment, open, onOpenChange }: EditEnvironmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={environment?.vsphere ? "max-w-lg" : "max-w-md"}>
        {environment && (
          <EditEnvironmentForm key={environment.id} environment={environment} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The port an environment answers on when its record doesn't say: its WinRM
 *  protocol's port for Hyper-V, the vSphere API otherwise. */
const defaultPort = (environment: Environment) =>
  environment.hypervisor === "hyperv" ? WINRM_PORTS[environment.protocol ?? DEFAULT_WINRM_PROTOCOL] : 443;

function EditEnvironmentForm({ environment, onClose }: { environment: Environment; onClose: () => void }) {
  const { t } = useTranslation("inventory");
  const { t: tCommon } = useTranslation("common");
  const editEnvironment = useWorldStore((s) => s.editEnvironment);
  const [name, setName] = useState(environment.name);
  const [endpoint, setEndpoint] = useState(environment.endpoint);
  const [port, setPort] = useState(String(environment.port ?? defaultPort(environment)));
  const [protocol, setProtocol] = useState<WinrmProtocol | undefined>(environment.protocol);
  const [insecure, setInsecure] = useState(Boolean(environment.insecure));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [vsphere, setVsphere] = useState<VsphereAccessDraft | null>(
    environment.vsphere ? vsphereDraftOf(environment.vsphere) : null,
  );
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // What an environment inherits comes from the appliance's server-wide
  // settings; the demo has none, and the fields then fall back to what the
  // environment itself reports.
  const live = useWorldStore((s) => s.mode === "live" && s.ready);
  const canViewSettings = useCan("inventory.view");
  const settingsQuery = useQuery({
    queryKey: qk.vsphereSettings,
    queryFn: getVsphereSettings,
    enabled: live && canViewSettings && Boolean(environment.vsphere),
  });

  useEffect(() => {
    setName(environment.name);
    setEndpoint(environment.endpoint);
    setPort(String(environment.port ?? defaultPort(environment)));
    setProtocol(environment.protocol);
    setInsecure(Boolean(environment.insecure));
    setUsername("");
    setPassword("");
    setVsphere(environment.vsphere ? vsphereDraftOf(environment.vsphere) : null);
    setLibraryError(null);
    setError(null);
  }, [environment]);

  // Checked as typed rather than on a trimmed copy: the API refuses a name with
  // surrounding whitespace, so trimming it here would rename the environment to
  // something the operator never entered. See src/lib/resource-name.ts.
  const nameProblem = resourceNameProblem(name);
  const nameErrorKey = resourceNameErrorKey(nameProblem);
  const endpointTrimmed = endpoint.trim();
  const endpointValid = endpointTrimmed === "" || isValidEnvironmentAddress(endpointTrimmed);
  const portNum = Number(port);
  const portValid = port.trim() !== "" && Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
  const canSubmit = nameProblem === null && endpointTrimmed !== "" && endpointValid && portValid && !saving;
  const isHyperV = environment.hypervisor === "hyperv";

  const onProtocolChange = (next: WinrmProtocol) => {
    setProtocol(next);
    setPort((current) => portAfterProtocolChange(current, next));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const patch: EnvironmentEdit = {};
    if (name !== environment.name) patch.name = name;
    if (endpointTrimmed !== environment.endpoint) patch.endpoint = endpointTrimmed;
    if (portNum !== (environment.port ?? defaultPort(environment))) patch.port = portNum;
    if (isHyperV && protocol && protocol !== environment.protocol) patch.protocol = protocol;
    if (insecure !== Boolean(environment.insecure)) patch.insecure = insecure;
    if (username.trim() !== "") patch.username = username.trim();
    if (password !== "") patch.password = password;
    if (vsphere && environment.vsphere) {
      if (vsphere.api !== environment.vsphere.apiSetting) patch.vsphereApi = vsphere.api;
      const library = vsphere.library.trim();
      if (library !== (environment.vsphere.library ?? "")) patch.vddkLibrary = library || "inherit";
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    setLibraryError(null);
    try {
      await editEnvironment(environment.id, patch);
      if (patch.vsphereApi !== undefined || patch.vddkLibrary !== undefined) {
        void queryClient.invalidateQueries({ queryKey: qk.vsphereSettings });
      }
      toast.success(t("editEnvironment.toast.saved.title"), {
        description: t("editEnvironment.toast.saved.description", { name }),
      });
      onClose();
    } catch (err) {
      // A library the appliance refuses is named next to the field as well.
      setLibraryError(apiErrorFields(err)?.vddk_library ?? null);
      setError(apiErrorMessage(err) ?? t("editEnvironment.toast.failed.description"));
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" />
          {t("editEnvironment.title", { name: environment.name })}
        </DialogTitle>
        <DialogDescription>{t("editEnvironment.description")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="edit-env-name">{t("editEnvironment.nameLabel")}</Label>
          <Input
            id="edit-env-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={RESOURCE_NAME_MAX_LENGTH}
            aria-invalid={nameProblem !== null}
            className={cn(nameProblem !== null && "border-danger")}
            autoFocus
          />
          {nameErrorKey && <p className="text-xs text-danger">{tCommon(nameErrorKey)}</p>}
        </div>

        <div className={cn("grid gap-3", isHyperV ? "sm:grid-cols-[1fr_6.5rem_6rem]" : "sm:grid-cols-[1fr_7rem]")}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-env-endpoint">{t("editEnvironment.addressLabel")}</Label>
            <Input
              id="edit-env-endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!endpointValid}
              className={cn(!endpointValid && "border-danger")}
            />
            {!endpointValid && <p className="text-xs text-danger">{t("editEnvironment.addressInvalid")}</p>}
          </div>
          {isHyperV && <WinrmProtocolSelect id="edit-env-protocol" value={protocol} onChange={onProtocolChange} />}
          <div className="space-y-1.5">
            <Label htmlFor="edit-env-port">{t("editEnvironment.portLabel")}</Label>
            <Input
              id="edit-env-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              aria-invalid={!portValid}
              className={cn(!portValid && "border-danger")}
            />
          </div>
        </div>
        {isHyperV && <WinrmProtocolNote protocol={protocol} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-env-user">{t("editEnvironment.usernameLabel")}</Label>
            <Input
              id="edit-env-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("editEnvironment.usernamePlaceholder")}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-env-pass">{t("editEnvironment.passwordLabel")}</Label>
            <PasswordInput
              id="edit-env-pass"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("editEnvironment.passwordPlaceholder")}
              autoComplete="off"
            />
          </div>
        </div>

        {!(isHyperV && protocol === "http") && (
          <label className="flex items-center justify-between gap-3 border border-border bg-muted/20 px-3 py-2 text-sm">
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{t("editEnvironment.skipTlsLabel")}</span>
              <span className="text-xs text-muted-foreground">{t("editEnvironment.skipTlsHint")}</span>
            </span>
            <Switch checked={insecure} onCheckedChange={setInsecure} />
          </label>
        )}

        {vsphere && environment.vsphere && (
          <VsphereAccessFields
            access={environment.vsphere}
            draft={vsphere}
            onChange={(next) => {
              setVsphere(next);
              setLibraryError(null);
            }}
            settings={settingsQuery.data}
            libraryError={libraryError}
          />
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          {t("common:actions.cancel")}
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          {saving ? t("editEnvironment.saving") : t("editEnvironment.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
