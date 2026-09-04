// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { IconOk, IconProtected } from "@/lib/icons";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { KpiBand } from "@/components/KpiBand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/services/api";
import { qk } from "@/lib/query";
import { useAuthStore } from "@/store/auth";
import { useWorldStore } from "@/store/world";
import { displayFirstName } from "@/features/settings/lib";
import type { ProtectionStatus } from "@/types";
import { rateTone, type Tone } from "@/lib/status";
import { ProtectionDonut } from "./components/ProtectionDonut";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { LiveActivityPanel } from "./components/LiveActivityPanel";
import { StorageCard } from "./components/StorageCard";

/** Time-of-day greeting key in the `dashboard` namespace. */
function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return "greeting.morning";
  if (h < 18) return "greeting.afternoon";
  return "greeting.evening";
}

/**
 * KPI props for a percentage that may be UNKNOWN — either the summary query
 * failed (react-query clears `isLoading` with `data` still undefined, so a
 * `?? 0` default would animate a definite "0%" over a number we never
 * received) or the appliance reports null because it has nothing to measure.
 * Unknown renders as a toneless "—": never a plausible number, never a colour.
 * CountUp needs a numeric input, so the formatter ignores it entirely.
 */
function pctKpi(value: number | null | undefined, tone: Tone) {
  if (typeof value !== "number") return { value: 0, format: () => "—", tone: "muted" as Tone };
  return { value, format: (n: number) => `${Math.round(n)}%`, tone };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  /* Who is actually signed in. AppShell's auth gate guarantees a user here; the
   * name-less fallback covers only the frame between signing out and the
   * redirect, where interpolating an empty name leaves a dangling "Good
   * morning, ". */
  const userName = useAuthStore((s) => s.user?.fullName || s.user?.name);
  const { t } = useTranslation("dashboard");
  const { data, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: qk.dashboard, queryFn: getDashboard });
  const envCount = useWorldStore((s) => s.environments.length);

  // One source of truth for the drill URL: the KPI tiles render it as a real
  // link, the donut segments still navigate imperatively from an SVG path.
  const protectionHref = (status: ProtectionStatus) => `/inventory?protection=${status}`;
  const onProtectionSegment = (status: ProtectionStatus) => navigate(protectionHref(status));

  // Tones are only ever computed from a number we actually have — pctKpi mutes
  // them when the value is missing, so no unknown is ever painted reassuring.

  return (
    <div className="space-y-4">
      <PageHeader
        title={userName ? t(greetingKey(), { name: displayFirstName(userName) }) : t("greeting.plain")}
        description={
          data
            ? t("header.descriptionVmOnly", {
                protected: data.protectedVms,
                total: data.totalVms,
                env: envCount,
                points: data.totalRestorePoints.toLocaleString(),
              })
            : isError
              ? t("header.unavailable")
              : t("header.loading")
        }
      />

      {/* The summary query failed: say so and offer a retry rather than letting
          the tiles below settle on numbers the console never received. */}
      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-danger/30 bg-danger-subtle/50 p-3">
          <div>
            <p className="text-sm font-medium text-danger">{t("error.title")}</p>
            <p className="text-xs text-muted-foreground">{t("error.body")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {t("error.retry")}
          </Button>
        </div>
      )}

      {/* Hero KPI row */}
      <KpiBand className="sm:grid-cols-2 xl:grid-cols-2">
        <KpiCard
          label={t("kpi.coverage.label")}
          {...pctKpi(data?.protectionCoverage, rateTone(data?.protectionCoverage))}
          icon={IconProtected}
          loading={isLoading}
          hint={data ? t("kpi.coverage.hint", { protected: data.protectedVms, total: data.totalVms }) : undefined}
          drillLabel={data ? t("kpi.coverage.drill", { count: data.unprotectedVms }) : undefined}
          to={protectionHref("unprotected")}
        />
        <KpiCard
          label={t("kpi.success.label")}
          {...pctKpi(data?.successRate24h, rateTone(data?.successRate24h))}
          icon={IconOk}
          loading={isLoading}
          hint={data ? t("kpi.success.hint", { runs: data.sessions24h, failed: data.failed24h }) : undefined}
          drillLabel={t("kpi.success.drill")}
          to="/activity"
        />
      </KpiBand>

      {/* Charts row — dropped entirely on error: a skeleton that never resolves
          reads as "still loading" instead of "we could not read this". */}
      {!isError && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {data ? <ActivityTimeline data={data.activityTimeline} /> : <Skeleton className="h-[320px]" />}
          </div>
          <div className="lg:col-span-4">
            {data ? <ProtectionDonut summary={data} onSegment={onProtectionSegment} /> : <Skeleton className="h-[320px]" />}
          </div>
        </div>
      )}

      {/* Live + storage row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <LiveActivityPanel />
        </div>
        <div className="lg:col-span-4">
          {data ? <StorageCard summary={data} /> : isError ? null : <Skeleton className="h-64" />}
        </div>
      </div>
    </div>
  );
}
