// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation, Trans } from "react-i18next";
import { AlertTriangle } from "@/lib/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of a single job, or a count summary for bulk. */
  label: string;
  count?: number;
  onConfirm: () => void;
}

/** Confirmation before deleting one or more jobs. Restore points are kept. */
export function DeleteJobDialog({ open, onOpenChange, label, count = 1, onConfirm }: DeleteJobDialogProps) {
  const { t } = useTranslation("jobs");
  const plural = count > 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-danger-subtle text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>
            {plural ? t("delete.titleMany", { count }) : t("delete.titleOne")}
          </DialogTitle>
          <DialogDescription>
            {plural ? (
              <>{t("delete.leadMany", { count })} </>
            ) : (
              <>
                <Trans
                  i18nKey="delete.leadOne"
                  ns="jobs"
                  values={{ name: label }}
                  components={{ 1: <span className="font-medium text-foreground" /> }}
                />{" "}
              </>
            )}
            {t("delete.body")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {plural ? t("delete.confirmMany") : t("delete.confirmOne")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
