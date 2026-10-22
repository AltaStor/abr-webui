// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

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
 */

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Download, KeyRound, Loader2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { downloadBlob } from "@/lib/download";
import { apiErrorMessage, exportCatalogSnapshot } from "@/services/api.http";
import { useWorldStore } from "@/store/world";
import { SettingsSection } from "../SettingsSection";

/** The appliance's own floor for the archive password (`MIN_PASSWORD_LENGTH`). */
const MIN_EXPORT_PASSWORD_LENGTH = 8;

export function KeyEscrowCard() {
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
          jobs: counts.jobs ?? 0,
          backups: counts.backups ?? 0,
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
    <SettingsSection
      title={t("security.keyEscrow.title")}
      description={t("security.keyEscrow.description")}
      icon={KeyRound}
    >
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
    </SettingsSection>
  );
}
