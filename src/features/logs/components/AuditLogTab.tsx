// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The appliance's audit log (GET /audit): one record per command run from any
 * interface — this console, the CLI, automation or the API — and per user or
 * role change, with the role the user held at the time and whether it was
 * allowed, denied or failed. Credentials are masked by the appliance before a
 * record is written, so what is shown here is all there is.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RotateCw, Search } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatInt } from "@/lib/format";
import { qk } from "@/lib/query";
import { apiErrorMessage, listAuditRecords, type AuditRecord, type AuditResult } from "@/services/api.http";
import { ROLE_NAMES } from "@/store/permissions";
import { useWorldStore } from "@/store/world";

const PAGE_SIZE = 100;
/** The product areas a function ID starts with, for the area filter. */
const AREAS = [
  "auth",
  "user",
  "role",
  "audit",
  "job",
  "session",
  "backup",
  "restore",
  "repository",
  "inventory",
  "system",
  "tls",
  "dashboard",
] as const;
const RESULT_VARIANT: Record<AuditResult, "success" | "danger" | "warning"> = {
  allowed: "success",
  denied: "danger",
  failed: "warning",
};

function targetText(record: AuditRecord): string {
  const target = record.target;
  if (!target) return "";
  return `${target.type}: ${target.name ?? target.id ?? ""}`;
}

export function AuditLogTab() {
  const { t } = useTranslation("logs");
  const live = useWorldStore((s) => s.mode) === "live";
  const [result, setResult] = useState<AuditResult | "all">("all");
  const [area, setArea] = useState<string>("all");
  const [userDraft, setUserDraft] = useState("");
  const [user, setUser] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      result: result === "all" ? undefined : result,
      function: area === "all" ? undefined : `${area}.`,
      user: user || undefined,
    }),
    [offset, result, area, user],
  );
  const audit = useQuery({
    queryKey: qk.audit(query),
    queryFn: () => listAuditRecords(query),
    placeholderData: keepPreviousData,
    enabled: live,
  });

  const total = audit.data?.total ?? 0;
  const items = audit.data?.items ?? [];
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + items.length;

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setOffset(0);
    setter(value);
  };

  if (!live) {
    return (
      <p className="border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        {t("audit.demo")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            resetPage(setUser)(userDraft.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={userDraft}
            onChange={(e) => setUserDraft(e.target.value)}
            onBlur={() => userDraft.trim() !== user && resetPage(setUser)(userDraft.trim())}
            placeholder={t("audit.userPlaceholder")}
            className="pl-9"
            aria-label={t("audit.userLabel")}
          />
        </form>
        <Select value={area} onValueChange={resetPage(setArea)}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t("audit.areaLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("audit.allAreas")}</SelectItem>
            {AREAS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={resetPage((v: string) => setResult(v as AuditResult | "all"))}>
          <SelectTrigger className="w-full sm:w-40" aria-label={t("audit.resultLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("audit.allResults")}</SelectItem>
            {(["allowed", "denied", "failed"] as const).map((r) => (
              <SelectItem key={r} value={r}>
                {t(`audit.result.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => void audit.refetch()}
          disabled={audit.isFetching}
          aria-label={t("audit.refresh")}
        >
          <RotateCw className={audit.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {audit.isError ? (
        <p className="flex items-start gap-2 border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs text-warning-text">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {apiErrorMessage(audit.error) ?? t("audit.loadFailed")}
        </p>
      ) : audit.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("audit.loading")}
        </p>
      ) : items.length === 0 ? (
        <p className="border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {t("audit.empty")}
        </p>
      ) : (
        <div className="border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("audit.column.time")}</TableHead>
                <TableHead>{t("audit.column.user")}</TableHead>
                <TableHead>{t("audit.column.function")}</TableHead>
                <TableHead>{t("audit.column.target")}</TableHead>
                <TableHead>{t("audit.column.result")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("audit.column.session")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("audit.column.via")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((record) => (
                <TableRow key={record.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs" title={record.timestamp}>
                    {formatDateTime(record.timestamp)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{record.user}</div>
                    <div className="text-xs text-muted-foreground">
                      {record.role ? (ROLE_NAMES[record.role] ?? record.role) : "—"}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{record.functionId}</TableCell>
                  <TableCell className="max-w-[16rem] truncate text-xs" title={targetText(record)}>
                    {targetText(record)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={RESULT_VARIANT[record.result]}>{t(`audit.result.${record.result}`)}</Badge>
                    {record.error && (
                      <div className="mt-1 max-w-[18rem] text-xs text-muted-foreground" title={record.error.message}>
                        {record.error.message}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell" title={record.sessionId ?? undefined}>
                    {record.sessionId ? record.sessionId.slice(0, 8) : ""}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {t(`audit.interface.${record.interface}`, { defaultValue: record.interface })}
                    {record.command && <div className="font-mono">abr {record.command}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {t("audit.range", { from: formatInt(from), to: formatInt(to), total: formatInt(total) })}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || audit.isFetching}
            aria-label={t("audit.newer")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={to >= total || audit.isFetching}
            aria-label={t("audit.older")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("audit.note")}</p>
    </div>
  );
}
