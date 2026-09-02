// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RouteError } from "./RouteError";

/** Redirect old standalone /backups bookmarks to the "Backups" tab now living
 *  on the Jobs page. */
function LegacyBackupsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "backups");
  return <Navigate to={`/jobs?${params.toString()}`} replace />;
}

const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const JobsPage = lazy(() => import("@/features/jobs/JobsPage"));
const JobDetailPage = lazy(() => import("@/features/jobs/JobDetailPage"));
const CreateJobPage = lazy(() => import("@/features/jobs/CreateJobPage"));
const ActivityPage = lazy(() => import("@/features/activity/ActivityPage"));
const RestorePage = lazy(() => import("@/features/restore/RestorePage"));
const InventoryPage = lazy(() => import("@/features/inventory/InventoryPage"));
const VmDetailPage = lazy(() => import("@/features/inventory/VmDetailPage"));
const RepositoriesPage = lazy(() => import("@/features/repositories/RepositoriesPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
const SetupPage = lazy(() => import("@/features/setup/SetupPage"));
const LogsPage = lazy(() => import("@/features/logs/LogsPage"));
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const ChangePasswordPage = lazy(() => import("@/features/auth/ChangePasswordPage"));

export const router = createBrowserRouter([
  {
    /* First-boot Initial Configuration wizard — deliberately OUTSIDE the
     * AppShell chrome: an unconfigured appliance has no world to show. */
    path: "/setup",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-background" aria-hidden />}>
        <SetupPage />
      </Suspense>
    ),
    errorElement: <RouteError />,
  },
  {
    /* Sign-in + forced first-login password change — also OUTSIDE AppShell:
     * an unauthenticated session has no world it's allowed to see. AppShell's
     * auth gate sends unauthenticated/must-change-password visitors here. */
    path: "/login",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-background" aria-hidden />}>
        <LoginPage />
      </Suspense>
    ),
    errorElement: <RouteError />,
  },
  {
    path: "/change-password",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-background" aria-hidden />}>
        <ChangePasswordPage />
      </Suspense>
    ),
    errorElement: <RouteError />,
  },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "jobs/new", element: <Navigate to="/jobs/new/backup" replace /> },
      { path: "jobs/new/backup", element: <CreateJobPage kind="backup" /> },
      // Replication has no orchestrator support — the wizard is hidden and the
      // route falls back to the one job kind that is wired up.
      { path: "jobs/new/replication", element: <Navigate to="/jobs/new/backup" replace /> },
      { path: "jobs/:jobId", element: <JobDetailPage /> },
      { path: "jobs/:jobId/edit", element: <CreateJobPage /> },
      // The standalone Backups page is now the "Backups" tab on Jobs.
      { path: "backups", element: <LegacyBackupsRedirect /> },
      { path: "activity", element: <ActivityPage /> },
      { path: "restore", element: <RestorePage /> },
      // Infrastructure's topology tree now lives on Inventory, next to the VM
      // list — keep /infrastructure working as a deep link into it.
      { path: "infrastructure", element: <Navigate to="/inventory" replace /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "inventory/:vmId", element: <VmDetailPage /> },
      { path: "repositories", element: <RepositoriesPage /> },
      // Hidden: no orchestrator backing. Replication (replicas, failover/
      // failback) is unimplemented server-side, so the page is unreachable and
      // stale links land on the dashboard.
      { path: "replication", element: <Navigate to="/" replace /> },
      // Logs & Audit has no audit-trail backing on the orchestrator yet, so it
      // renders from locally-generated data instead of an appliance feed (see
      // its `mock.ts`) — reachable, just not appliance-sourced. Live per-job
      // logs remain on Activity.
      { path: "logs", element: <LogsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/:section", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
], {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
