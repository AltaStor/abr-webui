// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Toaster as Sonner, toast } from "sonner";
import { useUiStore } from "@/store/ui";

export function Toaster() {
  const theme = useUiStore((s) => s.theme);
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          // `` is load-bearing here: sonner sets its own 8px radius,
          // so the square corner has to be stated, not merely left unset.
          toast:
            "group border border-border bg-popover font-sans text-foreground shadow-pop",
          title: "font-display",
          description: "text-muted-foreground",
          // Status rides the glyph — the toast surface stays neutral so the
          // semantic tokens read as status, not as decoration.
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-info",
          // sonner colours its own buttons from a rule more specific than a
          // utility class, so the token has to be marked important to land.
          actionButton: "font-display !bg-primary !text-primary-foreground",
          cancelButton: "font-display !bg-muted !text-muted-foreground",
          closeButton: "!border-border !bg-popover !text-muted-foreground hover:!bg-muted",
        },
      }}
    />
  );
}

export { toast };
