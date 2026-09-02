// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  X,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatRelative, formatStorage } from "@/lib/format";
import { PROTECTION_META } from "@/lib/status";
import { countByProtection } from "@/store/selectors";
import { useWorldStore } from "@/store/world";
import { useUiStore } from "@/store/ui";
import type { Environment, ProtectionStatus, VM } from "@/types";
import { VmIcon } from "./components/VmIcon";
import {
  ProtectionFilterChips,
  type ProtectionFilter,
} from "./components/ProtectionFilterChips";
import { ProtectionCoverageStrip } from "./components/ProtectionCoverageStrip";
import { POWER_META, osFamilyLabel } from "./components/vm-presentation";
import { EstateTree } from "./components/EstateTree";
import { AddEnvironmentDialog } from "./components/AddEnvironmentDialog";
import { EditEnvironmentDialog } from "./components/EditEnvironmentDialog";
import { DeleteEnvironmentDialog } from "./components/DeleteEnvironmentDialog";
import { buildTree, collectVmIds, type TreeNode } from "./topology";

type PowerFilter = "all" | VM["powerState"];
type OsFilter = "all" | VM["osFamily"];

function isProtectionStatus(v: string | null): v is ProtectionStatus {
  return v === "protected" || v === "warning" || v === "unprotected";
}

