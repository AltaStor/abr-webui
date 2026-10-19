// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, ShieldCheck, Timer } from "@/lib/icons";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { apiErrorMessage, extendSession } from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { useWorldStore } from "@/store/world";
import { SettingsSection } from "../SettingsSection";
import { TlsCertificateCard } from "./TlsCertificateCard";
import { KeyEscrowCard } from "./KeyEscrowCard";
import { useCan } from "@/store/permissions";

export function SecuritySection() {
  const canViewCertificate = useCan("tls.view");
  const canExport = useCan("system.export");
  return (
    <div className="space-y-4">
      <AccessPolicyCard />
      <SessionCard />
      {canViewCertificate && <TlsCertificateCard />}
      {canExport && <KeyEscrowCard />}
    </div>
  );
}

/* ------------------------------------------------------------------ session -- */

/** Mirrors the appliance's `web_session_ttl_min/max_seconds()` bounds — see
 *  `SecuritySettings.sessionDurationSec`. */
const SESSION_MIN_SECONDS = 300;
const SESSION_MAX_SECONDS = 7200;
const SESSION_STEP_SECONDS = 300;

function SessionCard() {
  const { t } = useTranslation("settings");
  const sessionDurationSec = useSettingsStore((s) => s.security.sessionDurationSec);
  const updateSecurity = useSettingsStore((s) => s.updateSecurity);
  const mode = useWorldStore((s) => s.mode);

  // Local drag state for live label feedback; committed (persisted + sent to
  // the appliance) only on release via onValueCommit, not on every tick.
  const [draft, setDraft] = useState(sessionDurationSec);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setDraft(sessionDurationSec);
  }, [sessionDurationSec]);

  const commit = async (value: number) => {
    setDraft(value);
    updateSecurity({ sessionDurationSec: value });
    if (mode !== "live") return;
    setApplying(true);
    try {
      await extendSession(value);
      toast.success(t("saved.title"), { description: t("security.session.savedDescription") });
    } catch (err) {
      toast.error(t("security.session.applyFailed.title"), {
        description: apiErrorMessage(err) ?? t("security.session.applyFailed.description"),
      });
    } finally {
      setApplying(false);
    }
  };

  const hours = Math.floor(draft / 3600);
  const minutes = Math.floor((draft % 3600) / 60);
  const durationLabel = [
    hours > 0 ? t("security.session.hours", { count: hours }) : null,
    minutes > 0 ? t("security.session.minutes", { count: minutes }) : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SettingsSection title={t("security.session.title")} description={t("security.session.description")} icon={Timer}>
      <div className="space-y-1.5 py-3.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="security-session-duration">{t("security.session.label")}</Label>
          <span className="nums text-xs font-medium text-foreground">{durationLabel}</span>
        </div>
        <Slider
          id="security-session-duration"
          value={[draft]}
          min={SESSION_MIN_SECONDS}
          max={SESSION_MAX_SECONDS}
          step={SESSION_STEP_SECONDS}
          onValueChange={([v]) => setDraft(v)}
          onValueCommit={([v]) => void commit(v)}
          disabled={applying}
          aria-label={t("security.session.label")}
        />
        <p className="text-xs text-muted-foreground">{t("security.session.hint")}</p>
      </div>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ access -- */

const MIN_PASSWORD_LENGTH = 8;

function AccessPolicyCard() {
  const { t } = useTranslation("settings");
  const mode = useWorldStore((s) => s.mode);
  const pending = useAuthStore((s) => s.pending);
  const error = useAuthStore((s) => s.error);
  const changePassword = useAuthStore((s) => s.changePassword);
  const clearError = useAuthStore((s) => s.clearError);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const currentError = touched && current === "" ? t("security.changePassword.currentRequired") : null;
  const nextError =
    touched && next.length < MIN_PASSWORD_LENGTH
      ? t("security.changePassword.tooShort", { count: MIN_PASSWORD_LENGTH })
      : null;
  const confirmError = touched && !nextError && confirm !== next ? t("security.changePassword.mismatch") : null;

  const onEdit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (error) clearError();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (current === "" || next.length < MIN_PASSWORD_LENGTH || confirm !== next) return;
    if (mode !== "live") {
      toast.info(t("toast.connectLive"));
      return;
    }
    const ok = await changePassword(current, next);
    if (ok) {
      toast.success(t("security.changePassword.success"));
      setCurrent("");
      setNext("");
      setConfirm("");
      setTouched(false);
    }
  };

  return (
    <SettingsSection
      title={t("security.access.title")}
      description={t("security.access.description")}
      icon={ShieldCheck}
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="max-w-sm space-y-4 py-3.5">
        {error && (
          <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{error}</span>
          </div>
        )}

        <PasswordField
          id="sec-pw-current"
          label={t("security.changePassword.currentLabel")}
          value={current}
          onChange={onEdit(setCurrent)}
          error={currentError}
          autoComplete="current-password"
        />
        <PasswordField
          id="sec-pw-new"
          label={t("security.changePassword.newLabel")}
          value={next}
          onChange={onEdit(setNext)}
          error={nextError}
          hint={t("security.changePassword.requirements", { count: MIN_PASSWORD_LENGTH })}
          autoComplete="new-password"
        />
        <PasswordField
          id="sec-pw-confirm"
          label={t("security.changePassword.confirmLabel")}
          value={confirm}
          onChange={onEdit(setConfirm)}
          error={confirmError}
          autoComplete="new-password"
        />

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending ? t("security.changePassword.submitting") : t("security.changePassword.submit")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
  autoComplete: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="h-9"
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
