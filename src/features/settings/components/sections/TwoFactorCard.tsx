// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Two-factor sign-in for the signed-in user's own account, as a switch.
 *
 * Switching it on asks for the password, shows the QR code the appliance made
 * for this account, and turns it on only after a code from the authenticator
 * app proves the app holds the secret. The recovery codes that come back are
 * shown once: the appliance keeps only their digests, so they stay on screen
 * until the user says they saved them.
 *
 * While it is on, setting it up again (a new phone), making new recovery codes
 * and switching it off each take the password and a code or a recovery code: a
 * session alone is not enough, or a stolen one could change the second factor
 * it was stolen past. Setting up again leaves the current secret working until
 * the new one is confirmed, so a QR code scanned wrong locks nobody out. The
 * secret is shown only in those two setup flows. An Administrator resets it for
 * a user who lost their phone in Settings -> Users.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Download, Loader2, Smartphone } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { downloadText } from "@/lib/download";
import { qk } from "@/lib/query";
import {
  apiErrorMessage,
  disableTotp,
  enableTotp,
  regenerateRecoveryCodes,
  secondFactorOf,
  startTotpSetup,
  whoami,
  type TotpSetup,
} from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { useWorldStore } from "@/store/world";
import { Field } from "../FormField";
import { SettingRow } from "../SettingRow";
import { SettingDivider, SettingsSection } from "../SettingsSection";

const RECOVERY_CODES_FILE = "altastor-recovery-codes.txt";

/** What a user with two-factor sign-in on can do, each after confirming it's them. */
type Action = "reenroll" | "regenerate" | "disable";

type View =
  | { kind: "status" }
  /** The switch went on: the password, before the QR code. */
  | { kind: "turnOn" }
  | { kind: "authorize"; action: Action }
  | { kind: "scan"; setup: TotpSetup; reenroll: boolean }
  | { kind: "codes"; codes: string[] };

export function TwoFactorCard() {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode) === "live";
  const me = useQuery({ queryKey: qk.whoami, queryFn: whoami, enabled: live });
  const [view, setView] = useState<View>({ kind: "status" });
  const enabled = me.data?.user.totpEnabled ?? false;
  const toStatus = () => setView({ kind: "status" });

  // While a step asks for more, the switch shows where it is being taken, and
  // flipping it back cancels that step. Setting up again and new recovery
  // codes finish or cancel on their own first.
  const turningOn = view.kind === "turnOn" || (view.kind === "scan" && !view.reenroll);
  const turningOff = view.kind === "authorize" && view.action === "disable";
  const switchOn = turningOn ? true : turningOff ? false : enabled;
  const onSwitch = (on: boolean) => {
    if (view.kind !== "status") toStatus();
    else setView(on ? { kind: "turnOn" } : { kind: "authorize", action: "disable" });
  };

  return (
    <SettingsSection
      title={t("security.twoFactor.title")}
      description={t("security.twoFactor.description")}
      icon={Smartphone}
    >
      {!live ? (
        <p className="py-3.5 text-sm text-muted-foreground">{t("toast.connectLive")}</p>
      ) : me.isLoading ? (
        <p className="flex items-center gap-2 py-3.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("security.twoFactor.loading")}
        </p>
      ) : !me.data ? (
        <FailureNotice message={apiErrorMessage(me.error) ?? t("security.twoFactor.loadFailed")} />
      ) : (
        <>
          <SettingRow
            label={t("security.twoFactor.switch")}
            description={
              enabled
                ? t("security.twoFactor.statusOn", { count: me.data.recoveryCodesLeft ?? 0 })
                : t("security.twoFactor.offHint")
            }
            htmlFor="totp-switch"
          >
            <div className="flex justify-start sm:justify-end">
              <Switch
                id="totp-switch"
                data-testid="totp-switch"
                checked={switchOn}
                onCheckedChange={onSwitch}
                disabled={view.kind !== "status" && !turningOn && !turningOff}
                aria-label={t("security.twoFactor.switch")}
              />
            </div>
          </SettingRow>
          {view.kind === "status" && !enabled ? null : <SettingDivider />}
          {view.kind === "codes" ? (
            <RecoveryCodes codes={view.codes} onDone={toStatus} />
          ) : view.kind === "scan" ? (
            <ScanStep
              setup={view.setup}
              reenroll={view.reenroll}
              onCancel={toStatus}
              onEnabled={(codes) => setView({ kind: "codes", codes })}
            />
          ) : view.kind === "authorize" ? (
            <AuthorizeForm
              action={view.action}
              onCancel={toStatus}
              onSetup={(setup) => setView({ kind: "scan", setup, reenroll: true })}
              onCodes={(codes) => setView({ kind: "codes", codes })}
              onDisabled={toStatus}
            />
          ) : view.kind === "turnOn" ? (
            <TurnOnForm
              onCancel={toStatus}
              onStarted={(setup) => setView({ kind: "scan", setup, reenroll: false })}
            />
          ) : enabled ? (
            <EnabledActions onAction={(action) => setView({ kind: "authorize", action })} />
          ) : null}
        </>
      )}
    </SettingsSection>
  );
}

