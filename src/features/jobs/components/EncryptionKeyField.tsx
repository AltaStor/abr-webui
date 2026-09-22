// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The job's encryption key, which the operator supplies.
 *
 * The appliance can also mint a 256-bit key and keep it — omitting
 * `encryption_key` on the wire is what asks for that — and this field used to
 * offer it as a second mode. It no longer does: a key that is never displayed
 * can never be escrowed, so its only copy lives inside the appliance and a lost
 * appliance takes every restore point with it. Asking for the key here is what
 * guarantees a copy exists somewhere else.
 *
 * That leaves the operator's key as the one path a weak key could enter the
 * product by, so it is validated here (see src/lib/encryption-key.ts).
 * "Generate" mints a strong key in the browser and shows it, so full entropy
 * costs nothing: it is displayed in the clear on purpose, because this is the
 * one moment the key can be written down.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Copy, Eye, EyeOff, RefreshCw } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { encryptionKeyErrorKey, encryptionKeyProblem, generateEncryptionKey } from "@/lib/encryption-key";

interface EncryptionKeyFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Show the error under the field — set once the operator has tried to submit. */
  touched: boolean;
  /** True when editing a job that is ALREADY encrypted. Its key is held by the
   *  appliance, so an empty field keeps that key and a typed one replaces it. */
  hasStoredKey: boolean;
}

export function EncryptionKeyField({
  value,
  onChange,
  touched,
  hasStoredKey,
}: EncryptionKeyFieldProps) {
  const { t } = useTranslation("jobs");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  // An empty field is only wrong when there is no stored key behind it; on a
  // job that is already encrypted it means "leave the key alone".
  const keepsStoredKey = hasStoredKey && value === "";
  const problem = keepsStoredKey ? null : encryptionKeyProblem(value);
  const errorKey = encryptionKeyErrorKey(problem);
  const showError = touched && errorKey !== null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("create.opt.encryptionKeyCopyFailed"));
    }
  };

  const generate = () => {
    onChange(generateEncryptionKey());
    // Generating a key nobody can read is pointless — this is the moment it has
    // to be legible enough to write down.
    setRevealed(true);
  };

  return (
    <div className="space-y-3 border border-border bg-muted/20 p-3">
      <div className="space-y-2">
        <Label htmlFor="job-encryption-key">{t("create.opt.encryptionKeyLabel")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("create.opt.encryptionKeyCustomHint")}
          {hasStoredKey && ` ${t("create.opt.encryptionKeyKeep")}`}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="job-encryption-key"
              type={revealed ? "text" : "password"}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("create.opt.encryptionKeyPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              className={cn("pr-9 font-mono", showError && "border-danger")}
              aria-invalid={showError}
              aria-label={t("create.opt.encryptionKeyLabel")}
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={revealed ? t("create.opt.encryptionKeyHide") : t("create.opt.encryptionKeyShow")}
              title={revealed ? t("create.opt.encryptionKeyHide") : t("create.opt.encryptionKeyShow")}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button type="button" variant="outline" onClick={generate} className="shrink-0 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("create.opt.encryptionKeyGenerate")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copy}
            disabled={value === ""}
            className="shrink-0 text-muted-foreground"
            aria-label={t("create.opt.encryptionKeyCopy")}
            title={t("create.opt.encryptionKeyCopy")}
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {showError && errorKey && <p className="text-xs text-danger">{t(errorKey)}</p>}

        {/* Nothing to escrow while the field is empty on an already-encrypted
            job: that saves the job without touching its key. */}
        {!keepsStoredKey && (
          <p className="flex items-start gap-1.5 text-xs text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t("create.opt.encryptionKeyEscrow")}
              {hasStoredKey && ` ${t("create.opt.encryptionKeyReplaces")}`}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
