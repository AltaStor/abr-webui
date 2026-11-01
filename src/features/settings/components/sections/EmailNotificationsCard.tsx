// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Loader2, Mail, XCircle } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { DateTime } from "@/components/DateTime";
import { qk } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  apiErrorCode,
  apiErrorFields,
  apiErrorMessage,
  apiErrorStage,
  getEmailNotifications,
  testEmailNotifications,
  updateEmailNotifications,
  type EmailNotificationState,
  type OAuthProvider,
  type SmtpSecurity,
} from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import { SettingsSection } from "../SettingsSection";
import { Field } from "../FormField";
import { ChipList, Segmented } from "../controls";
import { ADDRESS, DEFAULT_PORTS, draftOf, patchOf, problemsOf, type Draft, type Secret } from "./emailForm";
import { EventSwitches, HistoryList } from "./notificationParts";

/**
 * Settings → Notifications → E-mail: the SMTP server, how the appliance signs
 * in to it, sender and recipients, the events that send e-mail, a test e-mail
 * and the latest deliveries. Everything here is the appliance's own setting
 * (GET/PUT /notifications/email), the same one `abr notification` changes.
 *
 * The form holds a draft; Save sends it whole and the appliance refuses all of
 * it when anything is wrong, naming every field. The same checks run here
 * first, so the common mistakes show before a round trip. Secrets never come
 * back from the appliance: a stored one shows as "stored", a field left empty
 * keeps it, and Remove clears it.
 */

/** The test e-mail's outcome, or why it did not go. */
type TestOutcome =
  | { ok: true; recipients: string[]; refused: string[]; durationMs: number }
  | { ok: false; code: string; stage: string | null; message: string };

const FAILURE_CODES = new Set([
  "smtp_connection_failed",
  "smtp_tls_failed",
  "smtp_auth_failed",
  "oauth_token_failed",
  "smtp_sender_refused",
  "smtp_recipients_refused",
  "smtp_error",
]);

