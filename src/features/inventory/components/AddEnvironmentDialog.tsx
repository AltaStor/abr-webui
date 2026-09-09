// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Register a hypervisor environment — VMware vCenter or standalone ESXi — as
 * an inventory the orchestrator can discover and back up.
 *
 * This POSTs `/api/v1/inventories` and triggers discovery (matching
 * `abr inventory add --type`). VMware is the only platform offered here:
 * Hyper-V and Proxmox aren't wired end-to-end (backup execution isn't real
 * for either yet), so they're kept out of the creation flow rather than
 * registering an environment the console can't actually protect.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Network, Server } from "@/lib/icons";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import type { EnvironmentType } from "@/types";

interface TypeOption {
  value: EnvironmentType;
  label: string;
  defaultPort: number;
  hint: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    value: "vcenter",
    get label() { return i18n.t("inventory:addEnvironment.type.vcenter.label"); },
    defaultPort: 443,
    get hint() { return i18n.t("inventory:addEnvironment.type.vcenter.hint"); },
  },
  {
    value: "esxi-standalone",
    get label() { return i18n.t("inventory:addEnvironment.type.esxiStandalone.label"); },
    defaultPort: 443,
    get hint() { return i18n.t("inventory:addEnvironment.type.esxiStandalone.hint"); },
  },
];

/** RFC-1123 FQDN check — two or more dot-separated labels, e.g.
 *  "vcenter.corp.local". A single label ("vcenter") is a bare hostname, not a
 *  fully-qualified one, so it's rejected here same as a URL or path would be. */
const FQDN_PATTERN = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

/** Strict IPv4 check — each octet 0-255, so "999.999.999.999" doesn't slip
 *  through as if it were a hostname label. */
const IPV4_OCTET = "(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])";
const IPV4_PATTERN = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);

export const HOSTNAME_MAX_LENGTH = 253;

/** Accepts a fully-qualified hostname or an IPv4 address — rejects URLs,
 *  paths, single-label hostnames, and stray whitespace so a malformed
 *  Address doesn't reach the orchestrator. Shared with EditEnvironmentDialog. */
export function isValidEnvironmentAddress(value: string): boolean {
  return value.length <= HOSTNAME_MAX_LENGTH && (FQDN_PATTERN.test(value) || IPV4_PATTERN.test(value));
}

interface FormState {
  type: EnvironmentType;
  name: string;
  endpoint: string;
  port: string;
  username: string;
  password: string;
  insecure: boolean;
}

const emptyForm = (): FormState => ({
  type: "vcenter",
  name: "",
  endpoint: "",
  port: "443",
  username: "",
  password: "",
  insecure: true,
});

