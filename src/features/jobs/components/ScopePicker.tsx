// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Server, X } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatStorage } from "@/lib/format";
import { PROTECTION_META, toneFg } from "@/lib/status";
import { useWorldStore } from "@/store/world";
import { VmIcon } from "@/features/inventory/components/VmIcon";
import type { Environment, VM } from "@/types";

interface ScopePickerProps {
  /** Currently-selected VM ids. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/** Hard cap on rendered rows so ~140 VMs stay snappy; search narrows the rest. */
const RENDER_CAP = 60;

export function ScopePicker({ selected, onChange }: ScopePickerProps) {
  const { t } = useTranslation("jobs");
  const vms = useWorldStore((s) => s.vms);
  const environments = useWorldStore((s) => s.environments);
  const [query, setQuery] = useState("");

  const envById = useMemo(() => {
    const m = new Map<string, Environment>();
    for (const e of environments) m.set(e.id, e);
    return m;
  }, [environments]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? vms.filter((v) => v.name.toLowerCase().includes(q)) : vms),
    [vms, q],
  );

  // Group matches by environment.
  const groups = useMemo(() => {
    const byEnv = new Map<string, VM[]>();
    for (const vm of matches) {
      const arr = byEnv.get(vm.environmentId) ?? [];
      arr.push(vm);
      byEnv.set(vm.environmentId, arr);
    }
    return [...byEnv.entries()].sort(
      (a, b) => (envById.get(a[0])?.name ?? "").localeCompare(envById.get(b[0])?.name ?? ""),
    );
  }, [matches, envById]);

  const toggleVm = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleGroup = (envVms: VM[], allSelected: boolean) => {
    const next = new Set(selected);
    for (const vm of envVms) {
      if (allSelected) next.delete(vm.id);
      else next.add(vm.id);
    }
    onChange(next);
  };

  // usedGB stays 0 until a VM's first full backup lands — fall back to
  // provisioned capacity so a never-backed-up VM's real current size still
  // counts toward the tally instead of reading as 0 B.
  const totalSize = useMemo(
    () => vms.filter((v) => selected.has(v.id)).reduce((a, v) => a + (v.usedGB || v.provisionedGB), 0),
    [vms, selected],
  );

  let rendered = 0;
  const capped = q ? false : matches.length > RENDER_CAP;

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("scope.searchVmsPlaceholder")}
          className="pl-9 pr-9"
          aria-label={t("scope.searchVmsLabel")}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={t("scope.clearSearch")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Grouped VM list */}
      <div className="max-h-80 overflow-y-auto border border-border">
        {groups.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Server className="h-4 w-4" />
            {t("scope.noVmsMatch", { query })}
          </div>
        ) : (
          groups.map(([envId, envVms]) => {
            const env = envById.get(envId);
            const selectedInGroup = envVms.filter((v) => selected.has(v.id)).length;
            const allSelected = selectedInGroup === envVms.length;
            return (
              <div key={envId} className="border-b border-border/50 last:border-0">
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-card px-3 py-1.5">
                  <Checkbox
                    checked={allSelected ? true : selectedInGroup ? "indeterminate" : false}
                    onCheckedChange={() => toggleGroup(envVms, allSelected)}
                    aria-label={t("scope.selectAllIn", { env: env?.name ?? envId })}
                  />
                  <span className="text-xs font-semibold">{env?.name ?? envId}</span>
                  <span className="nums text-[11px] text-muted-foreground">
                    {selectedInGroup}/{envVms.length}
                  </span>
                </div>
                {envVms.map((vm) => {
                  if (capped && rendered >= RENDER_CAP) return null;
                  rendered += 1;
                  const on = selected.has(vm.id);
                  const meta = PROTECTION_META[vm.protection];
                  const ProtIcon = meta.icon;
                  return (
                    <label
                      key={vm.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-muted/40",
                        on && "bg-primary/[0.04]",
                      )}
                    >
                      <Checkbox checked={on} onCheckedChange={() => toggleVm(vm.id)} aria-label={t("scope.selectVm", { name: vm.name })} />
                      <VmIcon vm={vm} />
                      <span className="min-w-0 flex-1 truncate text-sm">{vm.name}</span>
                      <span className="hidden items-center gap-1 sm:flex">
                        <ProtIcon className={cn("h-3 w-3", toneFg(meta.tone))} />
                      </span>
                      <span className="nums w-16 shrink-0 text-right text-xs text-muted-foreground">
                        {formatStorage(vm.usedGB || vm.provisionedGB, 0)}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })
        )}
        {capped && rendered >= RENDER_CAP && (
          <div className="bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
            {t("scope.showingFirstVms", { count: RENDER_CAP })}
          </div>
        )}
      </div>

      {/* Running tally */}
      <div className="flex items-center justify-between bg-muted/30 px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5">
          <Badge variant={selected.size ? "default" : "outline"}>{selected.size}</Badge>
          <span className="text-muted-foreground">{t("scope.vmsSelected", { count: selected.size })}</span>
        </span>
        <span className="nums font-medium">{formatStorage(totalSize)}</span>
      </div>
    </div>
  );
}
