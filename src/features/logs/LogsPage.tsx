// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, Download, FileText, Package, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toneChip, toneFg, type Tone } from "@/lib/status";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { downloadBlob, downloadText, fileStamp } from "@/lib/download";
import { apiErrorMessage, getSupportBundle } from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import { buildLiveSystemLog, buildLogsWorld } from "./mock";
import { SystemLogTab } from "./components/SystemLogTab";

interface StatTile {
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIcon;
}

export default function LogsPage() {
  const { t } = useTranslation("logs");
  const sessions = useWorldStore((s) => s.sessions);
  const threats = useWorldStore((s) => s.threats);
  const alerts = useWorldStore((s) => s.alerts);
  const vms = useWorldStore((s) => s.vms);
  const revision = useWorldStore((s) => s.revision);
  const mode = useWorldStore((s) => s.mode);
  const liveLogs = useWorldStore((s) => s.liveLogs);

  // One deterministic build; refresh only when the world revision changes so
  // derived-from-store lines stay in sync without re-seeding on every render.
  const logs = useMemo(
    () => buildLogsWorld({ sessions, threats, alerts, vms }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, sessions, threats, alerts, vms],
  );

  // System is REAL in LIVE mode — derived straight from the live world
  // (alerts, per-session backup logs). Sim keeps the mock.
  const system = useMemo(
    () => (mode === "live" ? buildLiveSystemLog({ alerts, liveLogs, sessions }) : logs.system),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, revision, alerts, liveLogs, sessions, logs],
  );

  const stats = useMemo<StatTile[]>(() => {
    const dayAgo = Date.now() - 24 * 3_600_000;
    const inDay = (iso: string) => new Date(iso).getTime() >= dayAgo;

    const warnings24 = system.filter((e) => inDay(e.ts) && (e.level === "error" || e.level === "warn")).length;
    const agentEvents24 = system.filter((e) => inDay(e.ts) && e.source === "agent").length;

    return [
      {
        label: t("stats.systemWarnings"),
        value: warnings24,
        tone: warnings24 > 0 ? "warning" : "success",
        icon: FileText,
      },
      {
        label: t("stats.agentEvents"),
        value: agentEvents24,
        tone: agentEvents24 > 0 ? "info" : "muted",
        icon: Cpu,
      },
    ];
  }, [system, t]);

  const onExportSupportBundle = async () => {
    try {
      const { blob, filename } = await getSupportBundle();
      downloadBlob(filename, blob);
      toast.success(t("toast.exportedSupportBundle"));
    } catch (err) {
      toast.error(t("toast.exportSupportBundleFailed"), {
        description: apiErrorMessage(err) ?? undefined,
      });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />
                {t("actions.export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t("export.menuLabel")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void onExportSupportBundle()}>
                <Package className="mr-2 h-4 w-4" />
                {t("export.supportBundle")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  downloadText(
                    `altastor-system-${fileStamp()}.log`,
                    system.map((e) => `${e.ts} ${e.level.toUpperCase()} [${e.source}] ${e.message}`).join("\n"),
                  );
                  toast.success(t("toast.exportedSystem", { count: system.length }));
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                {t("export.systemLog")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-card"
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneChip(s.tone))}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <span className={cn("nums block text-xl font-semibold leading-none tracking-tight", toneFg(s.tone))}>
                  {s.value}
                </span>
                <p className="mt-1 truncate text-xs text-muted-foreground" title={s.label}>{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <SystemLogTab entries={system} mode={mode} />
    </div>
  );
}