export default function InventoryPage() {
  const { t } = useTranslation("inventory");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addEnvOpen, setAddEnvOpen] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  // Live world data — re-renders on every simulation tick.
  const vms = useWorldStore((s) => s.vms);
  const environments = useWorldStore((s) => s.environments);
  const hosts = useWorldStore((s) => s.hosts);
  const jobs = useWorldStore((s) => s.jobs);
  const restorePoints = useWorldStore((s) => s.restorePoints);
  const rescanEnvironment = useWorldStore((s) => s.rescanEnvironment);

  // envFilter from the global UI store seeds the environment filter (optional).
  const globalEnvFilter = useUiStore((s) => s.envFilter);

  const protectionParam = searchParams.get("protection");
  // The estate tree's current selection — scopes the VM list below it. Null
  // means the whole estate (no scope).
  const [scope, setScope] = useState<TreeNode | null>(null);
  const [protection, setProtection] = useState<ProtectionFilter>(
    isProtectionStatus(protectionParam) ? protectionParam : "all",
  );
  const [envId, setEnvId] = useState<string>(globalEnvFilter !== "all" ? globalEnvFilter : "all");
  const [os, setOs] = useState<OsFilter>("all");
  const [power, setPower] = useState<PowerFilter>("all");
  const [search, setSearch] = useState("");

  // Keep the protection filter in sync if the Dashboard drills in with a new param.
  useEffect(() => {
    if (isProtectionStatus(protectionParam)) setProtection(protectionParam);
  }, [protectionParam]);

  const tree = useMemo(() => buildTree(environments, hosts, vms), [environments, hosts, vms]);

  const scopeVmIds = useMemo(() => (scope ? new Set(collectVmIds(scope)) : null), [scope]);

  const envName = useMemo(
    () => new Map(environments.map((e) => [e.id, e.name])),
    [environments],
  );
  const hostName = useMemo(() => new Map(hosts.map((h) => [h.id, h.name])), [hosts]);

  const counts = useMemo(() => countByProtection(vms), [vms]);

  // Map vmId -> first backup job that covers it, for the "Protect / Back up now" action.
  const jobForVm = useMemo(() => {
    const map = new Map<string, string>();
    for (const j of jobs) {
      for (const id of j.vmIds) if (!map.has(id)) map.set(id, j.id);
    }
    return map;
  }, [jobs]);

  // Map vmId -> total size of its restore points, surfaced in the protection
  // column's tooltip (the Backup size column itself was removed).
  const backupSizeByVm = useMemo(() => {
    const map = new Map<string, number>();
    for (const rp of restorePoints) {
      map.set(rp.vmId, (map.get(rp.vmId) ?? 0) + rp.sizeGB);
    }
    return map;
  }, [restorePoints]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vms.filter((v) => {
      if (scopeVmIds && !scopeVmIds.has(v.id)) return false;
      if (protection !== "all" && v.protection !== protection) return false;
      if (envId !== "all" && v.environmentId !== envId) return false;
      if (os !== "all" && v.osFamily !== os) return false;
      if (power !== "all" && v.powerState !== power) return false;
      if (q) {
        const hay = `${v.name} ${v.guestOs} ${v.ipAddress}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vms, scopeVmIds, protection, envId, os, power, search]);

  const setProtectionFilter = (next: ProtectionFilter) => {
    setProtection(next);
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("protection");
    else params.set("protection", next);
    setSearchParams(params, { replace: true });
  };

  // Count of the filters that live inside the Filters popover (the protection
  // chips and the search box stay inline, so they don't count toward the badge).
  const popoverFilterCount =
    (envId !== "all" ? 1 : 0) +
    (os !== "all" ? 1 : 0) +
    (power !== "all" ? 1 : 0);

  const hasActiveFilters =
    protection !== "all" || popoverFilterCount > 0 || search.trim() !== "" || scope !== null;

  const resetFilters = () => {
    setProtection("all");
    setEnvId("all");
    setOs("all");
    setPower("all");
    setSearch("");
    setScope(null);
    const params = new URLSearchParams(searchParams);
    params.delete("protection");
    setSearchParams(params, { replace: true });
  };

  // Clears only the four filters housed in the popover.
  const clearPopoverFilters = () => {
    setEnvId("all");
    setOs("all");
    setPower("all");
  };

  // The only way in the UI to pull freshly-discovered hosts/VMs from the
  // hypervisors into the tree — used to live behind "Expand all" on the old
  // Topology tab; now a standalone action next to the estate navigator.
  const handleRescan = async () => {
    if (rescanning || environments.length === 0) return;
    setRescanning(true);
    try {
      await Promise.all(environments.map((env) => rescanEnvironment(env.id)));
    } finally {
      setRescanning(false);
    }
  };

  const handleRescanEnvironment = (env: Environment) => {
    toast.info(t("sourceSettings.rescan"), { description: env.name });
    void rescanEnvironment(env.id);
  };

  const [deleteEnvTarget, setDeleteEnvTarget] = useState<Environment | null>(null);
  const [editEnvTarget, setEditEnvTarget] = useState<Environment | null>(null);

  const columns = useMemo<ColumnDef<VM, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("table.vm"),
        size: 260,
        cell: ({ row }) => {
          const vm = row.original;
          const env = envName.get(vm.environmentId) ?? vm.environmentId;
          return (
            <div className="flex items-center gap-2.5">
              <VmIcon vm={vm} />
              {/* min-w-0 lets the flex child shrink below its content width —
                  without it `truncate` never engages and the name pushes the
                  whole table wide. */}
              <div className="min-w-0 flex-1">
                <Hint label={vm.name}>
                  <span className="block truncate font-medium">{vm.name}</span>
                </Hint>
                <Hint label={`${env} · ${vm.ipAddress}`}>
                  <span className="block truncate text-xs text-muted-foreground">
                    {env} · {vm.ipAddress}
                  </span>
                </Hint>
              </div>
            </div>
          );
        },
      },
      {
        id: "host",
        header: t("table.host"),
        size: 170,
        accessorFn: (vm) => hostName.get(vm.hostId) ?? vm.hostId,
        cell: ({ row }) => {
          const host = hostName.get(row.original.hostId) ?? row.original.hostId;
          return (
            <Hint label={host}>
              <span className="block truncate text-sm text-muted-foreground">{host}</span>
            </Hint>
          );
        },
      },
      {
        id: "vmSize",
        header: t("table.vmSize"),
        size: 100,
        accessorFn: (vm) => vm.usedGB || vm.provisionedGB,
        cell: ({ row }) => (
          <span className="nums text-sm">
            {formatStorage(row.original.usedGB || row.original.provisionedGB, 0)}
          </span>
        ),
      },
      {
        accessorKey: "protection",
        header: t("table.protection"),
        size: 130,
        // Severity order so descending surfaces the most exposed VMs first.
        sortingFn: (a, b) => {
          const rank: Record<ProtectionStatus, number> = {
            protected: 0,
            warning: 1,
            unprotected: 2,
          };
          return rank[a.original.protection] - rank[b.original.protection];
        },
        cell: ({ row }) => {
          const vm = row.original;
          const note = vm.protectionNote ?? PROTECTION_META[vm.protection].label;
          // Backup size lost its own column — it's a figure you consult about a
          // specific VM, not one you scan down a list, so it rides the
          // protection tooltip instead. Shown whenever there IS stored data
          // (protected and at-risk VMs, and the rarer case of an unprotected VM
          // still holding points from a deleted job) — never as a bare "0 B".
          const backupGB = backupSizeByVm.get(vm.id) ?? 0;
          return (
            <Hint
              label={
                backupGB > 0 ? (
                  <>
                    <span className="block">{note}</span>
                    <span className="block text-muted-foreground">
                      {t("table.backupSize")}: {formatStorage(backupGB, 0)}
                    </span>
                  </>
                ) : (
                  note
                )
              }
            >
              <span className="inline-flex">
                <StatusPill meta={PROTECTION_META[vm.protection]} size="sm" />
              </span>
            </Hint>
          );
        },
      },
      {
        accessorKey: "lastBackupAt",
        header: t("table.lastBackup"),
        size: 130,
        sortingFn: (a, b) => {
          const av = a.original.lastBackupAt ? new Date(a.original.lastBackupAt).getTime() : 0;
          const bv = b.original.lastBackupAt ? new Date(b.original.lastBackupAt).getTime() : 0;
          return av - bv;
        },
        cell: ({ row }) => (
          <span className="nums text-sm text-muted-foreground">
            {formatRelative(row.original.lastBackupAt)}
          </span>
        ),
      },
      {
        accessorKey: "restorePointCount",
        header: t("table.points"),
        size: 80,
        cell: ({ row }) => (
          <span className="nums text-sm">{row.original.restorePointCount}</span>
        ),
      },
      // Guest OS sits at the END and carries only the family (Windows / Linux /
      // macOS) — the full product string ("Microsoft Windows Server 2022
      // (64-bit)") is the widest value in the table and the least often scanned,
      // so it lives in the hover tooltip instead of a wide column.
      {
        id: "guestOs",
        header: t("table.guestOs"),
        size: 110,
        // Sort by the family shown, not the raw product string behind the
        // tooltip — sorting a column by a value it doesn't display is a
        // usability trap ("Windows 11" and "Windows Server 2022" would sort
        // apart under one identical-looking label).
        accessorFn: (vm) => osFamilyLabel(vm.osFamily),
        cell: ({ row }) => {
          const vm = row.original;
          return (
            <Hint label={vm.guestOs || osFamilyLabel(vm.osFamily)}>
              <span className="block truncate text-sm text-muted-foreground">
                {osFamilyLabel(vm.osFamily)}
              </span>
            </Hint>
          );
        },
      },
      {
        id: "action",
        header: "",
        size: 110,
        enableSorting: false,
        cell: ({ row }) => {
          const vm = row.original;
          if (vm.protection === "protected") {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100 sm:focus-visible:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/restore?vm=${vm.id}`);
                }}
              >
                {t("actions.restore")}
              </Button>
            );
          }
          const coveringJob = jobForVm.get(vm.id);
          return (
            <Button
              variant="subtle"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate(coveringJob ? `/jobs/${coveringJob}` : `/jobs/new/backup?vm=${vm.id}`);
              }}
            >
              <Shield className="h-3.5 w-3.5" />
              {t("actions.protect")}
            </Button>
          );
        },
      },
    ],
    [envName, hostName, jobForVm, backupSizeByVm, navigate, t],
  );

  const runningCount = vms.filter((v) => v.powerState === "running").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("page.title")}
        icon={Server}
        description={t("header.description", { vms: vms.length, envs: environments.length, running: runningCount })}
        actions={
          <>
            <Hint label="Rescan connected sources">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRescan()}
                disabled={rescanning || environments.length === 0}
              >
                <RefreshCw className={cn("h-4 w-4", rescanning && "animate-spin")} />
                {rescanning ? "Rescanning…" : t("actions.rescanAll")}
              </Button>
            </Hint>
            <Button size="sm" onClick={() => setAddEnvOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("actions.addEnvironment")}
            </Button>
          </>
        }
      />

      {/* One compact coverage line — proportion + %, not a KPI grid restating the dashboard. */}
      <ProtectionCoverageStrip
        counts={counts}
        total={vms.length}
        running={runningCount}
      />

      {/* Toolbar: protection chips + filters + search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ProtectionFilterChips
          value={protection}
          counts={counts}
          total={vms.length}
          onChange={setProtectionFilter}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                aria-label={
                  popoverFilterCount > 0
                    ? t("filters.active", { count: popoverFilterCount })
                    : t("filters.title")
                }
              >
                <SlidersHorizontal className="h-4 w-4" />
                {t("filters.title")}
                {popoverFilterCount > 0 && (
                  <Badge
                    variant="default"
                    className="ml-0.5 h-5 min-w-5 justify-center px-1.5 nums"
                    aria-hidden
                  >
                    {popoverFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t("filters.title")}</p>
                {popoverFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearPopoverFilters}
                    className="-mr-1.5 h-7 text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("filters.clear")}
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-environment">{t("filters.environment")}</Label>
                <Select value={envId} onValueChange={setEnvId}>
                  <SelectTrigger id="filter-environment" className="h-9 w-full">
                    <SelectValue placeholder={t("filters.placeholderEnvironment")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.allEnvironments")}</SelectItem>
                    {environments.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-os">{t("filters.os")}</Label>
                <Select value={os} onValueChange={(v) => setOs(v as OsFilter)}>
                  <SelectTrigger id="filter-os" className="h-9 w-full">
                    <SelectValue placeholder={t("filters.placeholderOs")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.allOs")}</SelectItem>
                    <SelectItem value="windows">{t("filters.windows")}</SelectItem>
                    <SelectItem value="linux">{t("filters.linux")}</SelectItem>
                    <SelectItem value="macos">{t("filters.macos")}</SelectItem>
                    <SelectItem value="unknown">{t("filters.unknown")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-power">{t("filters.power")}</Label>
                <Select value={power} onValueChange={(v) => setPower(v as PowerFilter)}>
                  <SelectTrigger id="filter-power" className="h-9 w-full">
                    <SelectValue placeholder={t("filters.placeholderPower")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.anyPower")}</SelectItem>
                    {(Object.keys(POWER_META) as VM["powerState"][]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {POWER_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.vmsPlaceholder")}
              className="h-9 w-[200px] pl-8"
              aria-label={t("search.vmsAria")}
            />
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              {t("filters.clear")}
            </Button>
          )}
        </div>
      </div>

      {/* Body: the estate tree on the left, scoping the VM list on the right. */}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-max overflow-hidden">
          <ScopeHeader scope={scope} onClear={() => setScope(null)} total={vms.length} />
          <div className="max-h-[64vh] overflow-y-auto p-2">
            <EstateTree
              tree={tree}
              selectedKey={scope?.key ?? null}
              onSelectScope={setScope}
              onEditEnvironment={setEditEnvTarget}
              onRescanEnvironment={handleRescanEnvironment}
              onDeleteEnvironment={setDeleteEnvTarget}
            />
          </div>
        </Card>

        <div className="min-w-0">
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(v) => v.id}
            onRowClick={(v) => navigate(`/inventory/${v.id}`)}
            initialSorting={[{ id: "protection", desc: true }]}
            pageSize={10}
            // Narrowing the estate should show the result from the top; a
            // background refresh of the same VMs should not move the page.
            resetPageKey={`${scope?.key ?? ""}|${protection}|${envId}|${os}|${power}|${search.trim()}`}
            fixedLayout
            rowClassName={() => "group/row"}
            emptyState={
              <EmptyState
                icon={Server}
                title={hasActiveFilters ? t("empty.vmsFilteredTitle") : t("empty.vmsTitle")}
                description={hasActiveFilters ? t("empty.vmsFilteredDesc") : t("empty.vmsDesc")}
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      {t("empty.clearFilters")}
                    </Button>
                  ) : undefined
                }
                compact
              />
            }
          />
        </div>
      </div>

      <AddEnvironmentDialog open={addEnvOpen} onOpenChange={setAddEnvOpen} />
      <EditEnvironmentDialog
        environment={editEnvTarget}
        open={editEnvTarget !== null}
        onOpenChange={(o) => !o && setEditEnvTarget(null)}
      />
      <DeleteEnvironmentDialog
        environment={deleteEnvTarget}
        open={deleteEnvTarget !== null}
        onOpenChange={(o) => !o && setDeleteEnvTarget(null)}
      />
    </div>
  );
}

/* --------------------------------- scope ---------------------------------- */

function ScopeHeader({
  scope,
  onClear,
  total,
}: {
  scope: TreeNode | null;
  onClear: () => void;
  total: number;
}) {
  const { t } = useTranslation("inventory");
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
      <button
        type="button"
        onClick={onClear}
        aria-current={scope === null ? "true" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          scope === null ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Server className="h-4 w-4" />
        {t("scope.allVms")}
        <span className="nums text-xs text-muted-foreground">{total}</span>
      </button>
      {scope !== null && (
        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
          {t("common:actions.clear")}
        </Button>
      )}
    </div>
  );
}

