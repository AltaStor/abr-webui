// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Search, ServerOff, ShieldCheck } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { VmIcon } from "@/features/inventory/components/VmIcon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { useWorldStore } from "@/store/world";
import type { VM } from "@/types";

interface ChooseVmStepProps {
  onSelect: (vm: VM) => void;
}

/** Step 1 — searchable list of protected VMs. Picking one advances the wizard. */
export function ChooseVmStep({ onSelect }: ChooseVmStepProps) {
  const { t } = useTranslation("restore");
  const vms = useWorldStore((s) => s.vms);
  const environments = useWorldStore((s) => s.environments);
  const [query, setQuery] = useState("");

  const envName = useMemo(
    () => Object.fromEntries(environments.map((e) => [e.id, e.name])),
    [environments],
  );

  // Only VMs you can actually restore — anything with restore points.
  const restorable = useMemo(
    () =>
      vms
        .filter((v) => v.restorePointCount > 0 && v.protection !== "unprotected")
        .sort((a, b) => {
          const ta = a.lastBackupAt ? new Date(a.lastBackupAt).getTime() : 0;
          const tb = b.lastBackupAt ? new Date(b.lastBackupAt).getTime() : 0;
          return tb - ta;
        }),
    [vms],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return restorable;
    return restorable.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.guestOs.toLowerCase().includes(q) ||
        v.ipAddress.toLowerCase().includes(q) ||
        v.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [restorable, query]);

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{t("chooseVm.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("chooseVm.subtitle")}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chooseVm.searchPlaceholder")}
            className="pl-9"
            aria-label={t("chooseVm.searchAria")}
            autoFocus
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {filtered.length === 0 ? (
          query ? (
            <EmptyState
              icon={Search}
              title={t("chooseVm.noMatch.title")}
              description={t("chooseVm.noMatch.desc")}
              compact
            />
          ) : (
            <EmptyState
              icon={ServerOff}
              title={t("emptyPointsTitle")}
              description={t("chooseVm.empty.desc")}
              compact
            />
          )
        ) : (
          <ScrollArea className="-mx-1 max-h-[26rem] px-1">
            <ul className="space-y-1.5">
              {filtered.map((vm) => (
                <li key={vm.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(vm)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition-all",
                      "hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-sm",
                    )}
                  >
                    <VmIcon vm={vm} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{vm.name}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="truncate">{vm.guestOs}</span>
                        <span aria-hidden>·</span>
                        <span className="truncate">{envName[vm.environmentId] ?? t("chooseVm.unknownEnv")}</span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      <Badge variant="success" className="gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {t("points", { count: vm.restorePointCount })}
                      </Badge>
                      <span className="nums text-xs text-muted-foreground">
                        {t("lastBackup", { time: formatRelative(vm.lastBackupAt) })}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
