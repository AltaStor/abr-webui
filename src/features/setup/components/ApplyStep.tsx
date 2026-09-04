// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogViewer } from "@/components/LogViewer";
import { ProgressBar } from "@/components/ProgressBar";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Loader2,
  XCircle,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  ApiError,
  applyProvisioning,
  getProvisioning,
  type ApplianceManifest,
  type ProvisioningStage,
  type ProvisioningStatus,
} from "@/services/api.http";
import i18n from "@/i18n";
import { StepHeader } from "./StepHeader";

interface ApplyStepProps {
  manifest: ApplianceManifest;
  onBackToReview: () => void;
}

type Phase = "starting" | "applying" | "done" | "error";

/** `label` is a getter so it resolves through i18next at access time. */
const APPLY_STAGES: Array<{ key: ProvisioningStage; label: string }> = [
  { key: "network", get label() { return i18n.t("setup:apply.stages.network"); } },
  { key: "storage-layout", get label() { return i18n.t("setup:apply.stages.storage-layout"); } },
  { key: "pool", get label() { return i18n.t("setup:apply.stages.pool"); } },
  { key: "repository", get label() { return i18n.t("setup:apply.stages.repository"); } },
  { key: "hypervisors", get label() { return i18n.t("setup:apply.stages.hypervisors"); } },
  { key: "policies", get label() { return i18n.t("setup:apply.stages.policies"); } },
  { key: "complete", get label() { return i18n.t("setup:apply.stages.complete"); } },
];

function isFinished(s: ProvisioningStatus): boolean {
  return s.finishedAt !== null || s.completedStages.includes("complete");
}

function applyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: unknown } | null;
    if (body && typeof body.error === "string") return body.error;
    return i18n.t("setup:apply.errorRejected", { status: err.status });
  }
  return i18n.t("setup:apply.errorUnreachable");
}

function StageChecklist({
  status,
  phase,
}: {
  status: ProvisioningStatus | null;
  phase: Phase;
}) {
  const completed = new Set(status?.completedStages ?? []);
  const current = status?.stage;
  return (
    <ol className="space-y-1" aria-label={i18n.t("setup:apply.stagesAria")}>
      {APPLY_STAGES.map((s) => {
        const done = completed.has(s.key);
        const isCurrent = !done && current === s.key;
        return (
          <li
            key={s.key}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 text-sm",
              isCurrent && "bg-muted/40",
            )}
          >
            {done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : isCurrent && phase === "error" ? (
              <XCircle className="h-4 w-4 shrink-0 text-danger" />
            ) : isCurrent ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
            ) : (
              <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground/40" />
            )}
            <span
              className={cn(
                done
                  ? "text-foreground/80"
                  : isCurrent
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Applies the manifest and watches it land. If a run is already in flight
 * (page reload mid-provision) it skips the POST and just watches; error log
 * lines from THIS run — anything past the pre-apply baseline — raise the
 * banner and re-enable Apply via "Try again".
 */
export function ApplyStep({ manifest, onBackToReview }: ApplyStepProps) {
  const { t } = useTranslation("setup");
  const [phase, setPhase] = useState<Phase>("starting");
  const [status, setStatus] = useState<ProvisioningStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Log-line ids that predate our apply — old errors must not trip the banner. */
  const baselineRef = useRef<Set<string>>(new Set());

  /* Kick off: POST when the appliance is unconfigured, otherwise watch the run in flight. */
  useEffect(() => {
    let cancelled = false;
    setPhase("starting");
    setErrorMsg(null);
    void (async () => {
      try {
        const before = await getProvisioning();
        if (cancelled) return;
        setStatus(before);
        if (isFinished(before)) {
          setPhase("done");
          return;
        }
        if (before.stage === "unconfigured") {
          baselineRef.current = new Set(before.log.map((l) => l.id));
          await applyProvisioning(manifest);
          if (cancelled) return;
        }
        setPhase("applying");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(applyErrorMessage(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, manifest]);

  /* Poll every second while applying. */
  useEffect(() => {
    if (phase !== "applying") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getProvisioning();
        if (cancelled) return;
        setStatus(s);
        const errLine = [...s.log]
          .reverse()
          .find((l) => l.level === "error" && !baselineRef.current.has(l.id));
        if (errLine) {
          setErrorMsg(errLine.message);
          setPhase("error");
          return;
        }
        if (isFinished(s)) setPhase("done");
      } catch {
        /* transient miss — keep polling */
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase]);

  if (phase === "done") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center bg-success-subtle text-success">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{t("apply.ready")}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {t("apply.doneBody", {
                hostname: manifest.hostname,
                state: t("apply.repoCreated"),
              })}
            </p>
          </div>
          {/* Full reload on purpose: the world re-hydrates fresh from the configured appliance. */}
          <Button size="lg" onClick={() => window.location.assign("/")}>
            {t("apply.enterConsole")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {status && status.log.length > 0 && <LogViewer lines={status.log} height={180} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StepHeader title={t("apply.title")} description={t("apply.description")} />

      {phase === "error" && errorMsg && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-danger/30 bg-danger-subtle px-4 py-3">
          <span className="flex min-w-0 items-center gap-2 text-sm text-danger-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{errorMsg}</span>
          </span>
          <span className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={onBackToReview}>
              {t("apply.backToReview")}
            </Button>
            <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>
              {t("apply.tryAgain")}
            </Button>
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <StageChecklist status={status} phase={phase} />
        <div className="min-w-0 space-y-3">
          <ProgressBar
            value={status?.progress ?? 0}
            active={phase === "applying"}
            label={t("apply.progress")}
          />
          <LogViewer lines={status?.log ?? []} height={260} live={phase === "applying"} />
        </div>
      </div>
    </div>
  );
}
