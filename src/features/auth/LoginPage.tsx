// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Console sign-in — the front door of the AltaStor Web UI. Live mode only:
 * AppShell's auth gate is what actually sends people here, and this page
 * bounces itself straight back to the Dashboard if the demo simulation is
 * active (nothing to authenticate against) or a session already exists.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2, Lock } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/auth";
import { INTRO_FLAG } from "@/components/brand/IntroOverlay";
import { useSettingsStore } from "@/store/settings";
import { useWorldStore } from "@/store/world";
import { AuthFailureNotice, AuthLayout } from "./components/AuthLayout";
import { DEMO_PASSWORD } from "@/mock/auth";
import { authFailureKey, classifyLoginError } from "./authFailure";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const location = useLocation();
  // Wherever AppShell's auth gate sent the visitor here from (see
  // AppShell.tsx) — where both "already signed in" and "turned out to be the
  // demo simulation" bounce back to, instead of always landing on "/".
  const from = (location.state as { from?: string } | null)?.from;
  const mode = useWorldStore((s) => s.mode);
  const status = useAuthStore((s) => s.status);
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword);
  const pending = useAuthStore((s) => s.pending);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const clearError = useAuthStore((s) => s.clearError);

  // Session length lives in Settings → Security now, not on the login form —
  // this reads whatever the operator (or its shipped 1-hour default) last set.
  const sessionDurationSec = useSettingsStore((s) => s.security.sessionDurationSec);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);

  // The demo simulation has no backend to authenticate against — never trap
  // it behind a login screen it can't satisfy.
  useEffect(() => {
    /* `?demo-login` holds this form on screen in the demo world. It began as
     * scaffolding for reviewing the sign-in UI without a live appliance, but
     * Topbar's sign-out now depends on it: the auth gate is live-only, so
     * without the flag a demo sign-out bounces straight back to the dashboard
     * and reads as a no-op. Read per-navigation, not once at module load, or a
     * client-side transition carrying the flag never sees it. Without the flag
     * the normal bounce still runs, so a plain demo boot lands on the dashboard
     * as before. */
    const previewInDemo = new URLSearchParams(location.search).has("demo-login");
    if (mode !== "live" && !previewInDemo) navigate(from ?? "/", { replace: true });
  }, [mode, navigate, from, location.search]);

  // Already signed in (e.g. a restored session, or a direct hit on /login) —
  // don't show the form at all.
  useEffect(() => {
    if (status === "signed-in") navigate(mustChangePassword ? "/change-password" : (from ?? "/"), { replace: true });
  }, [status, mustChangePassword, navigate, from]);

  /* The store hands back one English string. Turn it into copy this console
   * owns and this operator's language carries, keeping the appliance's own
   * sentence as supporting detail rather than as the headline. */
  const failure = classifyLoginError(error);

  const nameError = touched && name.trim() === "" ? t("login.usernameRequired") : null;
  const passwordError = touched && password === "" ? t("login.passwordRequired") : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === "" || password === "") return;
    const ok = await login(name, password, sessionDurationSec);
    // Arm the sign-in intro. Only this form writes the flag, so a restored
    // session or a plain reload never replays it; the shell consumes it on mount.
    if (ok) {
      try {
        sessionStorage.setItem(INTRO_FLAG, "1");
      } catch {
        /* storage may be unavailable; the intro is a flourish, not a step */
      }
    }
  };

  return (
    <AuthLayout title={t("login.title")} subtitle={t("login.subtitle")}>
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {/* The demo simulation answers this form itself and accepts any
            username, so the one thing a visitor cannot guess is the password.
            Never rendered against a live appliance. */}
        {mode !== "live" && (
          <p className="border border-border bg-muted/25 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Demo environment — any username works (e.g.{" "}
            <span className="font-mono">henry.morgan@altastor.com</span>) with the password{" "}
            <span className="font-mono">{DEMO_PASSWORD}</span>.
          </p>
        )}

        {failure && (
          <AuthFailureNotice
            title={t(authFailureKey("login", failure.failure, "title"))}
            body={t(authFailureKey("login", failure.failure, "desc"))}
            detail={failure.detail}
          />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="login-name">{t("login.usernameLabel")}</Label>
          <Input
            id="login-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) clearError();
            }}
            placeholder={t("login.usernamePlaceholder")}
            autoComplete="username"
            autoFocus
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "login-name-error" : undefined}
          />
          {nameError && (
            <p id="login-name-error" className="text-xs text-danger-text">
              {nameError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-password">{t("login.passwordLabel")}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
              placeholder={t("login.passwordPlaceholder")}
              autoComplete="current-password"
              className="pl-9 pr-9"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? "login-password-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordError && (
            <p id="login-password-error" className="text-xs text-danger-text">
              {passwordError}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
