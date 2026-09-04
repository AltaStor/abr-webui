// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { DatabaseBackup, MoreHorizontal, Pencil, Play, Power, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BackupJob } from "@/types";

interface JobActionsMenuProps {
  job: BackupJob;
  onRun: () => void;
  onRunFull: () => void;
  onEdit: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDelete: () => void;
}

/** Per-row actions. Clicks stop propagation so the row's navigation doesn't fire. */
export function JobActionsMenu({ job, onRun, onRunFull, onEdit, onToggleEnabled, onDelete }: JobActionsMenuProps) {
  const { t } = useTranslation("jobs");
  const disabled = job.state === "disabled";
  const running = job.state === "running";
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={stop}>
        <Button variant="ghost" size="icon-sm" aria-label={t("actions.actionsFor", { name: job.name })}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={stop}>
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
        {job.type === "backup" && (
          <DropdownMenuItem
            disabled={running || disabled}
            onSelect={(e) => {
              e.preventDefault();
              onRunFull();
            }}
          >
            <DatabaseBackup className="h-4 w-4" />
            {t("actions.runFull")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onEdit();
          }}
        >
          <Pencil className="h-4 w-4" />
          {t("common:actions.edit")}
        </DropdownMenuItem>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={(e) => {
            e.preventDefault();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
          {t("common:actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
