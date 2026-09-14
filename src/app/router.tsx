// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Suspense } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RouteError } from "./RouteError";
import { lazyRoute } from "./lazyRoute";
import { FeatureUnavailable } from "@/components/FeatureUnavailable";

/** Redirect old standalone /backups bookmarks to the "Backups" tab now living
 *  on the Jobs page. */
function LegacyBackupsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "backups");
  return <Navigate to={`/jobs?${params.toString()}`} replace />;
}

const DashboardPage = lazyRoute(() => import("@/features/dashboard/DashboardPage"));
const JobsPage = lazyRoute(() => import("@/features/jobs/JobsPage"));
const JobDetailPage = lazyRoute(() => import("@/features/jobs/JobDetailPage"));
const CreateJobPage = lazyRoute(() => import("@/features/jobs/CreateJobPage"));
const ActivityPage = lazyRoute(() => import("@/features/activity/ActivityPage"));
const RestorePage = lazyRoute(() => import("@/features/restore/RestorePage"));
const InventoryPage = lazyRoute(() => import("@/features/inventory/InventoryPage"));
const VmDetailPage = lazyRoute(() => import("@/features/inventory/VmDetailPage"));
const RepositoriesPage = lazyRoute(() => import("@/features/repositories/RepositoriesPage"));
const SettingsPage = lazyRoute(() => import("@/features/settings/SettingsPage"));
const SetupPage = lazyRoute(() => import("@/features/setup/SetupPage"));
const LogsPage = lazyRoute(() => import("@/features/logs/LogsPage"));
const LoginPage = lazyRoute(() => import("@/features/auth/LoginPage"));
const ChangePasswordPage = lazyRoute(() => import("@/features/auth/ChangePasswordPage"));

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
      // Replication has no orchestrator support. The wizard is hidden, and this
      // route says so rather than quietly handing back the backup wizard —
      // someone who asked for a replication job would otherwise fill in a
      // backup job without noticing the substitution.
      {
        path: "jobs/new/replication",
        element: (
          <FeatureUnavailable
            titleKey="featureUnavailable.replication.title"
            descriptionKey="featureUnavailable.replication.description"
          />
        ),
      },
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
      // failback) is unimplemented server-side, so the page is off the nav —
      // but a stale bookmark gets an explanation instead of a silent bounce to
      // the dashboard, which reads as the console losing the page.
      {
        path: "replication",
        element: (
          <FeatureUnavailable
            titleKey="featureUnavailable.replication.title"
            descriptionKey="featureUnavailable.replication.description"
          />
        ),
      },
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
