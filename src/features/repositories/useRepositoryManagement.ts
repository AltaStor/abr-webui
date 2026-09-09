// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useState } from "react";
import { toast } from "@/components/ui/sonner";
import i18n from "@/i18n";
import { useWorldStore } from "@/store/world";
import type { Repository, RepositoryValidationResult } from "@/types";

type DialogKind = "edit" | "delete";

interface DialogState {
  kind: DialogKind;
  repoId: string;
}

/**
 * Centralises the transient management state for repositories: which management
 * dialog is open, and the last validation verdict per repository. Rescan is a
 * real mutation — it calls the world store, which drives `integrityStatus`
 * (→ "scanning" then settles) — so this hook derives that flag from the store
 * rather than tracking an optimistic override.
 *
 * Validation results live HERE rather than inside the detail dialog because the
 * dialog is unmounted whenever it is closed: an operator who runs a verify,
 * closes the panel and reopens it would otherwise be shown nothing, as if the
 * check had never run.
 */
export function useRepositoryManagement() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [verifying, setVerifying] = useState<Set<string>>(() => new Set());
  const [verifications, setVerifications] = useState<Record<string, RepositoryValidationResult>>({});

  const rescanRepository = useWorldStore((s) => s.rescanRepository);
  const verifyRepository = useWorldStore((s) => s.verifyRepository);

  // Defer opening to the next tick so a triggering DropdownMenu finishes closing
  // and returns focus before the Dialog's focus trap engages (avoids a focus race).
  const openAfterMenu = useCallback((next: DialogState) => {
    setTimeout(() => setDialog(next), 0);
  }, []);

  const openEdit = useCallback(
    (repo: Repository) => openAfterMenu({ kind: "edit", repoId: repo.id }),
    [openAfterMenu],
  );
  const openDelete = useCallback(
    (repo: Repository) => openAfterMenu({ kind: "delete", repoId: repo.id }),
    [openAfterMenu],
  );
  const closeDialog = useCallback(() => setDialog(null), []);

  const rescan = useCallback(
    (repo: Repository) => {
      toast.info(i18n.t("repositories:toast.rescanStarted.title"), {
        description: i18n.t("repositories:toast.rescanStarted.description", { name: repo.name }),
      });
      void rescanRepository(repo.id).catch(() => {
        toast.error(i18n.t("repositories:toast.rescanFailed.title"), {
          description: i18n.t("repositories:toast.rescanFailed.description", { name: repo.name }),
        });
      });
    },
    [rescanRepository],
  );

  /**
   * Full repository validation — `POST /repositories/{id}/verify`: reachable,
   * Object Lock still as configured, and the backups it holds still consistent.
   *
   * A different question from `rescan`, which re-reads the catalog to find what
   * is stored. This one checks that what is stored is still sound, and it is the
   * only action that answers "is this repository actually correctly configured".
   */
  const verify = useCallback(
    async (repo: Repository) => {
      setVerifying((prev) => new Set(prev).add(repo.id));
      try {
        const result = await verifyRepository(repo.id);
        setVerifications((prev) => ({ ...prev, [repo.id]: result }));
        if (result.ok) {
          toast.success(i18n.t("repositories:toast.verifyOk.title", { name: repo.name }), {
            description: result.message,
          });
        } else {
          toast.error(i18n.t("repositories:toast.verifyFailed.title", { name: repo.name }), {
            description: result.message,
          });
        }
      } finally {
        setVerifying((prev) => {
          const next = new Set(prev);
          next.delete(repo.id);
          return next;
        });
      }
    },
    [verifyRepository],
  );

  /** A scan is in flight when the store has flipped integrity to "scanning". */
  const isScanning = useCallback((repo: Repository) => repo.integrityStatus === "scanning", []);
  const isVerifying = useCallback((repo: Repository) => verifying.has(repo.id), [verifying]);
  const verificationFor = useCallback(
    (repo: Repository): RepositoryValidationResult | null => verifications[repo.id] ?? null,
    [verifications],
  );

  return {
    dialog,
    openEdit,
    openDelete,
    closeDialog,
    rescan,
    verify,
    isScanning,
    isVerifying,
    verificationFor,
  };
}
