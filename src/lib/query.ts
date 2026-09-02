// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const qk = {
  dashboard: ["dashboard"] as const,
  jobs: ["jobs"] as const,
  job: (id: string) => ["job", id] as const,
  sessions: ["sessions"] as const,
  jobSessions: (id: string) => ["job-sessions", id] as const,
  vms: ["vms"] as const,
  vm: (id: string) => ["vm", id] as const,
  restorePoints: (vmId?: string) => ["restore-points", vmId ?? "all"] as const,
  restorePlacement: (pointId: string) => ["restore-placement", pointId] as const,
  repositories: ["repositories"] as const,
  environments: ["environments"] as const,
  hosts: ["hosts"] as const,
  threats: ["threats"] as const,
  alerts: ["alerts"] as const,
};
