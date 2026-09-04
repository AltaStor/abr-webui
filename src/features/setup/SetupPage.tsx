// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * First-boot Initial Configuration wizard — the web counterpart of the
 * appliance's ESXi-DCUI-style console. Full-screen and dark, no AppShell
 * chrome: an unconfigured appliance has no world worth showing, so AppShell
 * redirects here (live mode) until a manifest is applied. Left rail = steps;
 * the card walks Welcome → Appliance → Storage → Repository → Hypervisors →
 * Review → Apply, then hands the session back with a full reload.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowRight } from "@/lib/icons";
import {
  getProvisioning,
  getProvisionPlan,
  getSystemInfo,
  listStorageDisks,
  type ApplianceInfo,
  type ManifestArraySpec,
  type PhysicalDisk,
  type ProvisioningStatus,
} from "@/services/api.http";
import { markSetupSkipped } from "./skip";
import {
  STEPS,
  buildManifest,
  defaultForm,
  stepIndex,
  stepValid,
  type SetupForm,
  type StepKey,
} from "./types";
import { ApplianceStep } from "./components/ApplianceStep";
import { ApplyStep } from "./components/ApplyStep";
import { HypervisorsStep } from "./components/HypervisorsStep";
import { RepositoryStep } from "./components/RepositoryStep";
import { ReviewStep } from "./components/ReviewStep";
import { StepRail } from "./components/StepRail";
import { StorageStep } from "./components/StorageStep";
import { WelcomeStep } from "./components/WelcomeStep";

export default function SetupPage() {
  const { t } = useTranslation("setup");
  const navigate = useNavigate();

  /* The wizard is always dark — brand moment, and consistent with the DCUI.
   * Applied on <html> so portal-rendered popovers (Select) match too. */
  useEffect(() => {
    const root = document.documentElement;
    const wasLight = root.classList.contains("light");
    const prevScheme = root.style.colorScheme;
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.colorScheme = "dark";
    return () => {
      if (wasLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      }
      root.style.colorScheme = prevScheme;
    };
  }, []);

  /* ------------------------------ wizard state ----------------------------- */
  const [step, setStep] = useState<StepKey>("welcome");
  const [furthest, setFurthest] = useState(0);
  const [form, setForm] = useState<SetupForm>(defaultForm);
  const patch = useCallback(
    (p: Partial<SetupForm>) => setForm((f) => ({ ...f, ...p })),
    [],
  );

  /* ----------------------------- appliance facts ---------------------------- */
  const [info, setInfo] = useState<ApplianceInfo | null>(null);
  const [provisioning, setProvisioning] = useState<ProvisioningStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSystemInfo()
      .then((v) => {
        if (cancelled) return;
        setInfo(v);
        // Default the hostname from the box itself — unless the user typed one.
        setForm((f) => (f.hostname ? f : { ...f, hostname: v.hostname }));
      })
      .catch(() => {
        /* facts stay as skeletons — the wizard still walks */
      });
    getProvisioning()
      .then((v) => {
        if (!cancelled) setProvisioning(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------- real disks + auto layout ----------------------- */
  const [disks, setDisks] = useState<PhysicalDisk[] | null>(null);
  const [plan, setPlan] = useState<ManifestArraySpec[] | null>(null);
  const [planNotes, setPlanNotes] = useState<string[] | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const loadStorage = useCallback(() => {
    setStorageLoading(true);
    setStorageError(null);
    Promise.all([listStorageDisks(), getProvisionPlan()])
      .then(([d, p]) => {
        setDisks(d);
        setPlan(p.layout);
        setPlanNotes(p.notes ?? null);
      })
      .catch(() => setStorageError(t("errors.disksUnreadable")))
      .finally(() => setStorageLoading(false));
  }, [t]);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  /* ------------------------------- navigation ------------------------------- */
  const idx = stepIndex(step);
  const canContinue =
    step === "storage" ? plan !== null && plan.length > 0 : stepValid(step, form);

  const goTo = useCallback((key: StepKey) => {
    setStep(key);
    window.scrollTo({ top: 0 });
  }, []);

  const goNext = () => {
    if (!canContinue || idx >= STEPS.length - 1) return;
    // Leaving review = applying: re-check every form step in case the user
    // jumped around the rail and invalidated something behind them.
    if (step === "review") {
      const stale = (["appliance", "repository", "hypervisors"] as const).find(
        (k) => !stepValid(k, form),
      );
      if (stale) {
        goTo(stale);
        return;
      }
    }
    setFurthest((m) => Math.max(m, idx + 1));
    goTo(STEPS[idx + 1].key);
  };

  const goBack = () => {
    if (idx > 0) goTo(STEPS[idx - 1].key);
  };

  const skip = () => {
    markSetupSkipped();
    navigate("/");
  };

  const manifest = useMemo(() => buildManifest(form), [form]);

  return (
    <div className="dark relative min-h-screen bg-background text-foreground">
      {/* Brand hairline + a quiet ice glow and basalt lattice — the only decoration. */}
      <div className="h-px bg-primary" />
      <div
        aria-hidden
        className="basalt-lattice pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{t("header.initialConfiguration")}</span>
          {info && (
            <span className="border border-border bg-card/60 px-2 py-0.5 font-mono text-[11px]">
              {info.hostname}
            </span>
          )}
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <StepRail current={step} furthest={furthest} locked={step === "apply"} onSelect={goTo} />

          <Card className="min-w-0">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="p-5 sm:p-6"
            >
              {step === "welcome" && <WelcomeStep info={info} provisioning={provisioning} />}
              {step === "appliance" && <ApplianceStep form={form} info={info} onChange={patch} />}
              {step === "storage" && (
                <StorageStep
                  disks={disks}
                  plan={plan}
                  notes={planNotes}
                  loading={storageLoading}
                  error={storageError}
                  onRetry={loadStorage}
                />
              )}
              {step === "repository" && <RepositoryStep form={form} onChange={patch} />}
              {step === "hypervisors" && (
                <HypervisorsStep
                  rows={form.hypervisors}
                  onChange={(rows) => patch({ hypervisors: rows })}
                />
              )}
              {step === "review" && (
                <ReviewStep form={form} plan={plan} info={info} onEdit={goTo} />
              )}
              {step === "apply" && (
                <ApplyStep manifest={manifest} onBackToReview={() => goTo("review")} />
              )}
            </motion.div>

            {step !== "apply" && (
              <div className="flex items-center justify-between gap-3 border-t border-border p-5">
                {step === "welcome" ? (
                  <button
                    type="button"
                    onClick={skip}
                    className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    {t("nav.skip")}
                  </button>
                ) : (
                  <Button variant="ghost" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4" />
                    {t("common:actions.back")}
                  </Button>
                )}
                <Button
                  onClick={goNext}
                  disabled={!canContinue}
                  size={step === "welcome" ? "lg" : "default"}
                >
                  {step === "welcome"
                    ? t("nav.begin")
                    : step === "review"
                      ? t("nav.applyConfiguration")
                      : t("nav.continue")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
