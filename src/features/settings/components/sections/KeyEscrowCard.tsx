// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ (AltaStor.com)

/**
 * Key escrow — a copy of the encryption keys that survives this appliance.
 *
 * A job that turns encryption on without a key of its own gets one minted
 * server-side, and it is never displayed to anybody. It is stored on the job
 * record and on every restore point written with it, which makes restores work
 * without asking — and makes the catalog the only place the key exists. Lose
 * the appliance and its database, and encrypted restore points sitting safely
 * in a repository become unreadable: the classic case of the only copy of the
 * key being inside the box the key was protecting.
 *
 * NIST SP 800-209 and ISO/IEC 27040 both want keys recoverable independently
 * of the system they protect. This is that mechanism: an archive of the catalog
 * — jobs, restore points and their keys included — encrypted under a password
 * the operator chooses and downloaded to somewhere that is not this appliance.
 * It is deliberately NOT a way to read a key out in the clear; what comes back
 * is an archive, and only this password opens it.
 *
 * Import is the other half: the archive goes back into a catalog — this
 * appliance's after a rebuild, or a new one — and its jobs and restore points
 * bring their keys with them (`abr system import` does the same).
 */

import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, DatabaseArrowDown, Download, FolderOpen, KeyRound, Loader2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { downloadBlob, downloadText } from "@/lib/download";
import { queryClient } from "@/lib/query";
import {
  apiErrorCode,
  apiErrorMessage,
  exportCatalogSnapshot,
  importCatalogSnapshot,
  type CatalogImportResult,
} from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { refreshWorld, useWorldStore } from "@/store/world";
import { SettingsSection } from "../SettingsSection";
import { countOf } from "@/lib/count";

/** The appliance's own floor for the archive password (`MIN_PASSWORD_LENGTH`). */
const MIN_EXPORT_PASSWORD_LENGTH = 8;

export function KeyEscrowCard() {
  const { t } = useTranslation("settings");
  const canExport = useCan("system.export");
  const canImport = useCan("system.import");
  const [importing, setImporting] = useState(false);

  return (
    <SettingsSection
      title={t("security.keyEscrow.title")}
      description={t("security.keyEscrow.description")}
      icon={KeyRound}
    >
      {canExport && <ExportForm />}
      {canImport && (
        <div className={canExport ? "space-y-2 border-t border-border/60 py-3.5" : "space-y-2 py-3.5"}>
          <p className="text-sm font-medium">{t("security.keyEscrow.import.title")}</p>
          <p className="max-w-prose text-xs text-muted-foreground">{t("security.keyEscrow.import.description")}</p>
          <Button variant="outline" size="sm" onClick={() => setImporting(true)} data-testid="escrow-import-open">
            <DatabaseArrowDown className="h-3.5 w-3.5" />
            {t("security.keyEscrow.import.open")}
          </Button>
          <ImportDialog open={importing} onOpenChange={setImporting} />
        </div>
      )}
    </SettingsSection>
  );
}

