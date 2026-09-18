// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Where a job's encryption key comes from.
 *
 * Two modes, and the difference between them is a disaster-recovery decision,
 * not a preference:
 *
 *   "managed"  The appliance mints a 256-bit key and keeps it. It is strong by
 *              construction and no one ever sees it — including the operator.
 *              The only copy lives inside the appliance, so it is recoverable
 *              only from a catalog export taken before the appliance was lost.
 *
 *   "custom"   The operator supplies the key. It is the only mode in which a
 *              weak key can enter the product, so it is validated here (see
 *              src/lib/encryption-key.ts), and the only mode in which the
 *              operator ends up holding a copy of the key — which is the point.
 *
 * "Generate" mints a strong key in the browser and shows it, so an operator can
 * have both properties at once: a key with full entropy AND a copy of it
 * outside the appliance. It is shown in the clear on purpose — a key that is
 * never displayed cannot be escrowed, and this is the one moment it can be.
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

export type EncryptionKeySource = "managed" | "custom";

interface EncryptionKeyFieldProps {
  source: EncryptionKeySource;
  onSourceChange: (source: EncryptionKeySource) => void;
  value: string;
  onChange: (value: string) => void;
  /** Show the error under the field — set once the operator has tried to submit. */
  touched: boolean;
  /** True when editing a job that is ALREADY encrypted, which changes what a
   *  custom key means: it replaces the job's key rather than setting it. */
  replacesExistingKey: boolean;
}

export function EncryptionKeyField({
  source,
  onSourceChange,
  value,
  onChange,
  touched,
  replacesExistingKey,
}: EncryptionKeyFieldProps) {
  const { t } = useTranslation("jobs");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const problem = source === "custom" ? encryptionKeyProblem(value) : null;
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
        <Label>{t("create.opt.encryptionKeyLabel")}</Label>
        <div className="flex gap-2">
          <SourceButton
            selected={source === "managed"}
            onClick={() => onSourceChange("managed")}
            label={t("create.opt.encryptionKeyManaged")}
          />
          <SourceButton
            selected={source === "custom"}
            onClick={() => onSourceChange("custom")}
            label={t("create.opt.encryptionKeyCustom")}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {source === "managed"
            ? t("create.opt.encryptionKeyManagedHint")
            : t("create.opt.encryptionKeyCustomHint")}
        </p>
      </div>

      {source === "custom" && (
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

          <p className="flex items-start gap-1.5 text-xs text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t("create.opt.encryptionKeyEscrow")}
              {replacesExistingKey && ` ${t("create.opt.encryptionKeyReplaces")}`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function SourceButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex-1 border px-3 py-1.5 font-display text-xs font-medium transition-colors",
        selected
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
