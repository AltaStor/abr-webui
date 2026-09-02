// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
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
      toast.success(`${replica.replicaName} is now serving`, {
        description: unplanned
          ? `Unplanned failover complete — the replica is powered on on ${replica.targetEnvironmentName}.`
          : `Planned failover complete — a final sync ran and the replica is live on ${replica.targetEnvironmentName}.`,
      });
      onOpenChange(false);
    } catch {
      toast.error("Failover didn't complete", {
        description:
          "The replica was not brought online. Check the target host connection and try again.",
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
              "mb-1 flex h-10 w-10 items-center justify-center rounded-lg",
              unplanned ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning-text",
            )}
          >
            <Power className="h-5 w-5" />
          </div>
          <DialogTitle>Fail over to {replica.replicaName}?</DialogTitle>
          <DialogDescription>
            The replica powers on and starts serving on{" "}
            <span className="font-medium text-foreground">{replica.targetEnvironmentName}</span>
            {replica.targetHostName ? ` · ${replica.targetHostName}` : ""}. The source{" "}
            <span className="font-medium text-foreground">{replica.sourceVmName}</span> is taken
            out of rotation until you fail back.
          </DialogDescription>
        </DialogHeader>

        {/* Planned vs unplanned — segmented choice */}
        <div className="space-y-1.5">
          <Label id="failover-kind-label">How are you failing over?</Label>
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
              title="Planned"
              description="Graceful. Run a final sync so nothing is lost, then cut over."
            />
            <KindCard
              active={kind === "unplanned"}
              onClick={() => setKind("unplanned")}
              icon={Zap}
              tone="unplanned"
              title="Unplanned"
              description="Disaster. The source is gone — boot the replica from a recovery point now."
            />
          </div>
        </div>

        {/* Recovery point */}
        <div className="space-y-1.5">
          <Label htmlFor="failover-point">Recovery point</Label>
          {points.length === 0 ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              No recovery points available yet — this replica has nothing to boot from.
            </div>
          ) : (
            <Select value={pointId} onValueChange={setPointId}>
              <SelectTrigger id="failover-point">
                <SelectValue placeholder="Choose a recovery point…" />
              </SelectTrigger>
              <SelectContent>
                {points.map((p, i) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatDateTime(p.createdAt)} · {p.type === "full" ? "Full" : "Incremental"}
                    {i === 0 ? " · latest" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            {unplanned
              ? "Pick the last point you trust — anything written to the source after this is not on the replica."
              : "A final sync runs first, so the latest point captures the source right up to cutover."}
          </p>
        </div>

        {/* Consequence banner — amber for planned, red for unplanned */}
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
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
              <>
                <span className="font-medium text-foreground">No final sync.</span> Writes made to{" "}
                {replica.sourceVmName} after the chosen point are lost. Use this only when the
                source is unreachable.
              </>
            ) : (
              <>
                AltaStor runs one last incremental sync, powers the source down, then brings the
                replica up on {targetPlatform}. Failback later returns control to the source.
              </>
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={unplanned ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={submitting || !pointId}
          >
            {unplanned ? <Zap className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {submitting
              ? "Failing over…"
              : unplanned
                ? "Fail over now"
                : "Fail over gracefully"}
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
        "group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all",
        active
          ? danger
            ? "border-danger/50 bg-danger/[0.06] shadow-sm"
            : "border-primary/50 bg-primary/[0.06] shadow-sm"
          : "border-border/70 bg-card hover:border-border hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
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
