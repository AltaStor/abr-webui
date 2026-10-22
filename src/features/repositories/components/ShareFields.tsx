// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { Network } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { RepositoryShare } from "@/types";
import { shareDraftProblem, type ShareDraft } from "./share";

/**
 * A local repository's SMB share for Hyper-V hosts. abr-vhdx-tool writes
 * Hyper-V backups from the host, which cannot see a folder of the appliance:
 * it reaches the repository through this share, opened for each run with the
 * account given here (or the inventory's own when there is none).
 */
export function ShareFields({
  idPrefix,
  draft,
  onChange,
  saved,
  disabled = false,
}: {
  idPrefix: string;
  draft: ShareDraft;
  onChange: (next: ShareDraft) => void;
  /** The share already saved, whose password an empty field keeps. */
  saved?: RepositoryShare | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation("repositories");
  const problem = shareDraftProblem(draft, saved);
  const keepsPassword = Boolean(saved?.username) && saved?.username === draft.username.trim();

  return (
    <div className="space-y-3 border border-border bg-muted/30 p-3">
      <div className="min-w-0">
        <Label htmlFor={`${idPrefix}-share-unc`} className="flex items-center gap-1.5 text-xs font-medium">
          <Network className="h-3.5 w-3.5 text-muted-foreground" />
          {t("share.label")} <span className="font-normal text-muted-foreground">{t("share.optional")}</span>
        </Label>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("share.hint")}</p>
      </div>

      <div className="space-y-1.5">
        <Input
          id={`${idPrefix}-share-unc`}
          value={draft.unc}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, unc: e.target.value })}
          placeholder="\\backup01\hyperv"
          spellCheck={false}
          aria-invalid={problem === "unc"}
          className={cn("nums", problem === "unc" && "border-danger")}
        />
        {problem === "unc" && <p className="text-xs text-danger">{t("share.uncInvalid")}</p>}
      </div>

      {draft.unc.trim() !== "" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-share-user`}>{t("share.usernameLabel")}</Label>
            <Input
              id={`${idPrefix}-share-user`}
              value={draft.username}
              disabled={disabled}
              onChange={(e) => onChange({ ...draft, username: e.target.value })}
              placeholder="CORP\backupsvc"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-share-password`}>{t("share.passwordLabel")}</Label>
            <PasswordInput
              id={`${idPrefix}-share-password`}
              value={draft.password}
              disabled={disabled}
              onChange={(e) => onChange({ ...draft, password: e.target.value })}
              placeholder={keepsPassword ? t("share.passwordUnchanged") : "••••••••"}
              autoComplete="new-password"
              aria-invalid={problem === "password"}
              className={cn(problem === "password" && "border-danger")}
            />
          </div>
          <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground">
            {problem === "password" ? (
              <span className="text-danger">{t("share.passwordRequired")}</span>
            ) : (
              t("share.accountHint")
            )}
          </p>
        </div>
      )}
    </div>
  );
}
