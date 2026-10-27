// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { DatabaseBackup, MoreHorizontal, Pencil, Play, Power, Trash2, XCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BackupJob } from "@/types";

/** Each action is offered only when its handler is given: the caller leaves
 *  out what the signed-in role does not allow. */
interface JobActionsMenuProps {
  job: BackupJob;
  onRun?: () => void;
  onRunFull?: () => void;
  /** Stop the job's in-flight run. Absent when it has none — the item is then
   *  not offered at all rather than offered disabled, since a job that isn't
   *  running has nothing for it to act on. */
  onStopRun?: () => void;
  onEdit?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onDelete?: () => void;
  /** The job has a run in flight: Delete is shown but disabled, saying why. */
  deleteBlocked?: boolean;
}

/** Per-row actions. Clicks stop propagation so the row's navigation doesn't fire. */
export function JobActionsMenu({
  job,
  onRun,
  onRunFull,
  onStopRun,
  onEdit,
  onToggleEnabled,
  onDelete,
  deleteBlocked = false,
}: JobActionsMenuProps) {
  const { t } = useTranslation("jobs");
  const disabled = job.state === "disabled";
  const running = job.state === "running";
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();
  const runFull = job.type === "backup" ? onRunFull : undefined;

  if (!onRun && !runFull && !onStopRun && !onEdit && !onToggleEnabled && !onDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={stop}>
        <Button variant="ghost" size="icon-sm" aria-label={t("actions.actionsFor", { name: job.name })}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={stop}>
        {onRun && (
          <DropdownMenuItem
            disabled={running || disabled}
            onSelect={(e) => {
              e.preventDefault();
              onRun();
            }}
          >
            <Play className="h-4 w-4" />
            {t("actions.runNow")}
          </DropdownMenuItem>
        )}
        {runFull && (
          <DropdownMenuItem
            disabled={running || disabled}
            onSelect={(e) => {
              e.preventDefault();
              runFull();
            }}
          >
            <DatabaseBackup className="h-4 w-4" />
            {t("actions.runFull")}
          </DropdownMenuItem>
        )}
        {onStopRun && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onStopRun();
            }}
          >
            <XCircle className="h-4 w-4" />
            {t("common:cancelRun.action")}
          </DropdownMenuItem>
        )}
        {onEdit && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onEdit();
            }}
          >
            <Pencil className="h-4 w-4" />
            {t("common:actions.edit")}
          </DropdownMenuItem>
        )}
        {onToggleEnabled && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onToggleEnabled(disabled);
            }}
          >
            {/* Power, not Play/Pause: transport belongs to "Run now" / "Stop run"
                above, and this menu used to draw Play for both of them. */}
            <Power className="h-4 w-4" />
            {disabled ? t("common:actions.enable") : t("common:actions.disable")}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              disabled={deleteBlocked}
              onSelect={(e) => {
                e.preventDefault();
                if (!deleteBlocked) onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span className="flex flex-col">
                {t("common:actions.delete")}
                {deleteBlocked && (
                  <span className="text-[11px] font-normal text-muted-foreground">{t("delete.blockedShort")}</span>
                )}
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