export function EmailNotificationsCard() {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode === "live" && s.ready);
  const canEdit = useCan("notification.edit");
  const canTest = useCan("notification.test");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.emailNotifications, queryFn: getEmailNotifications, enabled: live });
  const state = query.data;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState("");
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);

  // Seed the draft from the first answer, and again after each save.
  useEffect(() => {
    if (state && draft === null) setDraft(draftOf(state));
  }, [state, draft]);

  const pristine = useMemo(() => (state ? JSON.stringify(draftOf(state)) : ""), [state]);
  const dirty = draft !== null && JSON.stringify(draft) !== pristine;

  const save = useMutation({
    mutationFn: (d: Draft) => updateEmailNotifications(patchOf(d)),
    onSuccess: (next) => {
      queryClient.setQueryData(qk.emailNotifications, next);
      setDraft(draftOf(next));
      setShowErrors(false);
      setServerErrors({});
      toast.success(t("saved.title"), { description: t("email.saved") });
    },
    onError: (err) => {
      setServerErrors(apiErrorFields(err) ?? {});
      setShowErrors(true);
      toast.error(t("email.saveFailed"), { description: apiErrorMessage(err) ?? undefined });
    },
  });

  const test = useMutation({
    mutationFn: (d: Draft) =>
      testEmailNotifications(
        patchOf(d),
        testTo
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    onMutate: () => setOutcome(null),
    onSuccess: (result) => {
      setOutcome({ ok: true, ...result });
      void queryClient.invalidateQueries({ queryKey: qk.emailNotifications });
    },
    onError: (err) => {
      const fields = apiErrorFields(err);
      if (fields) {
        setServerErrors(fields);
        setShowErrors(true);
      }
      setOutcome({
        ok: false,
        code: apiErrorCode(err) ?? "unknown",
        stage: apiErrorStage(err),
        message: apiErrorMessage(err) ?? t("email.test.unreachable"),
      });
      void queryClient.invalidateQueries({ queryKey: qk.emailNotifications });
    },
  });

  if (!live) {
    return (
      <SettingsSection title={t("email.title")} description={t("email.description")} icon={Mail}>
        <p className="py-4 text-sm text-muted-foreground">{t("email.liveOnly")}</p>
      </SettingsSection>
    );
  }
  if (query.isError) {
    return (
      <SettingsSection title={t("email.title")} description={t("email.description")} icon={Mail}>
        <div className="flex items-center gap-2 py-4 text-sm text-danger-text" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {apiErrorMessage(query.error) ?? t("email.loadFailed")}
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void query.refetch()}>
            {t("common:actions.retry")}
          </Button>
        </div>
      </SettingsSection>
    );
  }
  if (!state || !draft) {
    return (
      <SettingsSection title={t("email.title")} description={t("email.description")} icon={Mail}>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("email.loading")}
        </div>
      </SettingsSection>
    );
  }

  const clientErrors = problemsOf(draft, state, draft.enabled, t);
  const errors = showErrors ? { ...serverErrors, ...clientErrors } : {};
  const err = (key: string) => errors[key] ?? null;
  const readOnly = !canEdit;
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    // An edit retires the appliance's last verdict; the checks here still run.
    setServerErrors((s) => (Object.keys(s).length ? {} : s));
  };
  const setSecurity = (security: SmtpSecurity) =>
    update({
      security,
      // Follow the conventional port while the operator kept the previous one.
      port: draft.port === String(DEFAULT_PORTS[draft.security]) ? String(DEFAULT_PORTS[security]) : draft.port,
    });
  const setProvider = (provider: OAuthProvider) =>
    update({ provider, grant: provider === "google" ? "refresh_token" : draft.grant });

  const onSave = () => {
    setShowErrors(true);
    if (Object.keys(clientErrors).length) return;
    save.mutate(draft);
  };
  const onTest = () => {
    const complete = problemsOf(draft, state, true, t);
    const badTo = testTo.split(/[,;\s]+/).filter((s) => s && !ADDRESS.test(s));
    if (badTo.length) complete.test_to = t("email.error.recipients", { list: badTo.join(", ") });
    // A test may go to other addresses than the configured recipients.
    if (testTo.trim() && complete.recipients === t("email.error.recipientsRequired")) delete complete.recipients;
    if (Object.keys(complete).length) {
      setServerErrors(complete);
      setShowErrors(true);
      setOutcome(null);
      return;
    }
    test.mutate(draft);
  };

  const oauth = state.smtp.oauth2;
  const endpoint =
    draft.provider === "microsoft"
      ? `https://login.microsoftonline.com/${draft.tenantId.trim() || "organizations"}/oauth2/v2.0/token`
      : draft.provider === "google"
        ? "https://oauth2.googleapis.com/token"
        : draft.tokenUrl.trim();
  const defaultScope =
    draft.provider === "microsoft"
      ? draft.grant === "client_credentials"
        ? "https://outlook.office365.com/.default"
        : "https://outlook.office365.com/SMTP.Send offline_access"
      : draft.provider === "google"
        ? "https://mail.google.com/"
        : "";

  return (
    <SettingsSection
      title={t("email.title")}
      description={t("email.description")}
      icon={Mail}
      headerAside={
        <label className="flex items-center gap-2 text-sm font-medium">
          <Badge variant={state.enabled ? "success" : "outline"}>{state.enabled ? t("email.on") : t("email.off")}</Badge>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
            disabled={readOnly}
            aria-label={t("email.enable")}
            data-testid="email-enabled"
          />
        </label>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {canTest && (
            <>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder={t("email.test.toPlaceholder")}
                aria-label={t("email.test.to")}
                className="h-9 w-full sm:mr-auto sm:w-64"
              />
              <Button variant="outline" size="sm" onClick={onTest} disabled={test.isPending} data-testid="email-test">
                {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                {test.isPending ? t("email.test.sending") : t("email.test.send")}
              </Button>
            </>
          )}
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={!dirty || save.isPending}
                onClick={() => {
                  setDraft(draftOf(state));
                  setShowErrors(false);
                  setServerErrors({});
                }}
              >
                {t("common:actions.discard")}
              </Button>
              <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending} data-testid="email-save">
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("controls.saveChanges")}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6 py-4">
        {showErrors && Object.keys(errors).length > 0 && (
          <div role="alert" className="flex items-start gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("email.error.summary", { count: Object.keys(errors).length })}</span>
          </div>
        )}
        {errors.test_to && <p className="text-xs text-danger-text">{errors.test_to}</p>}

        {outcome && <TestOutcomePanel outcome={outcome} />}

        {/* ---------------------------------------------------------- server */}
        <fieldset className="space-y-3" disabled={readOnly}>
          <legend className="label-overline mb-2">{t("email.server.title")}</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field id="smtp-host" label={t("email.server.host")} error={err("smtp.host")}>
              <Input
                id="smtp-host"
                value={draft.host}
                onChange={(e) => update({ host: e.target.value })}
                placeholder="smtp.example.com"
                aria-invalid={!!err("smtp.host")}
              />
            </Field>
            <Field id="smtp-port" label={t("email.server.port")} error={err("smtp.port")}>
              <Input
                id="smtp-port"
                inputMode="numeric"
                value={draft.port}
                onChange={(e) => update({ port: e.target.value })}
                aria-invalid={!!err("smtp.port")}
              />
            </Field>
          </div>
          <Field id="smtp-security" label={t("email.server.security")} hint={t(`email.server.securityHint.${draft.security}`)}>
            <Segmented
              aria-label={t("email.server.security")}
              value={draft.security}
              onChange={setSecurity}
              disabled={readOnly}
              options={[
                { value: "starttls", label: "STARTTLS" },
                { value: "ssl", label: "SSL/TLS" },
                { value: "none", label: t("email.server.noEncryption") },
              ]}
            />
          </Field>
          {draft.security !== "none" && (
            <label className="flex items-start justify-between gap-3">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t("email.server.verifyTls")}</span>
                <span className={cn("block text-xs", draft.verifyTls ? "text-muted-foreground" : "text-warning-text")}>
                  {draft.verifyTls ? t("email.server.verifyTlsOn") : t("email.server.verifyTlsOff")}
                </span>
              </span>
              <Switch checked={draft.verifyTls} onCheckedChange={(verifyTls) => update({ verifyTls })} disabled={readOnly} aria-label={t("email.server.verifyTls")} />
            </label>
          )}
          <Field id="smtp-timeout" label={t("email.server.timeout")} error={err("smtp.timeout_seconds")} hint={t("email.server.timeoutHint")}>
            <Input
              id="smtp-timeout"
              inputMode="numeric"
              className="w-28"
              value={draft.timeout}
              onChange={(e) => update({ timeout: e.target.value })}
              aria-invalid={!!err("smtp.timeout_seconds")}
            />
          </Field>
        </fieldset>

        {/* ------------------------------------------------------------ auth */}
        <fieldset className="space-y-3" disabled={readOnly}>
          <legend className="label-overline mb-2">{t("email.auth.title")}</legend>
          <Segmented
            aria-label={t("email.auth.title")}
            value={draft.auth}
            onChange={(auth) => update({ auth })}
            disabled={readOnly}
            options={[
              { value: "password", label: t("email.auth.password") },
              { value: "oauth2", label: t("email.auth.oauth2") },
              { value: "none", label: t("email.auth.none") },
            ]}
          />
          {draft.auth === "none" && <p className="text-xs text-muted-foreground">{t("email.auth.noneHint")}</p>}
          {draft.auth !== "none" && draft.security === "none" && (
            <p className="flex items-start gap-1.5 text-xs text-warning-text">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              {t("email.auth.unencryptedWarning")}
            </p>
          )}

          {draft.auth === "password" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="smtp-username" label={t("email.auth.username")} error={err("smtp.username")}>
                <Input
                  id="smtp-username"
                  autoComplete="off"
                  value={draft.username}
                  onChange={(e) => update({ username: e.target.value })}
                  aria-invalid={!!err("smtp.username")}
                />
              </Field>
              <SecretField
                id="smtp-password"
                label={t("email.auth.passwordLabel")}
                stored={state.smtp.passwordSet}
                value={draft.password}
                onChange={(password) => update({ password })}
                error={err("smtp.password")}
                readOnly={readOnly}
              />
            </div>
          )}

          {draft.auth === "oauth2" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="oauth-provider" label={t("email.oauth.provider")}>
                  <Select value={draft.provider} onValueChange={(v) => setProvider(v as OAuthProvider)} disabled={readOnly}>
                    <SelectTrigger id="oauth-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="microsoft">{t("email.oauth.providers.microsoft")}</SelectItem>
                      <SelectItem value="google">{t("email.oauth.providers.google")}</SelectItem>
                      <SelectItem value="custom">{t("email.oauth.providers.custom")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="oauth-grant" label={t("email.oauth.grant")} error={err("smtp.oauth2.grant")} hint={t(`email.oauth.grantHint.${draft.grant}`)}>
                  <Segmented
                    aria-label={t("email.oauth.grant")}
                    value={draft.grant}
                    onChange={(grant) => update({ grant })}
                    disabled={readOnly || draft.provider === "google"}
                    size="sm"
                    options={[
                      { value: "client_credentials", label: t("email.oauth.clientCredentials") },
                      { value: "refresh_token", label: t("email.oauth.refreshToken") },
                    ]}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="oauth-mailbox" label={t("email.oauth.mailbox")} error={err("smtp.username")} hint={t("email.oauth.mailboxHint")}>
                  <Input
                    id="oauth-mailbox"
                    autoComplete="off"
                    value={draft.username}
                    onChange={(e) => update({ username: e.target.value })}
                    placeholder="backup@example.com"
                    aria-invalid={!!err("smtp.username")}
                  />
                </Field>
                {draft.provider === "microsoft" && (
                  <Field id="oauth-tenant" label={t("email.oauth.tenant")} error={err("smtp.oauth2.tenant_id")}>
                    <Input
                      id="oauth-tenant"
                      value={draft.tenantId}
                      onChange={(e) => update({ tenantId: e.target.value })}
                      placeholder="contoso.onmicrosoft.com"
                      aria-invalid={!!err("smtp.oauth2.tenant_id")}
                    />
                  </Field>
                )}
                {draft.provider === "custom" && (
                  <Field id="oauth-token-url" label={t("email.oauth.tokenUrl")} error={err("smtp.oauth2.token_url")}>
                    <Input
                      id="oauth-token-url"
                      value={draft.tokenUrl}
                      onChange={(e) => update({ tokenUrl: e.target.value })}
                      placeholder="https://idp.example.com/oauth2/token"
                      aria-invalid={!!err("smtp.oauth2.token_url")}
                    />
                  </Field>
                )}
                <Field id="oauth-client-id" label={t("email.oauth.clientId")} error={err("smtp.oauth2.client_id")}>
                  <Input
                    id="oauth-client-id"
                    autoComplete="off"
                    value={draft.clientId}
                    onChange={(e) => update({ clientId: e.target.value })}
                    aria-invalid={!!err("smtp.oauth2.client_id")}
                  />
                </Field>
                <SecretField
                  id="oauth-client-secret"
                  label={t("email.oauth.clientSecret")}
                  stored={oauth.clientSecretSet}
                  value={draft.clientSecret}
                  onChange={(clientSecret) => update({ clientSecret })}
                  error={err("smtp.oauth2.client_secret")}
                  readOnly={readOnly}
                  optional={draft.grant === "refresh_token"}
                />
                {draft.grant === "refresh_token" && (
                  <SecretField
                    id="oauth-refresh-token"
                    label={t("email.oauth.refreshTokenLabel")}
                    stored={oauth.refreshTokenSet}
                    value={draft.refreshToken}
                    onChange={(refreshToken) => update({ refreshToken })}
                    error={err("smtp.oauth2.refresh_token")}
                    readOnly={readOnly}
                    hint={t("email.oauth.refreshTokenHint")}
                  />
                )}
                <Field id="oauth-scope" label={t("email.oauth.scope")} hint={t("email.oauth.scopeHint")}>
                  <Input
                    id="oauth-scope"
                    value={draft.scope}
                    onChange={(e) => update({ scope: e.target.value })}
                    placeholder={defaultScope}
                  />
                </Field>
              </div>
              {endpoint && (
                <p className="break-all text-xs text-muted-foreground">
                  {t("email.oauth.endpoint")} <span className="font-mono">{endpoint}</span>
                </p>
              )}
            </div>
          )}
        </fieldset>

        {/* ---------------------------------------------- sender, recipients */}
        <fieldset className="space-y-3" disabled={readOnly}>
          <legend className="label-overline mb-2">{t("email.addresses.title")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="sender-address" label={t("email.addresses.sender")} error={err("sender.address")}>
              <Input
                id="sender-address"
                type="email"
                value={draft.senderAddress}
                onChange={(e) => update({ senderAddress: e.target.value })}
                placeholder="backup@example.com"
                aria-invalid={!!err("sender.address")}
              />
            </Field>
            <Field id="sender-name" label={t("email.addresses.senderName")}>
              <Input id="sender-name" value={draft.senderName} onChange={(e) => update({ senderName: e.target.value })} />
            </Field>
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("email.addresses.recipients")}</span>
            {readOnly ? (
              <p className="text-sm">{draft.recipients.join(", ") || "—"}</p>
            ) : (
              <ChipList
                values={draft.recipients}
                onChange={(recipients) => update({ recipients })}
                placeholder="ops@example.com"
                ariaLabel={t("email.addresses.addRecipient")}
                validate={(v) => ADDRESS.test(v)}
              />
            )}
            {err("recipients") ? (
              <p className="text-xs text-danger-text">{err("recipients")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("email.addresses.recipientsHint")}</p>
            )}
          </div>
        </fieldset>

        {/* ---------------------------------------------------------- events */}
        <fieldset className="space-y-2" disabled={readOnly}>
          <legend className="label-overline mb-2">{t("email.events.title")}</legend>
          <p className="text-xs text-muted-foreground">{t("email.events.hint")}</p>
          <EventSwitches
            events={state.events}
            selected={draft.events}
            onChange={(events) => update({ events })}
            readOnly={readOnly}
            extra={(id) =>
              id === "repository.low_space" && (
                <div className="mt-2 flex items-center gap-2">
                  <label htmlFor="space-threshold" className="text-xs text-muted-foreground">
                    {t("email.events.threshold")}
                  </label>
                  <Input
                    id="space-threshold"
                    inputMode="numeric"
                    className="h-8 w-20"
                    value={draft.threshold}
                    onChange={(e) => update({ threshold: e.target.value })}
                    aria-invalid={!!err("repository_space_threshold_percent")}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  {err("repository_space_threshold_percent") && (
                    <span className="text-xs text-danger-text">{err("repository_space_threshold_percent")}</span>
                  )}
                </div>
              )
            }
          />
        </fieldset>

        <DeliveryHistory state={state} />

        {state.updatedAt && (
          <p className="text-xs text-muted-foreground">
            {t("email.lastChanged", { user: state.updatedBy ?? "—" })} <DateTime value={state.updatedAt} />
          </p>
        )}
      </div>
    </SettingsSection>
  );
}

