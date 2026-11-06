// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, Network, Plus } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { useWorldStore } from "@/store/world";
import { useCan } from "@/store/permissions";
import type { Repository } from "@/types";
import { formatUnc } from "./share";

/**
 * The appliance's own local repository: whether it exists, where it stores,
 * and whether Hyper-V hosts can write to it. The server creates it at startup
 * when it is missing, so "Create" is offered only for the rare appliance
 * without one (deleted, or the folder could not be made at startup); the
 * Hyper-V switch is what an operator usually comes here for.
 */
export function DefaultRepositoryStrip() {
  const { t } = useTranslation("repositories");
  const repository = useWorldStore((s) => s.repositories.find((r) => r.isDefault) ?? null);
  const canSetUp = useCan("repository.create");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-muted text-muted-foreground">
          <HardDrive className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="label-overline">{t("default.title")}</p>
          {repository ? (
            <>
              <p className="text-sm">
                <span className="font-medium">{repository.name}</span>{" "}
                <code className="nums bg-muted/60 px-1.5 py-0.5 text-xs">{repository.path}</code>
              </p>
              <HyperVLine repository={repository} />
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{t("default.missing")}</p>
              <p className="text-xs text-muted-foreground">{t("default.missingHint")}</p>
            </>
          )}
        </div>
      </div>
      {canSetUp && (
        <Button variant={repository ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
          {repository ? (
            <Network className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {repository ? t("default.hypervAction") : t("default.create")}
        </Button>
      )}
      <DefaultRepositoryDialog repository={repository} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function HyperVLine({ repository }: { repository: Repository }) {
  const { t } = useTranslation("repositories");
  if (!repository.supportsHyperV) {
    return <p className="text-xs text-muted-foreground">{t("default.hypervOff")}</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      {t("default.hypervOn")}
      {repository.share && (
        <>
          {" · "}
          <code className="nums">{formatUnc(repository.share)}</code>
          {repository.share.username && <> · {t("default.account", { account: repository.share.username })}</>}
        </>
      )}
    </p>
  );
}

type Outcome =
  | { kind: "done"; repository: Repository; created: boolean }
  /** `createdFirst`: the repository was created and only its share failed. */
  | { kind: "failed"; message: string; createdFirst: boolean };

/**
 * Create the default repository, or switch its Hyper-V support. One dialog for
 * both because the appliance has one call for both: the switch is part of
 * creating it, and the same switch later turns the share on or off.
 */
function DefaultRepositoryDialog({
  repository,
  open,
  onOpenChange,
}: {
  repository: Repository | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("repositories");
  const setUpDefaultRepository = useWorldStore((s) => s.setUpDefaultRepository);
  // Fixed when the dialog opens: once the create lands, the store hands this
  // dialog the new repository, and the title must not turn into another one.
  const [creating, setCreating] = useState(repository === null);
  const [hyperV, setHyperV] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (open) {
      setCreating(repository === null);
      setHyperV(Boolean(repository?.supportsHyperV));
      setBusy(false);
      setOutcome(null);
    }
    // Seeded when the dialog opens, not on every store refresh while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unchanged = !creating && hyperV === Boolean(repository?.supportsHyperV);

  const submit = async () => {
    if (busy || unchanged) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await setUpDefaultRepository(hyperV);
      if (res.ok) {
        setOutcome({ kind: "done", repository: res.repository, created: res.created });
        toast.success(
          res.created ? t("default.toast.created") : t("default.toast.changed", { name: res.repository.name }),
        );
      } else {
        const createdFirst = creating && res.repository !== null;
        setOutcome({ kind: "failed", message: res.message, createdFirst });
        // It exists now: what is left to do is the Hyper-V switch, and the
        // button should say so rather than offer to create it again.
        if (createdFirst) setCreating(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const done = outcome?.kind === "done" ? outcome : null;
  const failed = outcome?.kind === "failed" ? outcome : null;

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-muted text-muted-foreground">
            <HardDrive className="h-5 w-5" />
          </div>
          <DialogTitle>{creating ? t("default.dialog.createTitle") : t("default.dialog.hypervTitle")}</DialogTitle>
          <DialogDescription>
            {creating
              ? t("default.dialog.createDescription")
              : t("default.dialog.hypervDescription", { name: (done?.repository ?? repository)?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <DefaultRepositoryDetails repository={done.repository} created={done.created} />
        ) : (
          <label
            htmlFor="default-repo-hyperv"
            className="flex cursor-pointer items-start justify-between gap-3 border border-border p-3"
          >
            <span className="space-y-1">
              <span className="block text-sm font-medium">{t("default.dialog.hypervLabel")}</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {t("default.dialog.hypervHint")}
              </span>
            </span>
            <Switch
              id="default-repo-hyperv"
              checked={hyperV}
              onCheckedChange={(v) => {
                setHyperV(v);
                if (!failed?.createdFirst) setOutcome(null);
              }}
              disabled={busy}
            />
          </label>
        )}

        {failed && (
          <div className="flex items-start gap-2.5 border border-danger/30 bg-danger-subtle px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="space-y-1 text-xs text-danger">
              {failed.createdFirst && <p className="font-medium">{t("default.dialog.createdButShare")}</p>}
              <p className="break-words">{failed.message}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>{t("common:actions.done")}</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                {t("common:actions.cancel")}
              </Button>
              <Button disabled={busy || unchanged} onClick={() => void submit()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy
                  ? creating
                    ? t("default.dialog.creating")
                    : t("default.dialog.saving")
                  : creating
                    ? t("default.create")
                    : t("common:actions.save")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the appliance set up: the folder, the Hyper-V state and, when on, the
 *  share and its account. Never a password — the appliance does not send it. */
function DefaultRepositoryDetails({ repository, created }: { repository: Repository; created: boolean }) {
  const { t } = useTranslation("repositories");
  return (
    <div className="space-y-2 border border-border p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-success">
        <CheckCircle2 className="h-4 w-4" />
        {created ? t("default.dialog.created") : t("default.dialog.saved")}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t("default.dialog.path")}</dt>
        <dd>
          <code className="nums break-all">{repository.path}</code>
        </dd>
        <dt className="text-muted-foreground">{t("default.dialog.hypervLabel")}</dt>
        <dd>{repository.supportsHyperV ? t("default.on") : t("default.off")}</dd>
        {repository.supportsHyperV && repository.share && (
          <>
            <dt className="text-muted-foreground">{t("default.dialog.share")}</dt>
            <dd>
              <code className="nums break-all">{formatUnc(repository.share)}</code>
            </dd>
            {repository.share.username && (
              <>
                <dt className="text-muted-foreground">{t("default.dialog.accountLabel")}</dt>
                <dd>
                  <code className="nums">{repository.share.username}</code>
                </dd>
              </>
            )}
          </>
        )}
      </dl>
      {repository.supportsHyperV && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t("default.dialog.passwordNote")}</p>
      )}
    </div>
  );
}
