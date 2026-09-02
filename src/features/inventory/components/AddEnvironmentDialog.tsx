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
import { useCallback, useEffect, useMemo, useState } from "react";
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
  { value: "vcenter", label: "VMware vCenter", defaultPort: 443, hint: "vCenter Server managing one or more ESXi hosts." },
  { value: "esxi-standalone", label: "VMware ESXi (standalone)", defaultPort: 443, hint: "A single ESXi host, managed directly." },
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
  const createEnvironment = useWorldStore((s) => s.createEnvironment);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const env = await createEnvironment({
        name: form.name.trim(),
        type: form.type,
        endpoint: form.endpoint.trim(),
        port: form.port.trim() ? Number(form.port) : undefined,
        username: form.username.trim(),
        password: form.password,
        insecure: form.insecure,
      });
      if (!env) {
        setError("The orchestrator rejected the registration. Check the address and credentials.");
        setSubmitting(false);
        return;
      }
      if (env.statusError) {
        // The environment was created, but the discovery scan that follows
        // failed (e.g. a self-signed cert rejected with "Skip TLS
        // verification" off) -- surface the appliance's specific reason now
        // instead of a silent "Disconnected" the user has to go dig for in
        // DevTools. It also stays visible on the environment in Inventory.
        toast.warning(`${option.label} registered, but discovery failed`, {
          description: env.statusError,
        });
      } else {
        toast.success(`${option.label} registered`, {
          description: `Discovering VMs on ${form.endpoint.trim()}…`,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err) ?? "The orchestrator rejected the registration. Check the address and credentials.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (submitting ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            Add environment
          </DialogTitle>
          <DialogDescription>
            Register a VMware vCenter Server or standalone ESXi host so AltaStor can discover and protect its VMs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0">{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Platform</Label>
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
            <Label htmlFor="env-name">Name</Label>
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
              <Label htmlFor="env-endpoint">Address</Label>
              <Input
                id="env-endpoint"
                value={form.endpoint}
                onChange={(e) => set("endpoint", e.target.value)}
                placeholder="vcenter.corp.local"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!endpointValid}
                className={cn(!endpointValid && "border-danger focus-visible:ring-danger/40")}
              />
              {!endpointValid && (
                <p className="text-xs text-danger">Enter a valid FQDN or IP address — no protocol, path, or spaces.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-port">Port</Label>
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
              <Label htmlFor="env-user">Username</Label>
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
              <Label htmlFor="env-pass">Password</Label>
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
              <span className="font-medium text-foreground">Skip TLS verification</span>
              <span className="text-xs text-muted-foreground">Accept self-signed certificates (typical in labs).</span>
            </span>
            <Switch checked={form.insecure} onCheckedChange={(v) => set("insecure", v)} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
            Register &amp; discover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
