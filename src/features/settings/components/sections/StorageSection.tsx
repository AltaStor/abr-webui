// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, HardDrive, Loader2, Plus } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { formatUnc } from "@/features/repositories/components/share";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import type { Repository } from "@/types";
import { SettingRow } from "../SettingRow";
import { SettingDivider, SettingsSection } from "../SettingsSection";

export function StorageSection() {
  return (
    <div className="space-y-4">
      <DefaultRepositoryCard />
    </div>
  );
}

/** What the card is waiting on the appliance for. */
type Pending = "create" | "hyperv" | null;

/**
 * The appliance's own local repository: where it stores, and whether Hyper-V
 * hosts can write to it. The server creates it at startup when it is missing,
 * so "Create" is offered only for the rare appliance without one (deleted, or
 * the folder could not be made at startup); the Hyper-V switch is what an
 * operator usually comes here for. The appliance has one call for both
 * (`POST /repositories/default`), and the switch acts at once, like the
 * two-factor one: it makes or removes a share and an account, nothing to draft.
 */
function DefaultRepositoryCard() {
  const { t } = useTranslation("settings");
  const repository = useWorldStore((s) => s.repositories.find((r) => r.isDefault) ?? null);
  const setUpDefaultRepository = useWorldStore((s) => s.setUpDefaultRepository);
  // The appliance checks `repository.create` for both the create and the switch.
  const canSetUp = useCan("repository.create");
  const [pending, setPending] = useState<Pending>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const setUp = async (kind: Exclude<Pending, null>, supportHyperV: boolean) => {
    if (pending) return;
    setPending(kind);
    setFailure(null);
    try {
      const res = await setUpDefaultRepository(supportHyperV);
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      toast.success(
        res.created
          ? t("storage.defaultRepository.toast.created")
          : t(res.repository.supportsHyperV ? "storage.defaultRepository.toast.hypervOn" : "storage.defaultRepository.toast.hypervOff", {
              name: res.repository.name,
            }),
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <SettingsSection
      title={t("storage.defaultRepository.title")}
      description={t("storage.defaultRepository.description")}
      icon={HardDrive}
    >
      {repository ? (
        <>
          <SettingRow
            label={t("storage.defaultRepository.folder")}
            description={t("storage.defaultRepository.folderHint", { name: repository.name })}
          >
            <code className="nums block break-all bg-muted/60 px-2 py-1 text-xs sm:text-right">{repository.path}</code>
          </SettingRow>
          <SettingDivider />
          <SettingRow
            label={t("storage.defaultRepository.hypervLabel")}
            description={t("storage.defaultRepository.hypervHint")}
            htmlFor="default-repo-hyperv"
          >
            <div className="flex items-center justify-start gap-2 sm:justify-end">
              {pending === "hyperv" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                id="default-repo-hyperv"
                checked={Boolean(repository.supportsHyperV)}
                onCheckedChange={(on) => void setUp("hyperv", on)}
                disabled={!canSetUp || pending !== null}
                aria-label={t("storage.defaultRepository.hypervLabel")}
              />
            </div>
          </SettingRow>
          {repository.supportsHyperV && <HyperVShare repository={repository} />}
        </>
      ) : (
        <SettingRow
          label={t("storage.defaultRepository.missing")}
          description={t("storage.defaultRepository.missingHint")}
        >
          {canSetUp && (
            <div className="flex justify-start sm:justify-end">
              <Button size="sm" disabled={pending !== null} onClick={() => void setUp("create", false)}>
                {pending === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {pending === "create" ? t("storage.defaultRepository.creating") : t("storage.defaultRepository.create")}
              </Button>
            </div>
          )}
        </SettingRow>
      )}

      {failure && (
        <div role="alert" className="mb-3.5 flex items-start gap-2.5 border border-danger/30 bg-danger-subtle px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="break-words text-xs text-danger">{failure}</p>
        </div>
      )}
    </SettingsSection>
  );
}

/** The share and account the appliance made for Hyper-V hosts. Never a
 *  password: the appliance does not send it. */
function HyperVShare({ repository }: { repository: Repository }) {
  const { t } = useTranslation("settings");
  if (!repository.share) return null;
  return (
    <div className="mb-3.5 space-y-2 border border-border p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t("storage.defaultRepository.share")}</dt>
        <dd>
          <code className="nums break-all">{formatUnc(repository.share)}</code>
        </dd>
        {repository.share.username && (
          <>
            <dt className="text-muted-foreground">{t("storage.defaultRepository.account")}</dt>
            <dd>
              <code className="nums">{repository.share.username}</code>
            </dd>
          </>
        )}
      </dl>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("storage.defaultRepository.passwordNote")}</p>
    </div>
  );
}
