// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "@/lib/icons";
import type { EnvironmentType } from "@/types";
import {
  HYPERVISOR_LABEL,
  emptyHypervisorRow,
  isBlankRow,
  isCompleteRow,
  type HypervisorRow,
} from "../types";
import { StepHeader } from "./StepHeader";

interface HypervisorsStepProps {
  rows: HypervisorRow[];
  onChange: (rows: HypervisorRow[]) => void;
}

/**
 * Only the platforms this appliance can actually back up.
 *
 * The orchestrator will happily *register* a Proxmox inventory and even
 * discover its VMs — but every run against one fails with "unsupported
 * hypervisor kind", so offering it here would let the operator finish the
 * wizard holding a registration that can never produce a backup. It is kept
 * out of the picker (the same call the Inventory "Add environment" dialog
 * makes), and the step says so rather than being quietly short.
 *
 * `HYPERVISOR_LABEL` still covers all four types: it also labels environments
 * that already exist. This list is what the wizard is willing to create.
 */
const TYPES: EnvironmentType[] = ["vcenter", "esxi-standalone", "hyperv"];

export function HypervisorsStep({ rows, onChange }: HypervisorsStepProps) {
  const { t } = useTranslation("setup");
  const patchRow = (id: string, patch: Partial<HypervisorRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const addRow = () => onChange([...rows, emptyHypervisorRow()]);

  return (
    <div className="space-y-5">
      <StepHeader title={t("hypervisors.title")} description={t("hypervisors.description")} />

      <p className="border-l-2 border-border pl-3 text-xs text-muted-foreground">
        {t("hypervisors.vmwareOnly")}
      </p>

      <div className="space-y-3">
        {rows.map((row, i) => {
          const partial = !isBlankRow(row) && !isCompleteRow(row);
          return (
            <div key={row.id} className="border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="label-overline">
                  {t("hypervisors.environmentN", { n: i + 1 })}
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeRow(row.id)}
                  aria-label={t("hypervisors.removeEnvironment", { n: i + 1 })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.id}-type`}>{t("hypervisors.typeLabel")}</Label>
                  <Select
                    value={row.type}
                    onValueChange={(v) => patchRow(row.id, { type: v as EnvironmentType })}
                  >
                    <SelectTrigger id={`${row.id}-type`} aria-label={t("hypervisors.typeAria")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {HYPERVISOR_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.id}-endpoint`}>{t("hypervisors.endpointLabel")}</Label>
                  <Input
                    id={`${row.id}-endpoint`}
                    value={row.endpoint}
                    onChange={(e) => patchRow(row.id, { endpoint: e.target.value })}
                    placeholder="https://vcenter01.corp.local"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.id}-username`}>{t("hypervisors.usernameLabel")}</Label>
                  <Input
                    id={`${row.id}-username`}
                    value={row.username}
                    onChange={(e) => patchRow(row.id, { username: e.target.value })}
                    placeholder="svc-altastor@vsphere.local"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.id}-credential`}>{t("hypervisors.credentialLabel")}</Label>
                  <Input
                    id={`${row.id}-credential`}
                    value={row.credentialRef}
                    onChange={(e) => patchRow(row.id, { credentialRef: e.target.value })}
                    placeholder="vault:secret/hv-lab"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("hypervisors.credentialHint")}
                  </p>
                </div>
              </div>

              {partial && (
                <p className="mt-3 text-xs text-warning-text">
                  {t("hypervisors.partialWarning")}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3.5 w-3.5" />
        {t("hypervisors.addAnother")}
      </Button>
    </div>
  );
}
