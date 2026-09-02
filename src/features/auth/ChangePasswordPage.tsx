// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Forced password change — where a session with `mustChangePassword` lands
 * (currently: the bootstrap admin, whose password fails the security policy).
 * AppShell's auth gate redirects here instead of the Dashboard until the
 * change succeeds; every other authenticated route stays blocked meanwhile.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, LogOut } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth";
import { useWorldStore } from "@/store/world";
import { AuthLayout } from "./components/AuthLayout";

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const mode = useWorldStore((s) => s.mode);
  const status = useAuthStore((s) => s.status);
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);
  const pending = useAuthStore((s) => s.pending);
  const error = useAuthStore((s) => s.error);
  const changePassword = useAuthStore((s) => s.changePassword);
  const logout = useAuthStore((s) => s.logout);
  const clearError = useAuthStore((s) => s.clearError);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (mode !== "live" || status !== "signed-in") navigate("/login", { replace: true });
    else if (!mustChangePassword) navigate("/", { replace: true });
  }, [mode, status, mustChangePassword, navigate]);

  const currentError = touched && current === "" ? t("changePassword.currentRequired") : null;
  const nextError =
    touched && next.length < MIN_PASSWORD_LENGTH ? t("changePassword.tooShort", { count: MIN_PASSWORD_LENGTH }) : null;
  const confirmError = touched && !nextError && confirm !== next ? t("changePassword.mismatch") : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (current === "" || next.length < MIN_PASSWORD_LENGTH || confirm !== next) return;
    const ok = await changePassword(current, next);
    if (ok) {
      toast.success(t("changePassword.success"));
      navigate("/", { replace: true });
    }
  };

  const onSignOutInstead = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <AuthLayout title={t("changePassword.title")} subtitle={t("changePassword.subtitle")}>
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error && (
          <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="change-current">{t("changePassword.currentLabel")}</Label>
          <Input
            id="change-current"
            type="password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              if (error) clearError();
            }}
            autoComplete="current-password"
            autoFocus
            aria-invalid={currentError ? true : undefined}
            aria-describedby={currentError ? "change-current-error" : undefined}
          />
          {currentError && (
            <p id="change-current-error" className="text-xs text-danger-text">
              {currentError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="change-new">{t("changePassword.newLabel")}</Label>
          <Input
            id="change-new"
            type="password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              if (error) clearError();
            }}
            autoComplete="new-password"
            aria-invalid={nextError ? true : undefined}
            aria-describedby={nextError ? "change-new-error" : "change-new-hint"}
          />
          {nextError ? (
            <p id="change-new-error" className="text-xs text-danger-text">
              {nextError}
            </p>
          ) : (
            <p id="change-new-hint" className="text-xs text-muted-foreground">
              {t("changePassword.requirements", { count: MIN_PASSWORD_LENGTH })}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="change-confirm">{t("changePassword.confirmLabel")}</Label>
          <Input
            id="change-confirm"
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (error) clearError();
            }}
            autoComplete="new-password"
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? "change-confirm-error" : undefined}
          />
          {confirmError && (
            <p id="change-confirm-error" className="text-xs text-danger-text">
              {confirmError}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? t("changePassword.submitting") : t("changePassword.submit")}
        </Button>

        <button
          type="button"
          onClick={() => void onSignOutInstead()}
          className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("changePassword.signOut")}
        </button>
      </form>
    </AuthLayout>
  );
}
