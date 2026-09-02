// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Ephemeral store for the most recent update-check result. Deliberately NOT
 * persisted: an update check is only meaningful against a live appliance, and a
 * result cached across reloads would lie about the current state.
 *
 * Both writers land here — the manual "Check for updates" button (Settings →
 * Updates) and the background auto-poll (useAutoUpdateCheck) — so the version
 * banner can reflect reality instead of hardcoding "Up to date".
 */
import { create } from "zustand";
import type { UpdateCheckResult } from "@/services/api.http";

interface UpdatesStore {
  /** Result of the last successful check, or null if none has run this session. */
  lastResult: UpdateCheckResult | null;
  /** When we recorded that result (mirrors the server's checkedAt). */
  checkedAt: string | null;
  setResult: (result: UpdateCheckResult) => void;
}

export const useUpdatesStore = create<UpdatesStore>((set) => ({
  lastResult: null,
  checkedAt: null,
  setResult: (result) => set({ lastResult: result, checkedAt: result.checkedAt }),
}));
