// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill, StatusDot } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { HeaderHint } from "@/components/ui/tooltip";
import { History } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDuration, formatStorage } from "@/lib/format";
import { SESSION_META } from "@/lib/status";
import type { Session, VmRunResult } from "@/types";
import i18n from "@/i18n";

/**
 * Per-object run result → tone + the word we show for it.
 *
 * The status values are the appliance's wire format and stay untouched; the
 * Result column used to print them verbatim ("succeeded", "warning") behind a
 * `capitalize`, which is the backend's vocabulary in every language. `label`
 * is a getter so it resolves through i18next at access time — the same shape
 * as SESSION_META and as ActiveRunPanel's map, which this deliberately mirrors
 * so the two per-object views can't drift apart.
 */
const VM_RESULT_META: Record<VmRunResult["status"], { tone: string; label: string }> = {
  success: { tone: "success", get label() { return i18n.t("jobs:vmStatus.done"); } },
  warning: { tone: "warning", get label() { return i18n.t("jobs:vmStatus.warning"); } },
  failed: { tone: "danger", get label() { return i18n.t("jobs:vmStatus.failed"); } },
  running: { tone: "info", get label() { return i18n.t("jobs:vmStatus.running"); } },
  pending: { tone: "muted", get label() { return i18n.t("jobs:vmStatus.queued"); } },
};

/** Newest-first session list with expandable per-VM breakdown rows. */
export function RunHistoryTable({ sessions }: { sessions: Session[] }) {
  const { t } = useTranslation("jobs");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={History}
          title={t("history.emptyTitle")}
          description={t("history.emptyDescription")}
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-8 py-2.5 pl-4" />
              <th className="py-2.5 pr-3 font-medium">{t("history.status")}</th>
              <th className="py-2.5 pr-3 font-medium">{t("history.started")}</th>
              <th className="py-2.5 pr-3 font-medium">
                <HeaderHint label={t("history.typeHint")}>{t("history.type")}</HeaderHint>
              </th>
              <th className="hidden py-2.5 pr-3 font-medium md:table-cell">{t("history.duration")}</th>
              <th className="hidden py-2.5 pr-3 font-medium sm:table-cell">
                <HeaderHint label={t("history.processedHint")}>{t("history.processed")}</HeaderHint>
              </th>
              <th className="hidden py-2.5 pr-3 font-medium lg:table-cell">
                <HeaderHint label={t("history.transferredHint")}>{t("history.transferred")}</HeaderHint>
              </th>
              <th className="py-2.5 pr-4 text-right font-medium">
                <HeaderHint label={t("history.objectsHint")}>{t("history.objects")}</HeaderHint>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const isOpen = expanded === s.id;
              return (
                <Fragment key={s.id}>
                  <tr
                    className={cn(
                      "cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40",
                      isOpen && "bg-muted/30",
                    )}
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded(isOpen ? null : s.id);
                      }
                    }}
                    aria-expanded={isOpen}
                  >
                    <td className="py-2.5 pl-4">
                      <ChevronDown
                        className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusPill meta={SESSION_META[s.status]} size="sm" />
                    </td>
                    <td className="nums py-2.5 pr-3 text-muted-foreground">{formatDateTime(s.startedAt)}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={s.backupType === "full" ? "info" : "outline"}>
                        {s.backupType === "full" ? t("runType.full") : t("runType.incremental")}
                      </Badge>
                    </td>
                    <td className="nums hidden py-2.5 pr-3 text-muted-foreground md:table-cell">
                      {s.status === "running" ? "—" : formatDuration(s.durationSec)}
                    </td>
                    <td className="nums hidden py-2.5 pr-3 text-muted-foreground sm:table-cell">{formatStorage(s.processedGB)}</td>
                    <td className="nums hidden py-2.5 pr-3 text-muted-foreground lg:table-cell">{formatStorage(s.transferredGB)}</td>
                    <td className="nums py-2.5 pr-4 text-right">{s.vmCount}</td>
                  </tr>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden bg-muted/20"
                          >
                            <div className="px-4 py-3">
                              {s.message && (
                                <p className="mb-2 text-xs text-muted-foreground">{s.message}</p>
                              )}
                              <div className="overflow-hidden border border-border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border/50 text-left text-[11px] text-muted-foreground">
                                      <th className="py-1.5 pl-3 font-medium">{t("objects.virtualMachine")}</th>
                                      <th className="py-1.5 pr-3 font-medium">{t("history.result")}</th>
                                      <th className="hidden py-1.5 pr-3 font-medium sm:table-cell">
                                        <HeaderHint label={t("history.processedHint")}>{t("history.processed")}</HeaderHint>
                                      </th>
                                      <th className="hidden py-1.5 pr-3 font-medium sm:table-cell">
                                        <HeaderHint label={t("history.transferredHint")}>{t("history.transferred")}</HeaderHint>
                                      </th>
                                      <th className="py-1.5 pr-3 text-right font-medium">{t("history.duration")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.vmResults.map((r) => (
                                      <tr key={r.vmId} className="border-b border-border/40 last:border-0">
                                        <td className="py-1.5 pl-3">
                                          <span className="flex items-center gap-2">
                                            <StatusDot tone={VM_RESULT_META[r.status].tone} />
                                            <span className="truncate" title={r.vmName}>{r.vmName}</span>
                                          </span>
                                        </td>
                                        <td className="py-1.5 pr-3 text-muted-foreground">
                                          {r.message ?? VM_RESULT_META[r.status].label}
                                        </td>
                                        <td className="nums hidden py-1.5 pr-3 text-muted-foreground sm:table-cell">
                                          {formatStorage(r.processedGB)}
                                        </td>
                                        <td className="nums hidden py-1.5 pr-3 text-muted-foreground sm:table-cell">
                                          {formatStorage(r.transferredGB)}
                                        </td>
                                        <td className="nums py-1.5 pr-3 text-right text-muted-foreground">
                                          {formatDuration(r.durationSec)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