/** A write-only secret: "stored" while the appliance holds one and nothing new
 *  was typed; Remove clears it on Save. */
function SecretField({
  id,
  label,
  stored,
  value,
  onChange,
  error,
  readOnly,
  hint,
  optional,
}: {
  id: string;
  label: string;
  stored: boolean;
  value: Secret;
  onChange: (value: Secret) => void;
  error: string | null;
  readOnly: boolean;
  hint?: string;
  optional?: boolean;
}) {
  const { t } = useTranslation("settings");
  const cleared = value === "" && stored;
  const status = cleared ? t("email.secret.willClear") : stored && value === undefined ? t("email.secret.stored") : hint;
  return (
    <Field id={id} label={optional ? t("email.secret.optional", { label }) : label} error={error} hint={status}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <PasswordInput
            id={id}
            autoComplete="new-password"
            value={value ?? ""}
            placeholder={stored ? t("email.secret.keepPlaceholder") : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
            aria-invalid={!!error}
            disabled={readOnly}
          />
        </div>
        {stored && !readOnly && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(cleared ? undefined : "")}>
            {cleared ? t("email.secret.keep") : t("email.secret.remove")}
          </Button>
        )}
      </div>
    </Field>
  );
}

function TestOutcomePanel({ outcome }: { outcome: TestOutcome }) {
  const { t } = useTranslation("settings");
  if (outcome.ok) {
    return (
      <div role="status" data-testid="email-test-result" className="flex items-start gap-2 border border-success/30 bg-success-subtle px-3 py-2.5 text-sm text-success-text">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{t("email.test.sent", { to: outcome.recipients.join(", "), ms: outcome.durationMs })}</p>
          {outcome.refused.length > 0 && <p className="text-xs">{t("email.test.refused", { list: outcome.refused.join(", ") })}</p>}
          <p className="text-xs">{t("email.test.checkInbox")}</p>
        </div>
      </div>
    );
  }
  const known = FAILURE_CODES.has(outcome.code);
  return (
    <div role="alert" data-testid="email-test-result" className="flex items-start gap-2 border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{known ? t(`email.test.failure.${outcome.code}`) : t("email.test.failure.other")}</p>
        <p className="break-words text-xs">{outcome.message}</p>
        <p className="text-[11px] text-danger-text/80">
          <code>{outcome.code}</code>
          {outcome.stage ? ` · ${t("email.test.stage", { stage: outcome.stage })}` : ""}
        </p>
      </div>
    </div>
  );
}

function DeliveryHistory({ state }: { state: EmailNotificationState }) {
  const { t } = useTranslation("settings");
  return (
    <HistoryList
      title={t("email.history.title")}
      empty={t("email.history.empty")}
      items={state.deliveries.slice(0, 8).map((d) => ({
        id: d.id,
        at: d.sentAt ?? d.queuedAt,
        status: d.status,
        statusLabel: t(`email.history.status.${d.status}`),
        subject: d.subject,
        error: d.error,
        retryAt: d.status === "retrying" ? d.nextAttemptAt : null,
      }))}
    />
  );
}
