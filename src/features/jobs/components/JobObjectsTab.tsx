// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import { Server } from "@/lib/icons";
import { DataTable } from "@/components/DataTable";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/ui/tooltip";
import { formatStorage } from "@/lib/format";
import { TimeStamp } from "@/components/TimeStamp";
import { PROTECTION_META } from "@/lib/status";
import { useWorldStore } from "@/store/world";
import type { BackupJob, ProtectionStatus, VM } from "@/types";
import type { VmDetailOrigin } from "@/features/inventory/VmDetailPage";
import { VmIcon } from "@/features/inventory/components/VmIcon";
import { osFamilyLabel } from "@/features/inventory/components/vm-presentation";

interface Props {
  job: BackupJob;
}

/** Shared header line: resolved count + scope summary + dropped-id note. */
function ScopeLine({ job, resolved }: { job: BackupJob; resolved: number }) {
  const { t } = useTranslation("jobs");
  const missing = job.vmIds.length - resolved;
  return (
    <p className="text-xs text-muted-foreground">
      <span className="nums font-medium text-foreground">{resolved}</span>{" "}
      {/* `objects.virtualMachine` is the column heading ("Virtual machine"); the
          counted noun is `vmNoun`, so the line reads "1 VM" / "3 VMs" in one
          register instead of switching to the long form at exactly one. */}
      {resolved === 1 ? t("objects.vmNoun") : t("objects.vms")} {t("objects.inScopeSummary", { summary: job.scopeSummary })}
      {missing > 0 && (
        <span className="text-warning">
          {" "}
          · <span className="nums">{missing}</span> {t("objects.noLongerInInventory")}
        </span>
      )}
    </p>
  );
}

/** The VMs this job actually protects — its `vmIds` resolved against live inventory. */
export function JobObjectsTab({ job }: Props) {
  const { t } = useTranslation("jobs");
  const navigate = useNavigate();
  const vms = useWorldStore((s) => s.vms);
  const environments = useWorldStore((s) => s.environments);
  const restorePoints = useWorldStore((s) => s.restorePoints);

  const envName = useMemo(() => new Map(environments.map((e) => [e.id, e.name])), [environments]);

  // Map vmId -> total size of its restore points, for the Backup size column.
  const backupSizeByVm = useMemo(() => {
    const map = new Map<string, number>();
    for (const rp of restorePoints) {
      map.set(rp.vmId, (map.get(rp.vmId) ?? 0) + rp.sizeGB);
    }
    return map;
  }, [restorePoints]);

  // Resolve the job's scope to real VMs; ids without a matching VM (e.g. a
  // machine removed from inventory) are dropped and reported below.
  const scopeVms = useMemo(() => {
    const byId = new Map(vms.map((v) => [v.id, v]));
    return job.vmIds.map((id) => byId.get(id)).filter((v): v is VM => v !== undefined);
  }, [vms, job.vmIds]);

  const columns = useMemo<ColumnDef<VM, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("objects.virtualMachine"),
        cell: ({ row }) => {
          const vm = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <VmIcon vm={vm} />
              <div className="min-w-0">
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
        accessorKey: "guestOs",
        header: t("objects.guestOs"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-sm">{row.original.guestOs}</span>
            <span className="text-xs text-muted-foreground">{osFamilyLabel(row.original.osFamily)}</span>
          </div>
        ),
      },
      {
        id: "vmSize",
        header: t("objects.vmSize"),
        accessorFn: (vm) => vm.usedGB || vm.provisionedGB,
        cell: ({ row }) => (
          <span className="nums text-sm">
            {formatStorage(row.original.usedGB || row.original.provisionedGB, 0)}
          </span>
        ),
      },
      {
        id: "backupSize",
        header: t("objects.backupSize"),
        accessorFn: (vm) => backupSizeByVm.get(vm.id) ?? 0,
        cell: ({ row }) => (
          <span className="nums text-sm">{formatStorage(backupSizeByVm.get(row.original.id) ?? 0, 0)}</span>
        ),
      },
      {
        accessorKey: "protection",
        header: t("objects.protection"),
        meta: { tooltip: t("objects.protectionHint") },
        // Severity order so descending surfaces the most exposed VMs first.
        sortingFn: (a, b) => {
          const rank: Record<ProtectionStatus, number> = { protected: 0, warning: 1, unprotected: 2 };
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
        header: t("objects.lastBackup"),
        meta: { tooltip: t("objects.lastBackupHint") },
        sortingFn: (a, b) => {
          const av = a.original.lastBackupAt ? new Date(a.original.lastBackupAt).getTime() : 0;
          const bv = b.original.lastBackupAt ? new Date(b.original.lastBackupAt).getTime() : 0;
          return av - bv;
        },
        cell: ({ row }) => <TimeStamp value={row.original.lastBackupAt} />,
      },
      {
        accessorKey: "restorePointCount",
        header: t("objects.points"),
        meta: { tooltip: t("objects.pointsHint") },
        cell: ({ row }) => <span className="nums text-sm">{row.original.restorePointCount}</span>,
      },
    ],
    [envName, backupSizeByVm, t],
  );

  return (
    <div className="space-y-3">
      <ScopeLine job={job} resolved={scopeVms.length} />

      <DataTable
        columns={columns}
        data={scopeVms}
        getRowId={(v) => v.id}
        // Clicking a row leaves the job for the VM's own page. The trip is
        // announced in that page's back link, which needs to know where it came
        // from — carried in navigation state, not in the URL, so the address of
        // a VM page is the same however it was reached.
        onRowClick={(v) => navigate(`/inventory/${v.id}`, { state: { fromJobId: job.id } satisfies VmDetailOrigin })}
        initialSorting={[{ id: "protection", desc: true }]}
        pageSize={10}
        emptyState={
          <EmptyState
            icon={Server}
            title={t("objects.vmEmptyTitle")}
            description={t("objects.vmEmptyDescription")}
            compact
          />
        }
      />
    </div>
  );
}
