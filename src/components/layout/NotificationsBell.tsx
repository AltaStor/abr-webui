// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertOctagon, AlertTriangle, Bell, CheckCircle2, Info, ShieldAlert } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/EmptyState";
import { useWorldStore } from "@/store/world";
import type { Alert, AlertSeverity } from "@/types";

const SEV: Record<AlertSeverity, { icon: typeof Info; cls: string }> = {
  critical: { icon: AlertOctagon, cls: "text-danger" },
  warning: { icon: AlertTriangle, cls: "text-warning" },
  success: { icon: CheckCircle2, cls: "text-success" },
  info: { icon: Info, cls: "text-info" },
};

export function NotificationsBell() {
  const navigate = useNavigate();
  const { t } = useTranslation("layout");
  const alerts = useWorldStore((s) => s.alerts);
  const threats = useWorldStore((s) => s.threats);
  const markAllAlertsRead = useWorldStore((s) => s.markAllAlertsRead);
  const markAlertRead = useWorldStore((s) => s.markAlertRead);

  const unread = alerts.filter((a) => !a.read).length;
  const activeThreats = threats.filter((t) => t.status === "active" || t.status === "investigating").length;

  const onClick = (a: Alert) => {
    markAlertRead(a.id);
    if (a.entityType === "job" && a.entityId) navigate(`/jobs/${a.entityId}`);
    else if (a.category === "threat") navigate("/");
    else if (a.entityType === "repository") navigate("/repositories");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? t("notifications.ariaUnread", { count: unread }) : t("notifications.aria")}>
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center bg-danger px-1 text-[10px] font-semibold text-danger-foreground nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t("notifications.title")}</span>
            {activeThreats > 0 && (
              <span className="inline-flex items-center gap-1 bg-danger-subtle px-1.5 py-0.5 text-[11px] font-medium text-danger">
                <ShieldAlert className="h-3 w-3" />
                {t("notifications.threats", { count: activeThreats })}
              </span>
            )}
          </div>
          {unread > 0 && (
            <button onClick={markAllAlertsRead} className="text-xs font-medium text-primary hover:underline">
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {alerts.length === 0 ? (
            <EmptyState icon={Bell} title={t("notifications.allCaughtUp")} compact />
          ) : (
            alerts.map((a) => {
              const S = SEV[a.severity];
              const Icon = S.icon;
              // The appliance's problem-areas feed carries no separate headline:
              // `listAlerts` synthesises the title by truncating the message at
              // 64 characters, so title and message are the same sentence — the
              // first copy cut mid-word. Where the message already opens with
              // the title, render the message once instead of twice.
              const heading = a.title.trim();
              const body = a.message.trim();
              const duplicated = heading !== "" && body.startsWith(heading);
              return (
                <button
                  key={a.id}
                  onClick={() => onClick(a)}
                  className={cn(
                    "flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/40",
                    !a.read && "bg-primary/[0.04]",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", S.cls)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className={cn("text-sm font-medium", duplicated ? "line-clamp-3" : "truncate")}>
                        {duplicated ? body : heading}
                      </p>
                      {!a.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </div>
                    {!duplicated && body !== "" && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{body}</p>
                    )}
                    <p className="nums mt-1 text-[11px] text-muted-foreground">
                      {formatRelative(a.createdAt)} · {formatDateTime(a.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
