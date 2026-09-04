// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Power,
  ShieldCheck,
  Zap,
} from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { PLATFORM_META } from "@/lib/platform";
import { useWorldStore } from "@/store/world";
import type { Replica } from "@/types";

interface FailoverDialogProps {
  replica: Replica | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FailoverKind = "planned" | "unplanned";

/**
 * Deliberate confirmation for failing a replica over. The operator chooses
 * PLANNED (graceful — take a final sync, then power the replica on) vs.
 * UNPLANNED (the source is gone — power on from the last good point now), and
 * picks the recovery point to boot from. Unplanned failover is styled as the
 * high-stakes disaster path.
 */
export function FailoverDialog({ replica, open, onOpenChange }: FailoverDialogProps) {
  const { t } = useTranslation("replication");
  const failoverReplica = useWorldStore((s) => s.failoverReplica);
  const [kind, setKind] = useState<FailoverKind>("planned");
  const [pointId, setPointId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Newest recovery point first; default to the latest.
  const points = useMemo(() => {
    if (!replica) return [];
    return [...replica.points].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [replica]);

  // Reset the form each time the dialog opens for a replica.
  useEffect(() => {
    if (!open) return;
    setKind("planned");
    setSubmitting(false);
    setPointId(points[0]?.id ?? "");
  }, [open, points]);

  if (!replica) return null;

  const unplanned = kind === "unplanned";
  const targetPlatform = PLATFORM_META[replica.targetPlatform].short;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await failoverReplica(replica.id, {
        planned: kind === "planned",
        pointId: pointId || undefined,
      });
      toast.success(t("failover.toast.title", { name: replica.replicaName }), {
        description: unplanned
          ? t("failover.toast.unplanned", { env: replica.targetEnvironmentName })
          : t("failover.toast.planned", { env: replica.targetEnvironmentName }),
      });
      onOpenChange(false);
    } catch {
      toast.error(t("failover.toast.errorTitle"), {
        description: t("failover.toast.errorBody"),
      });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div
            className={cn(
              "mb-1 flex h-10 w-10 items-center justify-center",
              unplanned ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning-text",
            )}
          >
            <Power className="h-5 w-5" />
          </div>
          <DialogTitle>{t("failover.title", { name: replica.replicaName })}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="failover.description"
              ns="replication"
              values={{
                env: replica.targetEnvironmentName,
                hostSuffix: replica.targetHostName ? ` · ${replica.targetHostName}` : "",
                source: replica.sourceVmName,
              }}
              components={{
                1: <span className="font-medium text-foreground" />,
                3: <span className="font-medium text-foreground" />,
              }}
            />
          </DialogDescription>
        </DialogHeader>

        {/* Planned vs unplanned — segmented choice */}
        <div className="space-y-1.5">
          <Label id="failover-kind-label">{t("failover.kindLabel")}</Label>
          <div
            role="group"
            aria-labelledby="failover-kind-label"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <KindCard
              active={kind === "planned"}
              onClick={() => setKind("planned")}
              icon={ShieldCheck}
              tone="planned"
              title={t("failover.planned.title")}
              description={t("failover.planned.description")}
            />
            <KindCard
              active={kind === "unplanned"}
              onClick={() => setKind("unplanned")}
              icon={Zap}
              tone="unplanned"
              title={t("failover.unplanned.title")}
              description={t("failover.unplanned.description")}
            />
          </div>
        </div>

        {/* Recovery point */}
        <div className="space-y-1.5">
          <Label htmlFor="failover-point">{t("failover.recoveryPoint")}</Label>
          {points.length === 0 ? (
            <div className="border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("failover.noPoints")}
            </div>
          ) : (
            <Select value={pointId} onValueChange={setPointId}>
              <SelectTrigger id="failover-point">
                <SelectValue placeholder={t("failover.choosePoint")} />
              </SelectTrigger>
              <SelectContent>
                {points.map((p, i) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatDateTime(p.createdAt)} ·{" "}
                    {p.type === "full" ? t("failover.pointType.full") : t("failover.pointType.incremental")}
                    {i === 0 ? ` · ${t("failover.latest")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            {unplanned ? t("failover.hint.unplanned") : t("failover.hint.planned")}
          </p>
        </div>

        {/* Consequence banner — amber for planned, red for unplanned */}
        <div
          className={cn(
            "flex items-start gap-2.5 border px-3 py-2.5",
            unplanned
              ? "border-danger/25 bg-danger/[0.05]"
              : "border-warning/25 bg-warning/[0.05]",
          )}
        >
          <AlertTriangle
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              unplanned ? "text-danger" : "text-warning-text",
            )}
          />
          <p className="text-xs text-muted-foreground">
            {unplanned ? (
              <Trans
                i18nKey="failover.banner.unplanned"
                ns="replication"
                values={{ source: replica.sourceVmName }}
                components={{ 1: <span className="font-medium text-foreground" /> }}
              />
            ) : (
              t("failover.banner.planned", { platform: targetPlatform })
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant={unplanned ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={submitting || !pointId}
          >
            {unplanned ? <Zap className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {submitting
              ? t("failover.pending")
              : unplanned
                ? t("failover.confirmUnplanned")
                : t("failover.confirmPlanned")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KindCard({
  active,
  onClick,
  icon: Icon,
  tone,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ShieldCheck;
  tone: "planned" | "unplanned";
  title: string;
  description: string;
}) {
  const danger = tone === "unplanned";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group relative flex flex-col gap-1.5 border p-3 text-left transition-colors duration-250",
        active
          ? danger
            ? "border-danger/50 bg-danger/[0.06]"
            : "border-primary/50 bg-primary/[0.06]"
          : "border-border bg-card hover:border-border hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center transition-colors",
          active
            ? danger
              ? "bg-danger text-danger-foreground"
              : "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {title}
        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
      {active && (
        <span
          className={cn(
            "absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center",
            danger ? "bg-danger text-danger-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
