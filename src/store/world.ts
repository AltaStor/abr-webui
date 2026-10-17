// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The world store — one zustand store, two swappable drivers:
 *
 *  - "live" (default): the console is a client of the AltaStor appliance
 *    control plane (server/ on :4980) — REST hydration + SSE freshness.
 *  - "sim": the original in-browser demo world (seeded data + 1.2 s tick),
 *    kept for demos and as the automatic fallback when no appliance answers.
 *
 * Mode selection: `?world=sim|live` in the URL (persisted), else
 * localStorage, else "live". A failed first hydrate in live mode falls back
 * to sim for the session without persisting the preference — the next load
 * tries the appliance again.
 */
import { create } from "zustand";
import { toast } from "sonner";
import i18n from "@/i18n";
import { apiErrorMessage, isVersionMismatchError } from "@/services/api.http";
import { createLiveDriver } from "./world.live";
import { createSimDriver } from "./world.sim";
import {
  EMPTY_WORLD,
  retentionRefused,
  type RepositoryWriteResult,
  type WorldDriver,
  type WorldHandle,
  type WorldMode,
  type WorldState,
} from "./world.types";

export type { CreateJobInput, RestoreInput, WorldMode } from "./world.types";

const STORAGE_KEY = "basalt.world-mode";

/** The harmless no-op every repository write resolves with before a driver is
 *  running — same shape as a real rejection, so callers need no special case. */
const NO_WORLD_WRITE: RepositoryWriteResult = {
  ok: false,
  message: "world not started",
  checks: [],
};