function FailureNotice({ message }: { message: string }) {
  return (
    <div className="my-3.5 flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

/** What the appliance now reports for this user reaches every view of them. */
function useRefreshAccount() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.whoami });
    void queryClient.invalidateQueries({ queryKey: qk.users });
  };
}

function TurnOnForm({ onCancel, onStarted }: { onCancel: () => void; onStarted: (setup: TotpSetup) => void }) {
  const { t } = useTranslation("settings");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const start = useMutation({ mutationFn: (pw: string) => startTotpSetup(pw), onSuccess: onStarted });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password !== "") start.mutate(password);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4 py-3.5" data-testid="totp-turn-on">
      <p className="text-xs text-muted-foreground">{t("security.twoFactor.turnOnHint")}</p>
      {start.isError && (
        <FailureNotice message={apiErrorMessage(start.error) ?? t("security.twoFactor.startFailed")} />
      )}
      <Field
        id="totp-password"
        label={t("security.twoFactor.passwordLabel")}
        error={touched && password === "" ? t("security.twoFactor.passwordRequired") : null}
      >
        <PasswordInput
          id="totp-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          className="h-9"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={start.isPending}>
          {t("security.twoFactor.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={start.isPending}>
          {start.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {start.isPending ? t("security.twoFactor.starting") : t("security.twoFactor.start")}
        </Button>
      </div>
    </form>
  );
}

/** What else there is to do while it is on; the switch turns it off. */
function EnabledActions({ onAction }: { onAction: (action: Exclude<Action, "disable">) => void }) {
  const { t } = useTranslation("settings");
  return (
    <div className="flex flex-wrap gap-2 py-3.5">
      <Button type="button" variant="outline" size="sm" onClick={() => onAction("reenroll")}>
        {t("security.twoFactor.reenroll")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => onAction("regenerate")}>
        {t("security.twoFactor.regenerate")}
      </Button>
    </div>
  );
}

const ACTION_TEXT: Record<Action, { title: string; hint: string; submit: string }> = {
  reenroll: { title: "reenroll", hint: "reenrollHint", submit: "continue" },
  regenerate: { title: "regenerate", hint: "regenerateHint", submit: "regenerate" },
  disable: { title: "disable", hint: "disableHint", submit: "disable" },
};

/** The password and a second factor, before an action on two-factor sign-in itself. */
function AuthorizeForm({
  action,
  onCancel,
  onSetup,
  onCodes,
  onDisabled,
}: {
  action: Action;
  onCancel: () => void;
  onSetup: (setup: TotpSetup) => void;
  onCodes: (codes: string[]) => void;
  onDisabled: () => void;
}) {
  const { t } = useTranslation("settings");
  const adoptUser = useAuthStore((s) => s.adoptUser);
  const refreshAccount = useRefreshAccount();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);
  const text = ACTION_TEXT[action];

  const run = useMutation({
    mutationFn: async () => {
      const secondFactor = secondFactorOf(code);
      if (action === "reenroll") onSetup(await startTotpSetup(password, secondFactor));
      else if (action === "regenerate") {
        const codes = await regenerateRecoveryCodes(password, secondFactor);
        refreshAccount();
        toast.success(t("security.twoFactor.regenerated"));
        onCodes(codes);
      } else {
        adoptUser(await disableTotp(password, secondFactor));
        refreshAccount();
        toast.success(t("security.twoFactor.disabled"));
        onDisabled();
      }
    },
    // A code that was tried is used up or wrong either way.
    onError: () => setCode(""),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password !== "" && code.trim() !== "") run.mutate();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4 py-3.5" data-testid={`totp-${action}`}>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t(`security.twoFactor.${text.title}`)}</p>
        <p className="text-xs text-muted-foreground">{t(`security.twoFactor.${text.hint}`)}</p>
        <p className="text-xs text-muted-foreground">{t("security.twoFactor.authorizeHint")}</p>
      </div>
      {run.isError && <FailureNotice message={apiErrorMessage(run.error) ?? t("security.twoFactor.actionFailed")} />}
      <Field
        id="totp-auth-password"
        label={t("security.twoFactor.passwordLabel")}
        error={touched && password === "" ? t("security.twoFactor.passwordRequired") : null}
      >
        <PasswordInput
          id="totp-auth-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          className="h-9"
        />
      </Field>
      <Field
        id="totp-auth-code"
        label={t("security.twoFactor.authorizeCodeLabel")}
        error={touched && code.trim() === "" ? t("security.twoFactor.authorizeCodeRequired") : null}
      >
        <Input
          id="totp-auth-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          spellCheck={false}
          className="nums tracking-wider"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={run.isPending}>
          {t("security.twoFactor.cancel")}
        </Button>
        <Button
          type="submit"
          variant={action === "disable" ? "destructive" : "default"}
          size="sm"
          disabled={run.isPending}
        >
          {run.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {run.isPending ? t("security.twoFactor.checking") : t(`security.twoFactor.${text.submit}`)}
        </Button>
      </div>
    </form>
  );
}

function ScanStep({
  setup,
  reenroll,
  onCancel,
  onEnabled,
}: {
  setup: TotpSetup;
  reenroll: boolean;
  onCancel: () => void;
  onEnabled: (recoveryCodes: string[]) => void;
}) {
  const { t } = useTranslation("settings");
  const adoptUser = useAuthStore((s) => s.adoptUser);
  const refreshAccount = useRefreshAccount();
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);

  const enable = useMutation({
    mutationFn: enableTotp,
    onSuccess: ({ user, recoveryCodes }) => {
      adoptUser(user);
      refreshAccount();
      toast.success(t(reenroll ? "security.twoFactor.reenrolled" : "security.twoFactor.enabled"));
      onEnabled(recoveryCodes);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (code.trim() !== "") enable.mutate(code.replace(/\s/g, ""));
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm space-y-4 py-3.5">
      {enable.isError && (
        <FailureNotice message={apiErrorMessage(enable.error) ?? t("security.twoFactor.enableFailed")} />
      )}
      <div className="space-y-2">
        <p className="text-sm">{t(reenroll ? "security.twoFactor.rescanHint" : "security.twoFactor.scanHint")}</p>
        <img src={setup.qrCode} alt={t("security.twoFactor.qrAlt")} className="h-48 w-48 bg-white" />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t("security.twoFactor.keyLabel")}</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 select-all break-all font-mono text-xs" data-testid="totp-secret">
            {setup.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
          <CopyButton
            text={setup.secret}
            label={t("security.twoFactor.copyKey")}
            copied={t("security.twoFactor.keyCopied")}
          />
        </div>
      </div>
      <Field
        id="totp-code"
        label={t("security.twoFactor.codeLabel")}
        error={touched && code.trim() === "" ? t("security.twoFactor.codeRequired") : null}
      >
        <Input
          id="totp-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="nums tracking-wider"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={enable.isPending}>
          {t("security.twoFactor.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={enable.isPending}>
          {enable.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {enable.isPending
            ? t("security.twoFactor.enabling")
            : t(reenroll ? "security.twoFactor.confirmNew" : "security.twoFactor.enable")}
        </Button>
      </div>
    </form>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation("settings");
  return (
    <div className="max-w-sm space-y-4 py-3.5" data-testid="recovery-codes">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("security.twoFactor.recoveryTitle")}</p>
        <div className="flex items-start gap-2 border border-warning/30 bg-warning/[0.06] px-3 py-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs text-warning-text">{t("security.twoFactor.recoveryWarning")}</p>
        </div>
      </div>
      <ul className="grid select-all gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <CopyButton
          text={codes.join("\n")}
          label={t("security.twoFactor.copyCodes")}
          copied={t("security.twoFactor.codesCopied")}
          showLabel
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadText(RECOVERY_CODES_FILE, `${codes.join("\n")}\n`)}
        >
          <Download className="h-3.5 w-3.5" />
          {t("security.twoFactor.downloadCodes")}
        </Button>
        <Button type="button" size="sm" onClick={onDone}>
          {t("security.twoFactor.recoveryDone")}
        </Button>
      </div>
    </div>
  );
}

function CopyButton({
  text,
  label,
  copied,
  showLabel = false,
}: {
  text: string;
  label: string;
  copied: string;
  showLabel?: boolean;
}) {
  const { t } = useTranslation("settings");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copied);
    } catch {
      toast.error(t("toast.copyFailed"));
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "sm" : "icon-sm"}
      aria-label={label}
      title={label}
      onClick={() => void copy()}
    >
      <Copy className="h-3.5 w-3.5" />
      {showLabel && label}
    </Button>
  );
}
