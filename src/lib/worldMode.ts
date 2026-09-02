// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Shared world-mode switch with user feedback — used by the command palette
 * and the account menu so both entry points behave identically.
 */
import { toast } from "@/components/ui/sonner";
import { isVersionMismatchError } from "@/services/api.http";
import { setWorldMode, useWorldStore } from "@/store/world";

export async function switchWorldMode(): Promise<void> {
  const next = useWorldStore.getState().mode === "sim" ? "live" : "sim";
  try {
    await setWorldMode(next);
    toast.success(
      next === "live" ? "Connected to the live appliance" : "Switched to the demo simulation",
      {
        description:
          next === "live"
            ? "You're looking at the real backend now."
            : "Self-contained demo data — the appliance is untouched.",
      },
    );
  } catch (err) {
    // A version mismatch already gets a specific, standing banner (see
    // Providers.tsx via world.apiVersionError) — a generic "unreachable"
    // toast on top of it would just contradict that message.
    if (isVersionMismatchError(err)) return;
    toast.error("Couldn't reach the appliance", {
      description: "Is the backend (server/) running on :4980?",
    });
  }
}
