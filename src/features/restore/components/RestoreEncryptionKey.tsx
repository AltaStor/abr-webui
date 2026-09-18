// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The key this restore decrypts with, when the appliance's own isn't the one.
 *
 * Normally there is nothing to do here: a restore point carries the key it was
 * written with, and the appliance resolves it without asking
 * (`_resolve_restore_encryption_key`). The field exists for the case that
 * resolution fails — the job is gone and its key with it, the key was replaced,
 * or this appliance is a rebuild whose catalog never held the key at all. That
 * last case is the disaster-recovery one the whole feature is for: the restore
 * points are on storage the operator still has, and an escrowed key is the only
 * thing that opens them.
 *
 * So it stays collapsed until asked for, and opens itself once the appliance
 * has said it has no key (`encryption_key_unavailable`) — the one moment the
 * operator definitely needs it.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, KeyRound, ShieldAlert } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RestoreEncryptionKeyProps {
  value: string;
  onChange: (value: string) => void;
  /** Set once the appliance has refused for want of a key: the field is then
   *  the only way forward, so it opens and says so. */
  required: boolean;
}

export function RestoreEncryptionKey({ value, onChange, required }: RestoreEncryptionKeyProps) {
  const { t } = useTranslation("restore");
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // A refusal for want of a key opens the field rather than leaving the
  // operator to find it behind a link while a recovery is stalled.
  useEffect(() => {
    if (required) setOpen(true);
  }, [required]);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2.5">
          {required ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          ) : (
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">{t("encryptionKey.title")}</p>
            <p className={cn("text-xs", required ? "text-danger" : "text-muted-foreground")}>
              {required ? t("encryptionKey.requiredDesc") : t("encryptionKey.desc")}
            </p>
          </div>
          {!open && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="shrink-0">
              {t("encryptionKey.useAnother")}
            </Button>
          )}
        </div>

        {open && (
          <div className="space-y-1.5">
            <Label htmlFor="restore-encryption-key">{t("encryptionKey.label")}</Label>
            <div className="relative max-w-md">
              <Input
                id="restore-encryption-key"
                type={revealed ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t("encryptionKey.placeholder")}
                autoComplete="off"
                spellCheck={false}
                className="pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setRevealed((r) => !r)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={revealed ? t("encryptionKey.hide") : t("encryptionKey.show")}
                title={revealed ? t("encryptionKey.hide") : t("encryptionKey.show")}
              >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t("encryptionKey.hint")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
