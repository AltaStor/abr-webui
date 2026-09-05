// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { CircleDot, Moon, Power, type LucideIcon } from "@/lib/icons";
import type { OsFamily, PowerState } from "@/types";
import type { Tone } from "@/lib/status";
import i18n from "@/i18n";

/** Visual metadata for a VM power state — dot color + label + icon. `label` is
 * a getter so it resolves through i18next at access time (see @/lib/status). */
export const POWER_META: Record<
  PowerState,
  { label: string; tone: Tone; dot: string; icon: LucideIcon }
> = {
  running: { get label() { return i18n.t("inventory:power.running"); }, tone: "success", dot: "bg-success", icon: CircleDot },
  stopped: { get label() { return i18n.t("inventory:power.stopped"); }, tone: "muted", dot: "bg-muted-foreground/50", icon: Power },
  suspended: { get label() { return i18n.t("inventory:power.suspended"); }, tone: "warning", dot: "bg-warning", icon: Moon },
};

/** Short OS-family label. "unknown" covers a guest whose OS we can't read yet
 * (e.g. a Hyper-V VM that's been powered off since discovery). */
export function osFamilyLabel(family: OsFamily): string {
  if (family === "windows") return i18n.t("inventory:os.windows");
  if (family === "linux") return i18n.t("inventory:os.linux");
  if (family === "macos") return i18n.t("inventory:os.macos");
  return i18n.t("common:generic.unknown");
}
