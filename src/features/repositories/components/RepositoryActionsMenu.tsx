// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import {
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Each action is offered only when given: the page leaves out what the
 *  signed-in role does not allow. */
export interface RepositoryActions {
  onEdit?: () => void;
  onRescan?: () => void;
  /** Full repository validation — reachable, Object Lock still as configured,
   *  stored backups still consistent. Distinct from rescan, which only re-reads
   *  the catalog to find what is there. */
  onVerify?: () => void;
  onDelete?: () => void;
}

interface RepositoryActionsMenuProps extends RepositoryActions {
  /** Disables the rescan item while a transient scan is in flight. */
  scanning?: boolean;
  /** Disables the verify item while a validation is in flight. */
  verifying?: boolean;
  /** Visual size of the trigger; card uses the small overlay, dialog uses default. */
  triggerSize?: "sm" | "default";
  repoName: string;
}

/**
 * Reusable kebab menu of repository management actions, shared by the card
 * overlay and the detail dialog. The parent owns the dialogs and toasts and
 * routes each action through the world store.
 */
export function RepositoryActionsMenu({
  onEdit,
  onRescan,
  onVerify,
  onDelete,
  scanning = false,
  verifying = false,
  triggerSize = "default",
  repoName,
}: RepositoryActionsMenuProps) {
  const { t } = useTranslation("repositories");
  if (!onEdit && !onRescan && !onVerify && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={triggerSize === "sm" ? "icon-sm" : "icon"}
          aria-label={t("actions.manage", { name: repoName })}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
        className="min-w-[13rem]"
      >
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="h-4 w-4" />
            {t("actions.editSettings")}
          </DropdownMenuItem>
        )}
        {onRescan && (
          <DropdownMenuItem onSelect={onRescan} disabled={scanning}>
            <RefreshCw className={scanning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {scanning ? t("actions.scanning") : t("actions.rescan")}
          </DropdownMenuItem>
        )}
        {onVerify && (
          <DropdownMenuItem onSelect={onVerify} disabled={verifying}>
            <ShieldCheck className={verifying ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
            {verifying ? t("actions.verifying") : t("actions.verify")}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              {t("actions.delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
