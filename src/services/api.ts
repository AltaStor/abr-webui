// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Query-layer API over the world store.
 *
 * In live mode the dashboard summary comes from the appliance (the server
 * computes it as the source of truth); everything else reads the store, which
 * the live driver keeps fresh over SSE — so list "endpoints" stay instant.
 * In sim mode all of it is computed locally, with a small latency shim so
 * loading states stay honest in demos.
 */
import { useWorldStore } from "@/store/world";
import { computeDashboardSummary } from "@/store/selectors";
import type {
  Alert,
  BackupJob,
  DashboardSummary,
  Environment,
  Host,
  Repository,
  RestorePoint,
  Session,
  Threat,
  VM,
} from "@/types";

const delay = (min = 200, max = 650) =>
  new Promise<void>((r) => setTimeout(r, min + Math.random() * (max - min)));

const world = () => useWorldStore.getState();

/**
 * Wait for the world's first load so early queries don't compute against an
 * empty store. Resolves immediately once ready; gives up after 5 s (a hung
 * hydrate then falls through to whatever state exists).
 */
function whenReady(): Promise<void> {
  if (world().ready) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsub();
      resolve();
    }, 5000);
    const unsub = useWorldStore.subscribe((s) => {
      if (s.ready) {
        clearTimeout(timeout);
        unsub();
        resolve();
      }
    });
  });
}

export async function getDashboard(): Promise<DashboardSummary> {
  await whenReady();
  const s = world();
  // Both worlds compute the rich summary from the hydrated store. In live mode
  // the store now holds real vCenter data, so the same selector that powered
  // the sim dashboard produces an honest, orchestrator-backed summary — far
  // richer than the backend's thin /dashboard/summary. (getDashboardHttp stays
  // available for callers that want the raw server figure.)
  if (s.mode === "sim") await delay();
  return computeDashboardSummary(s);
}

export async function listJobs(): Promise<BackupJob[]> {
  await delay();
  return world().jobs;
}

export async function getJob(id: string): Promise<BackupJob | undefined> {
  await delay(150, 400);
  return world().jobs.find((j) => j.id === id);
}

export async function listSessions(): Promise<Session[]> {
  await delay();
  return world().sessions;
}

export async function getJobSessions(jobId: string): Promise<Session[]> {
  await delay(150, 450);
  return world().sessions.filter((s) => s.jobId === jobId);
}

export async function listVms(): Promise<VM[]> {
  await delay();
  return world().vms;
}

export async function getVM(id: string): Promise<VM | undefined> {
  await delay(150, 400);
  return world().vms.find((v) => v.id === id);
}

export async function listRestorePoints(vmId?: string): Promise<RestorePoint[]> {
  await delay();
  const all = world().restorePoints;
  return vmId ? all.filter((rp) => rp.vmId === vmId) : all;
}

export async function listRepositories(): Promise<Repository[]> {
  await delay();
  return world().repositories;
}

export async function listEnvironments(): Promise<Environment[]> {
  await delay(120, 350);
  return world().environments;
}

export async function listHosts(): Promise<Host[]> {
  await delay(120, 350);
  return world().hosts;
}

export async function listThreats(): Promise<Threat[]> {
  await delay(150, 400);
  return world().threats;
}

export async function listAlerts(): Promise<Alert[]> {
  await delay(120, 350);
  return world().alerts;
}
