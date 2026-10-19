// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  Copy,
  FolderOpen,
  Loader2,
  LockKeyhole,
  RotateCcw,
} from "@/lib/icons";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatFullDateTime, formatRelative } from "@/lib/format";
import {
  apiErrorMessage,
  getTlsCertificate,
  installTlsCertificate,
  revertTlsCertificate,
  tlsCertificateErrorField,
  type TlsCertificate,
  type TlsCertificateWarning,
} from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import { SettingsSection } from "../SettingsSection";
import { useCan } from "@/store/permissions";

/** Mirrors the appliance's MAX_PEM_CHARS — a file bigger than this is the wrong file. */
const MAX_PEM_FILE_BYTES = 100_000;

type Field = "certificate" | "privateKey" | "passphrase";

/**
 * The certificate the console and REST API are served over HTTPS with, and the
 * one place an administrator swaps it for their own. The appliance validates
 * the pair before touching anything and loads it into the running server, so
 * this card only has to collect it and then say plainly what happened —
 * including that this very browser tab is still on the old connection.
 */
export function TlsCertificateCard() {
  const { t } = useTranslation("settings");
  const mode = useWorldStore((s) => s.mode);

  const [cert, setCert] = useState<TlsCertificate | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [reverting, setReverting] = useState(false);
  const canEdit = useCan("tls.edit");

  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    setStatus("loading");
    getTlsCertificate()
      .then((data) => {
        if (cancelled) return;
        setCert(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, attempt]);

  const announceChange = (next: TlsCertificate, title: string) => {
    setCert(next);
    toast.success(title, {
      description: next.reloaded
        ? t("security.certificate.toast.reloaded")
        : t("security.certificate.toast.nextStart"),
      action: next.reloaded
        ? { label: t("security.certificate.toast.reload"), onClick: () => window.location.reload() }
        : undefined,
      duration: 12_000,
    });
  };

  const revert = async () => {
    setReverting(true);
    try {
      const next = await revertTlsCertificate();
      setConfirmRevert(false);
      setReplacing(false);
      announceChange(next, t("security.certificate.toast.reverted"));
    } catch (err) {
      toast.error(t("security.certificate.revertFailed"), { description: apiErrorMessage(err) ?? undefined });
    } finally {
      setReverting(false);
    }
  };

  const headerAside =
    mode === "live" && cert ? (
      cert.expired ? (
        <Badge variant="danger">{t("security.certificate.badge.expired")}</Badge>
      ) : cert.source === "administrator" ? (
        <Badge variant="info">{t("security.certificate.badge.administrator")}</Badge>
      ) : (
        <Badge variant="outline">{t("security.certificate.badge.generated")}</Badge>
      )
    ) : null;

  return (
    <SettingsSection
      title={t("security.certificate.title")}
      description={t("security.certificate.description")}
      icon={LockKeyhole}
      headerAside={headerAside}
    >
      {mode !== "live" ? (
        <p className="py-3.5 text-sm text-muted-foreground">{t("toast.connectLive")}</p>
      ) : status === "loading" && !cert ? (
        <p className="flex items-center gap-2 py-3.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("security.certificate.loading")}
        </p>
      ) : status === "failed" && !cert ? (
        <div className="my-3.5 flex items-start gap-2 border border-warning/30 bg-warning-subtle px-3 py-2.5 text-[13px] leading-relaxed text-warning-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{t("security.certificate.loadFailed")}</span>
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            {t("common:actions.retry")}
          </Button>
        </div>
      ) : cert ? (
        <div className="space-y-4 py-3.5">
          <CertificateDetails cert={cert} />

          {cert.warnings.length > 0 && (
            <ul className="space-y-2">
              {cert.warnings.map((w) => (
                <li
                  key={w.code}
                  className={cn(
                    "flex items-start gap-2 border px-3 py-2 text-[13px] leading-relaxed",
                    w.code === "expired"
                      ? "border-danger/30 bg-danger-subtle text-danger-text"
                      : "border-warning/30 bg-warning-subtle text-warning-text",
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{warningText(w, cert, t)}</span>
                </li>
              ))}
            </ul>
          )}

          {replacing ? (
            <ReplaceCertificateForm
              onCancel={() => setReplacing(false)}
              onInstalled={(next) => {
                setReplacing(false);
                announceChange(next, t("security.certificate.toast.installed"));
              }}
            />
          ) : !canEdit ? null : (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-3.5">
              {cert.source === "administrator" && (
                <Button variant="outline" size="sm" onClick={() => setConfirmRevert(true)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("security.certificate.revert")}
                </Button>
              )}
              <Button size="sm" onClick={() => setReplacing(true)}>
                {t("security.certificate.replace")}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <Dialog open={confirmRevert} onOpenChange={(open) => !reverting && setConfirmRevert(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("security.certificate.revertDialog.title")}</DialogTitle>
            <DialogDescription>{t("security.certificate.revertDialog.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevert(false)} disabled={reverting}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => void revert()} disabled={reverting}>
              {reverting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("security.certificate.revertDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

/* ----------------------------------------------------------------- details -- */

function CertificateDetails({ cert }: { cert: TlsCertificate }) {
  const { t } = useTranslation("settings");
  const names = [...cert.dnsNames, ...cert.ipAddresses];

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        <DetailRow label={t("security.certificate.issuedTo")}>
          <span className="break-all font-medium">{cert.commonName ?? cert.subject}</span>
        </DetailRow>
        <DetailRow label={t("security.certificate.issuedBy")}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-all font-medium">{cert.issuerCommonName ?? cert.issuer}</span>
            {cert.selfSigned && <Badge variant="outline">{t("security.certificate.selfSigned")}</Badge>}
          </span>
        </DetailRow>
        <DetailRow label={t("security.certificate.names")}>
          {names.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {names.map((name) => (
                <span key={name} className="nums border border-border bg-muted/40 px-1.5 py-0.5 text-xs">
                  {name}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </DetailRow>
        <DetailRow label={t("security.certificate.validUntil")}>
          <span className={cn("font-medium", cert.expired && "text-danger-text")}>
            {formatFullDateTime(cert.notAfter)}
          </span>{" "}
          <span className={cn("text-muted-foreground", cert.expired && "text-danger-text")}>
            {cert.expired
              ? t("security.certificate.expiredAgo", { rel: formatRelative(cert.notAfter) })
              : t("security.certificate.daysLeft", { count: cert.daysRemaining })}
          </span>
        </DetailRow>
        <DetailRow label={t("security.certificate.key")}>
          <span className="nums">{cert.keyType}</span>
          {cert.chainLength > 1 && (
            <span className="text-muted-foreground">
              {" · "}
              {t("security.certificate.intermediates", { count: cert.chainLength - 1 })}
            </span>
          )}
        </DetailRow>
        <DetailRow label={t("security.certificate.fingerprint")}>
          <Fingerprint value={cert.fingerprintSha256} />
        </DetailRow>
      </dl>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {cert.source === "generated"
          ? t("security.certificate.sourceGenerated")
          : cert.installedAt
            ? t("security.certificate.sourceInstalled", {
                user: cert.installedBy ?? t("security.certificate.anAdministrator"),
                when: formatFullDateTime(cert.installedAt),
              })
            : t("security.certificate.sourceManual")}
      </p>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function Fingerprint({ value }: { value: string }) {
  const { t } = useTranslation("settings");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("toast.copyFailed"));
    }
  };

  return (
    <span className="flex items-start gap-1">
      <span className="nums break-all text-xs leading-5">{value}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="-my-1.5 shrink-0 text-muted-foreground"
        aria-label={t("security.certificate.copyFingerprint")}
        title={t("security.certificate.copyFingerprint")}
        onClick={() => void copy()}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </span>
  );
}

function warningText(
  w: TlsCertificateWarning,
  cert: TlsCertificate,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (w.code) {
    case "expired":
      return t("security.certificate.warning.expired");
    case "expires_soon":
      return cert.autoRenew
        ? t("security.certificate.warning.expiresSoonAutoRenew", { count: w.daysRemaining ?? cert.daysRemaining })
        : t("security.certificate.warning.expiresSoon", { count: w.daysRemaining ?? cert.daysRemaining });
    case "no_subject_alternative_names":
      return t("security.certificate.warning.noNames");
    case "appliance_names_not_covered":
      return t("security.certificate.warning.namesNotCovered", {
        names: (w.applianceNames ?? []).join(", "),
      });
    default:
      return w.message;
  }
}

/* ----------------------------------------------------------------- replace -- */

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*?-----END \1-----/g;

/** Split a PEM file into its certificate blocks and its private key, so one
 *  combined `.pem` (key + certificate + chain, a common export) fills both
 *  fields instead of being refused for having a key in the certificate. */
function splitPem(text: string): { certificates: string; privateKey: string } {
  const certificates: string[] = [];
  const keys: string[] = [];
  for (const match of text.matchAll(PEM_BLOCK)) {
    if (match[1] === "CERTIFICATE") certificates.push(match[0]);
    else if (match[1].endsWith("PRIVATE KEY")) keys.push(match[0]);
  }
  return { certificates: certificates.join("\n"), privateKey: keys[0] ?? "" };
}

function ReplaceCertificateForm({
  onCancel,
  onInstalled,
}: {
  onCancel: () => void;
  onInstalled: (cert: TlsCertificate) => void;
}) {
  const { t } = useTranslation("settings");
  const [certificate, setCertificate] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  /** A refusal the appliance didn't pin on one field. */
  const [formError, setFormError] = useState<string | null>(null);

  const clearError = (field: Field) => {
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError(null);
  };

  const loadFile = async (field: "certificate" | "privateKey", file: File) => {
    clearError(field);
    if (file.size > MAX_PEM_FILE_BYTES) {
      setErrors((e) => ({ ...e, [field]: t("security.certificate.form.fileTooLarge", { name: file.name }) }));
      return;
    }
    const text = await file.text();
    const { certificates, privateKey: key } = splitPem(text);
    if (!certificates && !key) {
      setErrors((e) => ({ ...e, [field]: t("security.certificate.form.fileNotPem", { name: file.name }) }));
      return;
    }
    // Fill whatever the file actually holds — a key picked for the certificate
    // field lands in the key field — but never overwrite what the other field
    // already has with an unrelated file's contents.
    if (certificates && (field === "certificate" || !certificate.trim())) {
      setCertificate(certificates);
      clearError("certificate");
    }
    if (key && (field === "privateKey" || !privateKey.trim())) {
      setPrivateKey(key);
      clearError("privateKey");
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const missing: Partial<Record<Field, string>> = {};
    if (!certificate.trim()) missing.certificate = t("security.certificate.form.certificateRequired");
    if (!privateKey.trim()) missing.privateKey = t("security.certificate.form.privateKeyRequired");
    setErrors(missing);
    setFormError(null);
    if (Object.keys(missing).length > 0) return;

    setSubmitting(true);
    try {
      const next = await installTlsCertificate({ certificate, privateKey, passphrase: passphrase || undefined });
      onInstalled(next);
    } catch (err) {
      const message = apiErrorMessage(err) ?? t("security.certificate.form.installFailed");
      const field = tlsCertificateErrorField(err);
      if (field) setErrors({ [field]: message });
      else setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className="space-y-4 border-t border-border/50 pt-3.5"
      aria-label={t("security.certificate.form.title")}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("security.certificate.form.title")}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("security.certificate.form.intro")}</p>
      </div>

      {formError && (
        <div className="flex items-start gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">{formError}</span>
        </div>
      )}

      <PemField
        id="tls-certificate"
        label={t("security.certificate.form.certificateLabel")}
        hint={t("security.certificate.form.certificateHint")}
        placeholder="-----BEGIN CERTIFICATE-----"
        accept=".pem,.crt,.cer,.txt"
        value={certificate}
        error={errors.certificate}
        disabled={submitting}
        onChange={(v) => {
          setCertificate(v);
          clearError("certificate");
        }}
        onFile={(file) => void loadFile("certificate", file)}
      />
      <PemField
        id="tls-private-key"
        label={t("security.certificate.form.privateKeyLabel")}
        hint={t("security.certificate.form.privateKeyHint")}
        placeholder="-----BEGIN PRIVATE KEY-----"
        accept=".pem,.key,.txt"
        value={privateKey}
        error={errors.privateKey}
        disabled={submitting}
        onChange={(v) => {
          setPrivateKey(v);
          clearError("privateKey");
        }}
        onFile={(file) => void loadFile("privateKey", file)}
      />

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="tls-passphrase">{t("security.certificate.form.passphraseLabel")}</Label>
        <Input
          id="tls-passphrase"
          type="password"
          autoComplete="off"
          value={passphrase}
          disabled={submitting}
          onChange={(e) => {
            setPassphrase(e.target.value);
            clearError("passphrase");
          }}
          aria-invalid={errors.passphrase ? true : undefined}
          aria-describedby={errors.passphrase ? "tls-passphrase-error" : "tls-passphrase-hint"}
          className="h-9"
        />
        {errors.passphrase ? (
          <p id="tls-passphrase-error" className="text-xs text-danger-text">
            {errors.passphrase}
          </p>
        ) : (
          <p id="tls-passphrase-hint" className="text-xs text-muted-foreground">
            {t("security.certificate.form.passphraseHint")}
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("security.certificate.form.afterInstall")}</p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitting ? t("security.certificate.form.installing") : t("security.certificate.form.install")}
        </Button>
      </div>
    </form>
  );
}

function PemField({
  id,
  label,
  hint,
  placeholder,
  accept,
  value,
  error,
  disabled,
  onChange,
  onFile,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  accept: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onFile: (file: File) => void;
}) {
  const { t } = useTranslation("settings");
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-1 text-muted-foreground"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t("security.certificate.form.loadFile")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={accept}
          className="hidden"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            // Let the same file be picked again after it was edited on disk.
            e.target.value = "";
          }}
        />
      </div>
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        rows={6}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className={cn(
          "nums block w-full resize-y border border-input bg-background/40 px-3 py-2 text-xs leading-5 transition-colors duration-250",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-danger/60",
        )}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