function ExportForm() {
  const { t } = useTranslation("settings");
  const mode = useWorldStore((s) => s.mode);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [exporting, setExporting] = useState(false);

  const passwordError =
    touched && password.length < MIN_EXPORT_PASSWORD_LENGTH
      ? t("security.keyEscrow.tooShort", { count: MIN_EXPORT_PASSWORD_LENGTH })
      : null;
  const confirmError = touched && !passwordError && confirm !== password
    ? t("security.keyEscrow.mismatch")
    : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password.length < MIN_EXPORT_PASSWORD_LENGTH || confirm !== password) return;
    if (mode !== "live") {
      toast.info(t("toast.connectLive"));
      return;
    }
    setExporting(true);
    try {
      const { blob, filename, counts } = await exportCatalogSnapshot(password);
      downloadBlob(filename, blob);
      toast.success(t("security.keyEscrow.toast.done"), {
        description: t("security.keyEscrow.toast.doneDescription", {
          jobs: countOf("job", counts.jobs ?? 0),
          backups: countOf("backup", counts.backups ?? 0),
        }),
      });
      setPassword("");
      setConfirm("");
      setTouched(false);
    } catch (err) {
      toast.error(t("security.keyEscrow.toast.failed"), {
        description: apiErrorMessage(err) ?? t("security.keyEscrow.toast.failedDescription"),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="max-w-sm space-y-4 py-3.5">
      <div className="flex items-start gap-2 border border-warning/30 bg-warning/[0.06] px-3 py-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs text-warning-text">{t("security.keyEscrow.warning")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="escrow-password">{t("security.keyEscrow.passwordLabel")}</Label>
        <PasswordInput
          id="escrow-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-invalid={passwordError ? true : undefined}
          className="h-9"
        />
        <p className={passwordError ? "text-xs text-danger-text" : "text-xs text-muted-foreground"}>
          {passwordError ?? t("security.keyEscrow.passwordHint", { count: MIN_EXPORT_PASSWORD_LENGTH })}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="escrow-confirm">{t("security.keyEscrow.confirmLabel")}</Label>
        <PasswordInput
          id="escrow-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          aria-invalid={confirmError ? true : undefined}
          className="h-9"
        />
        {confirmError && <p className="text-xs text-danger-text">{confirmError}</p>}
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={exporting}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exporting ? t("security.keyEscrow.exporting") : t("security.keyEscrow.submit")}
        </Button>
      </div>
    </form>
  );
}

/** The tables an import reports, in the order the result lists them. */
const IMPORTED_TABLES = ["jobs", "backups", "repositories", "hypervisors", "users"] as const;

/** Refusals with a sentence of their own; anything else shows the appliance's. */
const IMPORT_REFUSALS = new Set(["wrong_password", "invalid_export", "incompatible_export"]);

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode === "live");
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogImportResult | null>(null);

  const reset = () => {
    setFile(null);
    setPassword("");
    setTouched(false);
    setError(null);
    setResult(null);
  };
  const close = (next: boolean) => {
    if (pending) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const fileError = touched && !file ? t("security.keyEscrow.import.fileRequired") : null;
  const passwordError = touched && !password ? t("security.keyEscrow.import.passwordRequired") : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!file || !password) return;
    if (!live) {
      toast.info(t("toast.connectLive"));
      return;
    }
    setPending(true);
    try {
      const imported = await importCatalogSnapshot(file, password);
      setResult(imported);
      setPassword("");
      // Jobs, restore points, repositories and environments may all have
      // changed under the console.
      void queryClient.invalidateQueries();
      refreshWorld();
      toast.success(t("security.keyEscrow.import.toast"));
    } catch (err) {
      const code = apiErrorCode(err);
      setError(
        code && IMPORT_REFUSALS.has(code)
          ? t(`security.keyEscrow.import.refusal.${code}`, { detail: apiErrorMessage(err) ?? "" })
          : (apiErrorMessage(err) ?? t("security.keyEscrow.import.failed")),
      );
    } finally {
      setPending(false);
    }
  };

  const settingsCount = result ? Object.keys(result.configuration).length : 0;
  const downloadSettings = () => {
    if (!result || !file) return;
    const lines = Object.keys(result.configuration)
      .sort()
      .map((key) => `${key}=${result.configuration[key]}`);
    downloadText(`${file.name}-default.env`, `${t("security.keyEscrow.import.settingsHeader")}\n${lines.join("\n")}\n`);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("security.keyEscrow.import.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("security.keyEscrow.import.dialogDescription")}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm" data-testid="escrow-import-result">
            <p className="flex items-center gap-2 font-medium text-success-text">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t("security.keyEscrow.import.done", { file: file?.name ?? "" })}
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border border-border px-3 py-2 text-xs">
              {IMPORTED_TABLES.map((table) => (
                <div key={table} className="contents">
                  <dt className="text-muted-foreground">{t(`security.keyEscrow.import.tables.${table}`)}</dt>
                  <dd className="nums text-right font-medium">{result.restored[table] ?? 0}</dd>
                </div>
              ))}
            </dl>
            {result.replacedUsers.length > 0 && (
              <p className="text-xs text-warning-text">
                {t("security.keyEscrow.import.replacedUsers", { list: result.replacedUsers.join(", ") })}
              </p>
            )}
            {settingsCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("security.keyEscrow.import.settings", { count: settingsCount })}{" "}
                <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={downloadSettings}>
                  {t("security.keyEscrow.import.downloadSettings")}
                </button>
              </p>
            )}
            <DialogFooter>
              <Button size="sm" onClick={() => close(false)}>
                {t("common:actions.close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
            <div className="flex items-start gap-2 border border-warning/30 bg-warning/[0.06] px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-warning-text">{t("security.keyEscrow.import.warning")}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="escrow-import-file">{t("security.keyEscrow.import.fileLabel")}</Label>
              <div className="flex items-center gap-2">
                <Button
                  id="escrow-import-file"
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => fileInput.current?.click()}
                  aria-invalid={fileError ? true : undefined}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t("security.keyEscrow.import.chooseFile")}
                </Button>
                <span className="min-w-0 truncate text-xs text-muted-foreground" data-testid="escrow-import-file-name">
                  {file ? file.name : t("security.keyEscrow.import.noFile")}
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".abrsnap"
                  className="hidden"
                  tabIndex={-1}
                  data-testid="escrow-import-input"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError(null);
                    e.target.value = "";
                  }}
                />
              </div>
              {fileError && <p className="text-xs text-danger-text">{fileError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="escrow-import-password">{t("security.keyEscrow.passwordLabel")}</Label>
              <PasswordInput
                id="escrow-import-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
                aria-invalid={passwordError ? true : undefined}
                className="h-9"
                disabled={pending}
              />
              {passwordError && <p className="text-xs text-danger-text">{passwordError}</p>}
            </div>

            {error && (
              <p role="alert" className="text-xs text-danger-text" data-testid="escrow-import-error">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => close(false)}>
                {t("common:actions.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={pending} data-testid="escrow-import-submit">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseArrowDown className="h-3.5 w-3.5" />}
                {pending ? t("security.keyEscrow.import.importing") : t("security.keyEscrow.import.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
