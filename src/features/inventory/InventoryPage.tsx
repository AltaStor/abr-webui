// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  X,
} from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import { formatStorage } from "@/lib/format";
import { TimeStamp } from "@/components/TimeStamp";
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
import { ResizeHandle, useResizablePanel } from "@/components/ResizablePanel";
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

  const treeRow = useResizablePanel("altastor.inventory.estate-width", 300);

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

  // Map vmId -> total size of its restore points, for the Backup size column.
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

  // The attribute selects on the toolbar.
  const selectFilterCount =
    (envId !== "all" ? 1 : 0) +
    (os !== "all" ? 1 : 0) +
    (power !== "all" ? 1 : 0);

  // What "Clear filters" is allowed to appear for. The protection chips are
  // self-clearing — the "All" chip sits right there in the same control — so a
  // chip alone must not summon a second button that undoes it; that reads as
  // noise every time the operator taps a status. A select, the search box or a
  // tree scope has no such escape hatch beside it, so those do summon it. The
  // button still clears everything, protection included, when it is shown.
  const hasClearableFilters = selectFilterCount > 0 || search.trim() !== "" || scope !== null;

  // The empty state is a different question: "no rows match" is worth offering
  // to undo whatever caused it, chip included.
  const hasActiveFilters = protection !== "all" || hasClearableFilters;

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

  // The only way in the UI to pull freshly-discovered hosts/VMs from the
  // hypervisors into the tree — used to live behind "Expand all" on the old
  // Topology tab; now a standalone action next to the estate navigator.
  //
  // `rescanEnvironment` resolves to null when the appliance could not reach the
  // environment, so every rescan has a verdict — and the operator gets it.
  // Silence used to be the only outcome either way.
  const handleRescan = async () => {
    if (rescanning || environments.length === 0) return;
    setRescanning(true);
    try {
      const results = await Promise.all(environments.map((env) => rescanEnvironment(env.id)));
      const answered = results.filter((r) => r !== null).length;
      const total = results.length;
      if (answered === total) {
        toast.success(t("rescan.doneTitle"), {
          description: t("rescan.doneDesc", { count: total }),
        });
      } else if (answered === 0) {
        toast.error(t("rescan.failedTitle"), {
          description: t("rescan.failedDesc", { count: total }),
        });
      } else {
        toast.warning(t("rescan.partialTitle"), {
          description: t("rescan.partialDesc", { ok: answered, total }),
        });
      }
    } finally {
      setRescanning(false);
    }
  };

  const handleRescanEnvironment = async (env: Environment) => {
    const result = await rescanEnvironment(env.id);
    if (result) {
      toast.success(t("rescan.oneDoneTitle", { name: env.name }), {
        description: t("rescan.oneDoneDesc", { count: result.vmCount }),
      });
    } else {
      toast.error(t("rescan.oneFailedTitle", { name: env.name }), {
        description: t("rescan.oneFailedDesc"),
      });
    }
  };

  const [deleteEnvTarget, setDeleteEnvTarget] = useState<Environment | null>(null);
  const [editEnvTarget, setEditEnvTarget] = useState<Environment | null>(null);

  const columns = useMemo<ColumnDef<VM, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("table.vm"),
        cell: ({ row }) => {
          const vm = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <VmIcon vm={vm} />
              <div className="min-w-0 max-w-[240px]">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{vm.name}</span>
                </div>
                <span className="block truncate text-xs text-muted-foreground">
                  {envName.get(vm.environmentId) ?? vm.environmentId} · {vm.ipAddress}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: "host",
        header: t("table.host"),
        accessorFn: (vm) => hostName.get(vm.hostId) ?? vm.hostId,
        cell: ({ row }) => {
          const host = hostName.get(row.original.hostId) ?? row.original.hostId;
          return (
            <Hint label={host}>
              <span className="block max-w-[180px] truncate text-sm text-muted-foreground">
                {host}
              </span>
            </Hint>
          );
        },
      },
      {
        id: "vmSize",
        header: t("table.vmSize"),
        /* The orchestrator reports disk capacity but not per-VM used bytes, so this
         * column falls back to provisioned. The header hint says which number the
         * reader is looking at — the demo world does populate usedGB, and one
         * unlabelled column that silently changes meaning between the two is
         * exactly the kind of thing an operator sizes a repository against. */
        meta: { tooltip: t("table.vmSizeHint") },
        accessorFn: (vm) => vm.usedGB || vm.provisionedGB,
        cell: ({ row }) => (
          <span className="nums text-sm">
            {formatStorage(row.original.usedGB || row.original.provisionedGB, 0)}
          </span>
        ),
      },
      {
        id: "backupSize",
        header: t("table.backupSize"),
        meta: { tooltip: t("table.backupSizeHint") },
        accessorFn: (vm) => backupSizeByVm.get(vm.id) ?? 0,
        cell: ({ row }) => (
          <span className="nums text-sm">
            {formatStorage(backupSizeByVm.get(row.original.id) ?? 0, 0)}
          </span>
        ),
      },
      {
        accessorKey: "protection",
        header: t("table.protection"),
        meta: { tooltip: t("table.protectionHint") },
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
          return (
            <Hint label={vm.protectionNote ?? PROTECTION_META[vm.protection].label}>
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
        meta: { tooltip: t("table.lastBackupHint") },
        sortingFn: (a, b) => {
          const av = a.original.lastBackupAt ? new Date(a.original.lastBackupAt).getTime() : 0;
          const bv = b.original.lastBackupAt ? new Date(b.original.lastBackupAt).getTime() : 0;
          return av - bv;
        },
        cell: ({ row }) => <TimeStamp value={row.original.lastBackupAt} />,
      },
      {
        accessorKey: "restorePointCount",
        header: t("table.points"),
        meta: { tooltip: t("table.pointsHint") },
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
        enableSorting: false,
        cell: ({ row }) => {
          const vm = row.original;
          // The row itself is clickable, so each link stops the click from also
          // reaching the row's own navigation.
          if (vm.protection === "protected") {
            return (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100 sm:focus-visible:opacity-100"
              >
                <Link to={`/restore?vm=${vm.id}`} onClick={(e) => e.stopPropagation()}>
                  {t("actions.restore")}
                </Link>
              </Button>
            );
          }
          const coveringJob = jobForVm.get(vm.id);
          return (
            <Button asChild variant="subtle" size="sm">
              <Link
                to={coveringJob ? `/jobs/${coveringJob}` : `/jobs/new/backup?vm=${vm.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Shield className="h-3.5 w-3.5" />
                {t("actions.protect")}
              </Link>
            </Button>
          );
        },
      },
    ],
    [envName, hostName, jobForVm, backupSizeByVm, t],
  );

  const runningCount = vms.filter((v) => v.powerState === "running").length;
  // How much data is actually exposed, not just how many VMs are. A count of
  // three unprotected VMs says nothing about whether that is a scratch box or
  // the file server — the strip's percentage is a share, and this is its
  // magnitude. Used bytes where the orchestrator reports them, provisioned
  // where it doesn't, matching the VM size column's own fallback.
  const exposedGB = useMemo(
    () =>
      vms.reduce(
        (gb, v) => (v.protection === "protected" ? gb : gb + (v.usedGB || v.provisionedGB)),
        0,
      ),
    [vms],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("page.title")}
        description={t("header.description", { vms: vms.length, envs: environments.length, running: runningCount })}
        actions={
          <>
            {/* Default size (h-9), not sm (h-8): the header actions and every
                control on the toolbar below settle on one height. */}
            <Hint label={t("rescan.tooltip")}>
              <Button
                variant="outline"
                onClick={() => void handleRescan()}
                disabled={rescanning || environments.length === 0}
              >
                <RefreshCw className={cn("h-4 w-4", rescanning && "animate-spin")} />
                {rescanning ? t("rescan.running") : t("actions.rescanAll")}
              </Button>
            </Hint>
            <Button onClick={() => setAddEnvOpen(true)}>
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
        exposedGB={exposedGB}
      />

      {/* Toolbar. The filters used to hide behind a "Filters" popover while
          Backup jobs put its filter inline beside a wide search — same job, two
          grammars. This is the Backup jobs grammar: a search that takes the
          slack, the selects beside it, nothing hidden.

          Two tiers, not one row. Protection is the estate's primary
          segmentation and stays a control of its own; the selects narrow within
          it. Below `lg` the search takes its own line and the selects wrap in
          pairs — full width below `sm`. */}
      <div className="space-y-3">
        <ProtectionFilterChips
          value={protection}
          counts={counts}
          total={vms.length}
          onChange={setProtectionFilter}
        />

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          {/* The 16rem floor is what makes the row wrap instead of collapse: a
              search box you cannot read your own query in is worse than a
              second line. */}
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.vmsPlaceholder")}
              className="pl-9"
              aria-label={t("search.vmsAria")}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={envId} onValueChange={setEnvId}>
              <SelectTrigger
                id="filter-environment"
                aria-label={t("filters.environment")}
                className="w-full sm:w-40"
              >
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

            <Select value={os} onValueChange={(v) => setOs(v as OsFilter)}>
              <SelectTrigger id="filter-os" aria-label={t("filters.os")} className="w-full sm:w-40">
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

            <Select value={power} onValueChange={(v) => setPower(v as PowerFilter)}>
              <SelectTrigger id="filter-power" aria-label={t("filters.power")} className="w-full sm:w-40">
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

            {hasClearableFilters && (
              <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
                <X className="h-3.5 w-3.5" />
                {t("filters.clear")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body: the estate tree on the left, scoping the VM list on the right. */}
      <div
        ref={treeRow.rowRef}
        className="grid gap-4 lg:grid-cols-[var(--estate-w)_minmax(0,1fr)]"
        style={{ "--estate-w": `${treeRow.width}px` } as React.CSSProperties}
      >
        {/* `relative` anchors the drag strip, which sits in the grid gap. */}
        <Card className="relative h-max overflow-visible">
          <ScopeHeader scope={scope} onClear={() => setScope(null)} total={vms.length} />
          <div className="max-h-[64vh] overflow-y-auto overflow-x-hidden p-2">
            <EstateTree
              tree={tree}
              selectedKey={scope?.key ?? null}
              onSelectScope={setScope}
              onEditEnvironment={setEditEnvTarget}
              onRescanEnvironment={(env) => void handleRescanEnvironment(env)}
              onDeleteEnvironment={setDeleteEnvTarget}
            />
          </div>
          <ResizeHandle
            width={treeRow.width}
            onCommit={treeRow.commit}
            onReset={treeRow.reset}
            label={t("estate.resizeLabel")}
          />
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
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <button
        type="button"
        onClick={onClear}
        aria-current={scope === null ? "true" : undefined}
        className={cn(
          "flex items-center gap-2 px-1.5 py-1 text-left text-sm transition-colors",
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

