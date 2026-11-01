// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type {
  EmailNotificationPatch,
  EmailNotificationState,
  OAuthGrant,
  OAuthProvider,
  SmtpAuth,
  SmtpSecurity,
} from "@/services/api.http";

/* The e-mail settings form without its view: the draft, how it maps from and
 * to the appliance's settings, and the appliance's own checks. */

export const DEFAULT_PORTS: Record<SmtpSecurity, number> = { starttls: 587, ssl: 465, none: 25 };
export const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$|^\[?[0-9A-Fa-f:.]+\]?$/;

/** A secret in the draft: undefined keeps the stored one, "" clears it. */
export type Secret = string | undefined;

export interface Draft {
  enabled: boolean;
  host: string;
  port: string;
  security: SmtpSecurity;
  verifyTls: boolean;
  timeout: string;
  auth: SmtpAuth;
  username: string;
  password: Secret;
  provider: OAuthProvider;
  grant: OAuthGrant;
  tenantId: string;
  clientId: string;
  clientSecret: Secret;
  refreshToken: Secret;
  tokenUrl: string;
  scope: string;
  senderAddress: string;
  senderName: string;
  recipients: string[];
  events: Record<string, boolean>;
  threshold: string;
}

export function draftOf(state: EmailNotificationState): Draft {
  const { smtp } = state;
  return {
    enabled: state.enabled,
    host: smtp.host,
    port: String(smtp.port),
    security: smtp.security,
    verifyTls: smtp.verifyTls,
    timeout: String(smtp.timeoutSeconds),
    auth: smtp.auth,
    username: smtp.username,
    password: undefined,
    provider: smtp.oauth2.provider,
    grant: smtp.oauth2.grant,
    tenantId: smtp.oauth2.tenantId,
    clientId: smtp.oauth2.clientId,
    clientSecret: undefined,
    refreshToken: undefined,
    tokenUrl: smtp.oauth2.tokenUrl,
    scope: smtp.oauth2.scope,
    senderAddress: state.sender.address,
    senderName: state.sender.name,
    recipients: [...state.recipients],
    events: Object.fromEntries(state.events.map((e) => [e.id, e.enabled])),
    threshold: String(state.repositorySpaceThresholdPercent),
  };
}

const wholeNumber = (value: string): number | null => (/^\d+$/.test(value.trim()) ? Number(value) : null);

export function patchOf(d: Draft): EmailNotificationPatch {
  return {
    enabled: d.enabled,
    smtp: {
      host: d.host.trim(),
      port: wholeNumber(d.port) ?? Number.NaN,
      security: d.security,
      verifyTls: d.verifyTls,
      timeoutSeconds: wholeNumber(d.timeout) ?? Number.NaN,
      auth: d.auth,
      username: d.username.trim(),
      ...(d.password !== undefined ? { password: d.password } : {}),
      oauth2: {
        provider: d.provider,
        grant: d.grant,
        tenantId: d.tenantId.trim(),
        clientId: d.clientId.trim(),
        tokenUrl: d.tokenUrl.trim(),
        scope: d.scope.trim(),
        ...(d.clientSecret !== undefined ? { clientSecret: d.clientSecret } : {}),
        ...(d.refreshToken !== undefined ? { refreshToken: d.refreshToken } : {}),
      },
    },
    sender: { address: d.senderAddress.trim(), name: d.senderName.trim() },
    recipients: d.recipients,
    events: d.events,
    repositorySpaceThresholdPercent: wholeNumber(d.threshold) ?? Number.NaN,
  };
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** The appliance's own checks, so the usual mistakes show before a round trip.
 *  Keys are the appliance's field names, so its answer lands on the same
 *  fields. `complete`: notifications on, or a test. */
export function problemsOf(d: Draft, state: EmailNotificationState, complete: boolean, t: T): Record<string, string> {
  const p: Record<string, string> = {};
  const host = d.host.trim();
  if (host && !HOST.test(host)) p["smtp.host"] = t("email.error.host");
  else if (complete && !host) p["smtp.host"] = t("email.error.hostRequired");
  const port = wholeNumber(d.port);
  if (port === null || port < 1 || port > 65535) p["smtp.port"] = t("email.error.port");
  const timeout = wholeNumber(d.timeout);
  if (timeout === null || timeout < 5 || timeout > 300) p["smtp.timeout_seconds"] = t("email.error.timeout");
  const stored = state.smtp;
  if (d.auth === "password" && complete) {
    if (!d.username.trim()) p["smtp.username"] = t("email.error.usernameRequired");
    if (d.password === "" || (d.password === undefined && !stored.passwordSet)) p["smtp.password"] = t("email.error.passwordRequired");
  }
  if (d.auth === "oauth2") {
    if (d.provider === "google" && d.grant === "client_credentials") p["smtp.oauth2.grant"] = t("email.error.googleGrant");
    if (d.tenantId.trim() && !/^[A-Za-z0-9.-]+$/.test(d.tenantId.trim())) p["smtp.oauth2.tenant_id"] = t("email.error.tenant");
    if (d.provider === "custom" && d.tokenUrl.trim() && !/^https:\/\/[^\s/]+/.test(d.tokenUrl.trim())) {
      p["smtp.oauth2.token_url"] = t("email.error.tokenUrl");
    }
    if (complete) {
      if (!d.username.trim()) p["smtp.username"] = t("email.error.mailboxRequired");
      if (!d.clientId.trim()) p["smtp.oauth2.client_id"] = t("email.error.clientIdRequired");
      if (d.provider === "microsoft" && d.grant === "client_credentials" && !d.tenantId.trim()) {
        p["smtp.oauth2.tenant_id"] = t("email.error.tenantRequired");
      }
      if (d.provider === "custom" && !d.tokenUrl.trim()) p["smtp.oauth2.token_url"] = t("email.error.tokenUrlRequired");
      const secretMissing = d.clientSecret === "" || (d.clientSecret === undefined && !stored.oauth2.clientSecretSet);
      if (d.grant === "client_credentials" && secretMissing) p["smtp.oauth2.client_secret"] = t("email.error.clientSecretRequired");
      const tokenMissing = d.refreshToken === "" || (d.refreshToken === undefined && !stored.oauth2.refreshTokenSet);
      if (d.grant === "refresh_token" && tokenMissing) p["smtp.oauth2.refresh_token"] = t("email.error.refreshTokenRequired");
    }
  }
  const sender = d.senderAddress.trim();
  if (sender && !ADDRESS.test(sender)) p["sender.address"] = t("email.error.address");
  else if (complete && !sender) p["sender.address"] = t("email.error.senderRequired");
  const bad = d.recipients.filter((r) => !ADDRESS.test(r));
  if (bad.length) p.recipients = t("email.error.recipients", { list: bad.join(", ") });
  else if (complete && !d.recipients.length) p.recipients = t("email.error.recipientsRequired");
  const threshold = wholeNumber(d.threshold);
  if (threshold === null || threshold < 50 || threshold > 99) p.repository_space_threshold_percent = t("email.error.threshold");
  return p;
}