export function AddEnvironmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("inventory");
  const createEnvironment = useWorldStore((s) => s.createEnvironment);
  const rescanEnvironment = useWorldStore((s) => s.rescanEnvironment);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Cancel is live even mid-request, so a rejection can land after the dialog
   * has closed and reset. Reporting it into the form then would leave a stale
   * complaint waiting for whoever opens the dialog next; the toast in
   * `discover` and the environment's own status are the honest channels once
   * this is closed. */
  const openRef = useRef(open);
  openRef.current = open;

  const option = useMemo(() => TYPE_OPTIONS.find((o) => o.value === form.type)!, [form.type]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const reset = useCallback(() => {
    setForm(emptyForm());
    setSubmitting(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 200);
      return () => clearTimeout(t);
    }
  }, [open, reset]);

  const onTypeChange = (value: string) => {
    const opt = TYPE_OPTIONS.find((o) => o.value === value);
    if (!opt) return;
    setForm((f) => ({ ...f, type: opt.value, port: String(opt.defaultPort) }));
  };

  const portNum = Number(form.port);
  const portValid = form.port.trim() === "" || (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535);
  const endpointTrimmed = form.endpoint.trim();
  const endpointValid = endpointTrimmed === "" || isValidEnvironmentAddress(endpointTrimmed);
  const authValid = form.username.trim() !== "" && form.password !== "";
  const canSubmit =
    form.name.trim() !== "" && endpointTrimmed !== "" && endpointValid && authValid && portValid && !submitting;

  /**
   * Discovery, once the record exists. Deliberately NOT awaited by `submit`:
   * the dialog is already closed by the time this runs, so a vCenter that never
   * answers costs the operator nothing but a pending toast. Reads the outcome
   * back off the store rather than off `rescanEnvironment`'s return value,
   * because the appliance persists the specific failure reason on the record
   * (`statusError`) while the action itself only reports null.
   */
  const discover = (environmentId: string, platform: string, endpoint: string) => {
    const settled = toast.loading(t("addEnvironment.toast.discovering", { platform }), {
      description: t("addEnvironment.toast.discoveringDesc", { endpoint }),
    });
    void rescanEnvironment(environmentId).then(() => {
      const env = useWorldStore.getState().environments.find((e) => e.id === environmentId);
      if (env?.statusError) {
        // Created, but the scan failed (e.g. a self-signed cert rejected with
        // "Skip TLS verification" off) — surface the appliance's own reason
        // instead of a silent "Disconnected" to go dig for. It also stays on
        // the environment in Inventory.
        toast.warning(t("addEnvironment.toast.discoveryFailed", { platform }), {
          id: settled,
          description: env.statusError,
        });
        return;
      }
      toast.success(t("addEnvironment.toast.registered", { platform }), {
        id: settled,
        description: t("addEnvironment.toast.discoveredDesc", {
          endpoint,
          count: env?.vmCount ?? 0,
        }),
      });
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const platform = option.label;
    const endpoint = form.endpoint.trim();
    try {
      const env = await createEnvironment({
        name: form.name.trim(),
        type: form.type,
        endpoint,
        port: form.port.trim() ? Number(form.port) : undefined,
        username: form.username.trim(),
        password: form.password,
        insecure: form.insecure,
      });
      if (!env) {
        if (openRef.current) setError(t("addEnvironment.error"));
        setSubmitting(false);
        return;
      }
      // The record exists now, so this dialog's work is done — close it and let
      // discovery report for itself. Nothing below touches component state.
      setSubmitting(false);
      onOpenChange(false);
      discover(env.id, platform, endpoint);
    } catch (err) {
      const message = apiErrorMessage(err) ?? t("addEnvironment.error");
      if (openRef.current) setError(message);
      else toast.error(t("addEnvironment.error"), { description: message });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            {t("addEnvironment.title")}
          </DialogTitle>
          <DialogDescription>{t("addEnvironment.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0">{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("addEnvironment.platformLabel")}</Label>
            <Select value={form.type} onValueChange={onTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{option.hint}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="env-name">{t("addEnvironment.nameLabel")}</Label>
            <Input
              id="env-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="lab-vcenter"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <Label htmlFor="env-endpoint">{t("addEnvironment.addressLabel")}</Label>
              <Input
                id="env-endpoint"
                value={form.endpoint}
                onChange={(e) => set("endpoint", e.target.value)}
                placeholder="vcenter.corp.local"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!endpointValid}
                className={cn(!endpointValid && "border-danger")}
              />
              {!endpointValid && (
                <p className="text-xs text-danger">{t("addEnvironment.addressInvalid")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-port">{t("addEnvironment.portLabel")}</Label>
              <Input
                id="env-port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => set("port", e.target.value)}
                aria-invalid={!portValid}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="env-user">{t("addEnvironment.usernameLabel")}</Label>
              <Input
                id="env-user"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="administrator@vsphere.local"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-pass">{t("addEnvironment.passwordLabel")}</Label>
              <Input
                id="env-pass"
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 border border-border bg-muted/20 px-3 py-2 text-sm">
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{t("addEnvironment.skipTlsLabel")}</span>
              <span className="text-xs text-muted-foreground">{t("addEnvironment.skipTlsHint")}</span>
            </span>
            <Switch checked={form.insecure} onCheckedChange={(v) => set("insecure", v)} />
          </label>
        </div>

        <DialogFooter>
          {/* Never disabled. Registration is one POST and discovery is another
              call entirely, so there is no window in which dismissing this
              dialog could leave the appliance mid-write. */}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
            {t("addEnvironment.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
