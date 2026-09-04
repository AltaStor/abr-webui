// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useState } from "react";
import { toast } from "@/components/ui/sonner";
import i18n from "@/i18n";
import { useWorldStore } from "@/store/world";
import type { Repository } from "@/types";

type DialogKind = "edit" | "delete";

interface DialogState {
  kind: DialogKind;
  repoId: string;
}

/**
 * Centralises the transient management state for repositories: which management
 * dialog is open. Rescan is a real mutation — it calls the world store, which
 * drives `integrityStatus` (→ "scanning" then settles) — so this hook derives
 * that flag from the store rather than tracking an optimistic override.
 */
export function useRepositoryManagement() {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const rescanRepository = useWorldStore((s) => s.rescanRepository);

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

  /** A scan is in flight when the store has flipped integrity to "scanning". */
  const isScanning = useCallback((repo: Repository) => repo.integrityStatus === "scanning", []);

  return {
    dialog,
    openEdit,
    openDelete,
    closeDialog,
    rescan,
    isScanning,
  };
}