function resolveInitialMode(): WorldMode {
  const fromUrl = new URLSearchParams(window.location.search).get("world");
  if (fromUrl === "sim" || fromUrl === "live") {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(STORAGE_KEY) === "sim" ? "sim" : "live";
}

let driver: WorldDriver | null = null;
/** Bumped by every activation; a superseded activate's continuations bail. */
let generation = 0;

export const useWorldStore = create<WorldState>(() => ({
  ...EMPTY_WORLD,
  liveLogs: {},
  revision: 0,
  tickCount: 0,
  mode: "live",
  connected: false,
  ready: false,
  apiVersionError: null,

  /* Mutations delegate to the active driver; before startWorld() they are
   * harmless no-ops so a stray early call can't crash the app. */
  runJob: (jobId, triggeredBy, forceFull) =>
    driver?.actions.runJob(jobId, triggeredBy, forceFull) ?? Promise.resolve(null),
  stopSession: (sessionId) => driver?.actions.stopSession(sessionId) ?? Promise.resolve(false),
  createJob: (input) =>
    driver
      ? driver.actions.createJob(input)
      : Promise.reject(new Error("world not started")),
  updateJob: (jobId, patch) =>
    driver?.actions.updateJob(jobId, patch) ?? Promise.resolve(),
  setJobEnabled: (jobId, enabled) =>
    driver?.actions.setJobEnabled(jobId, enabled) ?? Promise.resolve(),
  deleteJob: (jobId) => driver?.actions.deleteJob(jobId) ?? Promise.resolve(),
  markAllAlertsRead: () => driver?.actions.markAllAlertsRead() ?? Promise.resolve(),
  markAlertRead: (id) => driver?.actions.markAlertRead(id) ?? Promise.resolve(),
  dismissThreat: (id) => driver?.actions.dismissThreat(id) ?? Promise.resolve(),
  createEnvironment: (input) => driver?.actions.createEnvironment(input) ?? Promise.resolve(null),
  editEnvironment: (id, patch) => driver?.actions.editEnvironment(id, patch) ?? Promise.resolve(),
  deleteEnvironment: (id) =>
    driver?.actions.deleteEnvironment(id) ??
    Promise.resolve({ ok: false, reason: "error", message: "world not started" } as const),
  rescanEnvironment: (id) => driver?.actions.rescanEnvironment(id) ?? Promise.resolve(null),
  loadOlderSessions: () => driver?.actions.loadOlderSessions() ?? Promise.resolve(),
  startRestore: (input) =>
    driver?.actions.startRestore(input) ?? Promise.resolve(null),
  getRestorePlacementOptions: (restorePointId) =>
    driver?.actions.getRestorePlacementOptions(restorePointId) ??
    Promise.resolve({
      sourceNics: [],
      sourceDisks: [],
      datastores: [],
      networks: [],
      existingVms: [],
      originalDatastore: null,
      originalHost: null,
      defaultHostId: null,
      defaultDatastoreId: null,
      defaultEnvironmentId: null,
      defaultDatastoreMappings: [],
    }),
  deleteRestorePoint: (id, segmentId, force) =>
    driver?.actions.deleteRestorePoint(id, segmentId, force) ??
    Promise.resolve({ ok: false, reason: "error", message: "world not started" } as const),
  verifyBackups: (chainIds) =>
    driver?.actions.verifyBackups(chainIds) ??
    Promise.resolve({ ok: false, message: "world not started" } as const),
  runSyntheticFull: (input) =>
    driver?.actions.runSyntheticFull(input) ??
    Promise.resolve({ ok: false, message: "world not started" } as const),
  runRetention: (jobId, dryRun) =>
    driver?.actions.runRetention(jobId, dryRun) ?? Promise.resolve(retentionRefused(jobId, dryRun, "world not started")),
  createRepository: (input) =>
    driver?.actions.createRepository(input) ?? Promise.resolve(NO_WORLD_WRITE),
  editRepository: (id, patch) =>
    driver?.actions.editRepository(id, patch) ?? Promise.resolve(NO_WORLD_WRITE),
  deleteRepository: (id) =>
    driver?.actions.deleteRepository(id) ??
    Promise.resolve({ ok: false, reason: "error", message: "world not started" } as const),
  rescanRepository: (id) => driver?.actions.rescanRepository(id) ?? Promise.resolve(),
  setRepositoryMaintenance: (id, maintenance) =>
    driver?.actions.setRepositoryMaintenance(id, maintenance) ?? Promise.resolve(),
  testS3Connection: (config) =>
    driver?.actions.testS3Connection(config) ??
    Promise.resolve({ ok: false, message: "world not started", checks: [] }),
  verifyRepository: (id) =>
    driver?.actions.verifyRepository(id) ??
    Promise.resolve({ ok: false, message: "world not started", checks: [] }),
  verifyRepositoryImmutability: (id) =>
    driver?.actions.verifyRepositoryImmutability(id) ??
    Promise.resolve({ ok: false, message: "world not started", checks: [] }),
  applyRepositoryImmutability: (id) =>
    driver?.actions.applyRepositoryImmutability(id) ??
    Promise.resolve({
      ok: false,
      message: "world not started",
      immutability: { mode: "none" as const, retentionDays: 0 },
      restorePointCount: 0,
      updatedRestorePoints: 0,
      failedRestorePoints: 0,
      actualRetentionDays: [],
    }),
  failoverReplica: (id, input) => driver?.actions.failoverReplica(id, input) ?? Promise.resolve(),
  failbackReplica: (id) => driver?.actions.failbackReplica(id) ?? Promise.resolve(),
  undoFailover: (id) => driver?.actions.undoFailover(id) ?? Promise.resolve(),
}));

const handle: WorldHandle = {
  set: (partial) => useWorldStore.setState(partial),
  get: () => useWorldStore.getState(),
};

async function activate(mode: WorldMode, allowFallback: boolean): Promise<void> {
  const gen = ++generation;
  driver?.stop();
  driver = null;
  useWorldStore.setState({
    ...EMPTY_WORLD,
    liveLogs: {},
    mode,
    connected: false,
    ready: false,
    apiVersionError: null,
  });
  const next = mode === "live" ? createLiveDriver(handle) : createSimDriver(handle);
  driver = next;
  try {
    await next.start();
  } catch (err) {
    // A hung live hydrate can reject long after the user already switched
    // worlds — a stale continuation must not reset the world they're using.
    if (gen !== generation) return;
    if (isVersionMismatchError(err)) {
      // Not a reachability problem — retrying or falling back to the demo
      // world would hide a real console/appliance mismatch behind fake data
      // that looks like it's working. Surface it as a standing condition
      // instead (see the banner in Providers.tsx) and leave the world empty.
      useWorldStore.setState({
        apiVersionError:
          apiErrorMessage(err) ?? "The console and appliance API versions are incompatible.",
      });
      if (allowFallback) return; // boot: best-effort, the banner already reports it
      throw err; // explicit switch: let the caller know it didn't take
    }
    if (mode === "live" && allowFallback) {
      console.warn("[world] appliance unreachable — falling back to demo simulation:", err);
      toast.info(i18n.t("domain:worldMode.unreachable.title"), {
        description: i18n.t("domain:worldMode.unreachable.description"),
        duration: 8000,
      });
      await activate("sim", false);
      return;
    }
    throw err;
  }
}

/** Boot the world (Providers calls this once). Safe to call repeatedly. */
export function startWorld(): void {
  if (driver) return;
  void activate(resolveInitialMode(), true);
}

/**
 * Explicit mode switch (command palette). Persists the preference. Unlike
 * boot, an explicit switch to live REJECTS when the appliance is unreachable
 * (no silent fallback) so the caller can tell the user the truth — a silent
 * fallback here produced a false "Connected" toast over the demo world.
 */
export async function setWorldMode(mode: WorldMode): Promise<void> {
  const s = useWorldStore.getState();
  if (s.mode === mode && s.ready) return;
  localStorage.setItem(STORAGE_KEY, mode);
  try {
    await activate(mode, false);
  } catch (err) {
    // Leave a working world behind — but only if a newer activation hasn't
    // already produced one (ready implies someone else succeeded meanwhile).
    if (!useWorldStore.getState().ready) await activate("sim", false);
    throw err;
  }
}

export function stopWorld(): void {
  driver?.stop();
  driver = null;
}

/**
 * Force an immediate re-hydrate of a live world — called right after a
 * console sign-in/sign-out (see store/auth.ts) so the app isn't left showing
 * the empty/unauthenticated placeholder world (or, on sign-out, the previous
 * user's data) until the live driver's next poll tick. No-op outside live
 * mode — the demo simulation has nothing to re-fetch.
 */
export function refreshWorld(): void {
  if (useWorldStore.getState().mode !== "live") return;
  void activate("live", false).catch(() => {
    /* a real outage here surfaces via `connected`/toasts as usual */
  });
}

/* Back-compat aliases for the pre-driver API. */
export const startSimulation = startWorld;
export const stopSimulation = stopWorld;

/* Dev-only escape hatch for debugging the world from the browser console. */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__world = useWorldStore;
}
