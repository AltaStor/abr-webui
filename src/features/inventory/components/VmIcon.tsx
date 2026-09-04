// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useTranslation } from "react-i18next";
import { HelpCircle, LinuxLogo, WindowsLogo } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";
import type { VM } from "@/types";
import { POWER_META, osFamilyLabel } from "./vm-presentation";

/**
 * Shared VM glyph — the guest-OS logo (Windows / Linux, or a neutral mark when
 * the guest OS isn't known yet) with a power-state badge in the corner. Used by
 * the inventory table, the restore picker, the job scope picker and the
 * infrastructure tree so a VM looks the same wherever it appears.
 */
export function VmIcon({ vm, className }: { vm: VM; className?: string }) {
  // Subscribe to language changes so the getter-resolved labels re-render.
  useTranslation("inventory");
  const power = POWER_META[vm.powerState];
  const Logo =
    vm.osFamily === "windows" ? WindowsLogo : vm.osFamily === "linux" ? LinuxLogo : HelpCircle;
  return (
    <Hint label={`${osFamilyLabel(vm.osFamily)} · ${power.label}`}>
      <span
        className={cn(
          "relative flex h-7 w-7 shrink-0 items-center justify-center bg-muted/60 text-muted-foreground",
          className,
        )}
        aria-label={`${osFamilyLabel(vm.osFamily)}, ${power.label}`}
      >
        <Logo className="h-3.5 w-3.5" />
        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card", power.dot)} />
      </span>
    </Hint>
  );
}
