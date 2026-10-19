// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Cpu, FileText, Loader2, Package, RotateCw, type LucideIcon } from "@/lib/icons";
import { type Tone } from "@/lib/status";
import { PageHeader } from "@/components/PageHeader";
import { KpiBand } from "@/components/KpiBand";
import { KpiCard } from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { downloadBlob } from "@/lib/download";
import { qk } from "@/lib/query";
import { apiErrorMessage, getSupportBundle, listSystemLog, type SystemLogRow } from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import { buildLiveSystemLog, buildLogsWorld } from "./mock";
import type { SystemLogEntry } from "./types";
import { SystemLogTab } from "./components/SystemLogTab";
import { AuditLogTab } from "./components/AuditLogTab";

interface StatTile {
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIcon;
}

/** How much of the appliance's log to pull per refresh. Deep enough that a
 *  night of scheduled runs fits, bounded so the page never asks for megabytes. */
const SYSTEM_LOG_LIMIT = 1000;
/** The appliance writes continuously; a page left open should keep up without
 *  the operator reloading it. */
const SYSTEM_LOG_REFRESH_MS = 15_000;

/** Server log line → the entry shape the log view and the exports speak. */
function toSystemEntry(row: SystemLogRow): SystemLogEntry {
  return { id: row.id, ts: row.ts, level: row.level, source: row.source, message: row.message };
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
  const live = mode === "live";
  const canSystemLog = useCan("system.logs");
  const canAudit = useCan("audit.view");
  const canBundle = useCan("system.support_bundle");

  /* The system log and the audit log, each for the roles that may read it;
   * the tab lives in the URL so a link can open the audit log directly. */
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") === "audit" && canAudit) || !canSystemLog ? "audit" : "system";
  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "system") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  // One deterministic build; refresh only when the world revision changes so
  // derived-from-store lines stay in sync without re-seeding on every render.
  const logs = useMemo(
    () => buildLogsWorld({ sessions, threats, alerts, vms }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, sessions, threats, alerts, vms],
  );

  /* The appliance's OWN log (GET /system/logs) — the scheduler, TLS, database
   * and API chatter that no other view carries. Polled rather than streamed:
   * a log tail is cheap and there is no push channel for it. */
  const serverLog = useQuery({
    queryKey: qk.systemLog,
    queryFn: () => listSystemLog({ limit: SYSTEM_LOG_LIMIT }),
    enabled: live && canSystemLog,
    refetchInterval: SYSTEM_LOG_REFRESH_MS,
  });

  /* What the page showed before the appliance served its log: alerts plus the
   * per-session backup lines. Strictly less than the real thing — it can only
   * repeat what the API already returned elsewhere — so it is the FALLBACK for
   * an appliance too old to answer /system/logs, not the primary source. */
  const derived = useMemo(
    () => (live ? buildLiveSystemLog({ alerts, liveLogs, sessions }) : logs.system),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, revision, alerts, liveLogs, sessions, logs],
  );

  const system = useMemo(() => {
    if (!live) return logs.system;
    const rows = serverLog.data?.entries;
    return rows ? rows.map(toSystemEntry) : derived;
  }, [live, logs.system, derived, serverLog.data]);

  /* Two honest counts off whatever `system` holds. The page used to tile "agent
   * events", which only meant anything while the log was assembled from session
   * lines — the appliance's real log has no such source, and a tile pinned at
   * zero is worse than no tile. */
  const stats = useMemo<StatTile[]>(() => {
    const dayAgo = Date.now() - 24 * 3_600_000;
    const inDay = (iso: string) => new Date(iso).getTime() >= dayAgo;

    const errors24 = system.filter((e) => inDay(e.ts) && e.level === "error").length;
    const warnings24 = system.filter((e) => inDay(e.ts) && e.level === "warn").length;

    return [
      {
        label: t("stats.systemErrors"),
        value: errors24,
        tone: errors24 > 0 ? "danger" : "neutral",
        icon: AlertTriangle,
      },
      {
        label: t("stats.systemWarnings"),
        value: warnings24,
        tone: warnings24 > 0 ? "warning" : "muted",
        icon: FileText,
      },
    ];
  }, [system, t]);

  /* The support bundle is built server-side (POST /system/support-bundle
   * collects logs, config and the catalog into one archive), so it can take a
   * few seconds — the button says so rather than looking inert. */
  const [bundling, setBundling] = useState(false);

  const onDownloadSupportBundle = async () => {
    if (bundling) return;
    setBundling(true);
    try {
      const { blob, filename } = await getSupportBundle();
      downloadBlob(filename, blob);
      toast.success(t("toast.exportedSupportBundle"));
    } catch (err) {
      toast.error(t("toast.exportSupportBundleFailed"), {
        description: apiErrorMessage(err) ?? undefined,
      });
    } finally {
      setBundling(false);
    }
  };

  /* Say which of the three situations the reader is in, and never silently: a
   * log view that is quietly showing something other than the appliance's log
   * is the one thing that would make it untrustworthy. */
  const notice = live
    ? serverLog.isError
      ? t("system.serverLogUnavailable", {
          reason: apiErrorMessage(serverLog.error) ?? t("system.serverLogUnreachable"),
        })
      : serverLog.data && serverLog.data.entries.length === 0 && serverLog.data.files.length === 0
        ? t("system.serverLogMissing", { paths: serverLog.data.searched.join(", ") })
        : null
    : null;

  const systemView = (
    <>
      <KpiBand className="sm:grid-cols-2 xl:grid-cols-2">
        {stats.map((s) => (
          <KpiCard key={s.label} icon={s.icon} tone={s.tone} label={s.label} value={s.value} />
        ))}
      </KpiBand>

      {notice && (
        <p className="flex items-start gap-2 border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs leading-relaxed text-warning-text">
          <Cpu className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </p>
      )}

      <SystemLogTab entries={system} />
    </>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <div className="flex items-center gap-2">
            {live && tab === "system" && (
              <Button
                variant="outline"
                onClick={() => void serverLog.refetch()}
                disabled={serverLog.isFetching}
                aria-label={t("actions.refreshLog")}
              >
                <RotateCw className={serverLog.isFetching ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} />
                {t("common:actions.refresh")}
              </Button>
            )}
            {/* One action, named for what it does. It used to be an "Export"
                menu of two, whose second item wrote the system log — which the
                log view below already downloads, from its own button, with the
                filters the reader can see applied. A menu that exists to offer
                one thing plus a duplicate of a nearby button is a click in the
                way of the only thing anyone opens it for. */}
            {canBundle && (
              <Button
                variant="outline"
                onClick={() => void onDownloadSupportBundle()}
                disabled={bundling}
              >
                {bundling ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Package className="mr-1.5 h-4 w-4" />
                )}
                {bundling ? t("actions.bundling") : t("actions.downloadSupportBundle")}
              </Button>
            )}
          </div>
        }
      />

      {canSystemLog && canAudit ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="system">{t("tabs.system")}</TabsTrigger>
            <TabsTrigger value="audit">{t("tabs.audit")}</TabsTrigger>
          </TabsList>
          <TabsContent value="system" className="space-y-5">
            {systemView}
          </TabsContent>
          <TabsContent value="audit">
            <AuditLogTab />
          </TabsContent>
        </Tabs>
      ) : canSystemLog ? (
        systemView
      ) : (
        <AuditLogTab />
      )}
    </div>
  );
}
