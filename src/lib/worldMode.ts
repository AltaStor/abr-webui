// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Shared world-mode switch with user feedback — used by the command palette
 * and the account menu so both entry points behave identically.
 */
import { toast } from "@/components/ui/sonner";
import i18n from "@/i18n";
import { isVersionMismatchError } from "@/services/api.http";
import { setWorldMode, useWorldStore } from "@/store/world";

export async function switchWorldMode(): Promise<void> {
  const next = useWorldStore.getState().mode === "sim" ? "live" : "sim";
  try {
    await setWorldMode(next);
    toast.success(
      next === "live" ? i18n.t("domain:worldMode.live.title") : i18n.t("domain:worldMode.sim.title"),
      {
        description:
          next === "live"
            ? i18n.t("domain:worldMode.live.description")
            : i18n.t("domain:worldMode.sim.description"),
      },
    );
  } catch (err) {
    // A version mismatch already gets a specific, standing banner (see
    // Providers.tsx via world.apiVersionError) — a generic "unreachable"
    // toast on top of it would just contradict that message.
    if (isVersionMismatchError(err)) return;
    toast.error(i18n.t("domain:worldMode.error.title"), {
      description: i18n.t("domain:worldMode.error.description"),
    });
  }
}
