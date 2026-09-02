// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Cpu,
  ExternalLink,
  FileText,
  Globe,
  HardDrive,
  Info,
  MemoryStick,
  Server,
  ShieldCheck,
  Terminal,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import type { LucideIcon } from "@/lib/icons";
import i18n from "@/i18n";
import { useSettingsStore } from "@/store/settings";
import { useWorldStore } from "@/store/world";
import { getSystemInfo } from "@/services/api.http";
import type { ApplianceInfo } from "@/services/api.http";
import { SettingsSection } from "../SettingsSection";

const APP_VERSION = "v0.5.0";

/* Everything below the appliance name is reported by `GET /system/info`. There
 * are deliberately no fallback constants: this grid used to fill in a plausible
 * Debian/kernel/CPU/RAM set — and an uptime counting up from a module-load
 * instant — whenever the probe failed, which is indistinguishable from a
 * successful read of hardware nobody has looked at. Unknown renders as UNKNOWN. */
const UNKNOWN = "—";

/* Format a duration in seconds as the appliance's "d/h/m" uptime string. */
function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

const LINKS: { label: string; href: string; blurb: string }[] = [
  { get label() { return i18n.t("settings:about.links.documentation.label"); }, href: "https://docs.altastor.example", get blurb() { return i18n.t("settings:about.links.documentation.blurb"); } },
  { get label() { return i18n.t("settings:about.links.github.label"); }, href: "https://github.com/altastor/altastor", get blurb() { return i18n.t("settings:about.links.github.blurb"); } },
  { get label() { return i18n.t("settings:about.links.community.label"); }, href: "https://community.altastor.example", get blurb() { return i18n.t("settings:about.links.community.blurb"); } },
];

export function AboutSection() {
  const { t } = useTranslation("settings");
  const general = useSettingsStore((s) => s.general);
  const mode = useWorldStore((s) => s.mode);

  // In live mode, source identity/hardware from the real appliance. `info`
  // stays null when the probe fails (or in the demo world, which has no node to
  // probe) and every hardware row reads UNKNOWN; `failed` tells the two apart
  // so the section can say why.
  const [info, setInfo] = useState<ApplianceInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(mode === "live");
  // Bumped by the Retry button to re-run the probe effect.
  const [probeAttempt, setProbeAttempt] = useState(0);
  const retryProbe = () => setProbeAttempt((n) => n + 1);

  useEffect(() => {
    if (mode !== "live") {
      setInfo(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSystemInfo()
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setInfo(null);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, probeAttempt]);

  // While the live fetch is in flight, render a subtle placeholder rather than
  // flashing UNKNOWN for a probe that is about to answer.
  const pending = loading ? "…" : null;
  const identity: { icon: LucideIcon; label: string; value: string; mono?: boolean }[] = [
    // Name and hostname are configuration, not hardware: the appliance's own
    // hostname wins, the configured one stands in, UNKNOWN if neither is set.
    { icon: Server, label: t("about.appliance.applianceName"), value: general.applianceName || UNKNOWN },
    {
      icon: Globe,
      label: t("about.appliance.hostname"),
      value: info?.hostname || general.hostname || UNKNOWN,
      mono: true,
    },
    // The console's own build — real regardless of the probe.
    { icon: Info, label: t("about.appliance.version"), value: pending ?? info?.version ?? APP_VERSION, mono: true },
    // `||`, not `??`: a probe that came back but left this field an empty
    // string is exactly the "unknown" case, same as it being absent.
    { icon: HardDrive, label: t("about.appliance.os"), value: pending ?? (info?.os || UNKNOWN) },
    { icon: Terminal, label: t("about.appliance.kernel"), value: pending ?? (info?.kernel || UNKNOWN), mono: true },
    {
      icon: Info,
      label: t("about.appliance.uptime"),
      value: pending ?? (info ? formatUptime(info.uptimeSec) : UNKNOWN),
      mono: true,
    },
    {
      icon: Cpu,
      label: t("about.appliance.cpu"),
      // A probe that returned but couldn't read the core count is "unknown",
      // not "0 cores" — there is no real host with zero.
      value: pending ?? (info && info.cpuCores > 0 ? `${info.cpuCores} ${t("units.cores")}` : UNKNOWN),
      mono: false,
    },
    {
      icon: MemoryStick,
      label: t("about.appliance.memory"),
      value: pending ?? (info && info.memoryGB > 0 ? `${info.memoryGB} GB` : UNKNOWN),
      mono: true,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Brand lockup */}
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            background:
              "radial-gradient(600px 200px at 15% -20%, hsl(28 74% 56%), transparent), radial-gradient(600px 220px at 90% 120%, hsl(190 72% 47%), transparent)",
          }}
        />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Logo className="scale-125 pl-1" />
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-medium">{t("about.brand.tagline")}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
              <ShieldCheck className="h-3.5 w-3.5 text-immutable" />
              {t("about.brand.openSource")}
            </p>
          </div>
        </div>
      </div>

      {/* Identity grid */}
      <SettingsSection title={t("about.appliance.title")} description={t("about.appliance.description")} icon={Server}>
        <div className="grid gap-x-8 gap-y-1 py-2 sm:grid-cols-2">
          {identity.map(({ icon: Icon, label, value, mono }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                {label}
              </span>
              <span className={mono ? "nums text-sm font-medium" : "text-sm font-medium"}>{value}</span>
            </div>
          ))}
        </div>
        {!loading && !info && (
          <div
            className={
              failed
                ? "mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-[13px] leading-relaxed text-warning-text"
                : "mb-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground"
            }
          >
            {failed ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="flex-1">
              {failed ? t("about.appliance.probeFailed") : t("about.appliance.noAppliance")}
            </span>
            {failed && (
              <Button variant="outline" size="sm" onClick={retryProbe}>
                {t("common:actions.retry")}
              </Button>
            )}
          </div>
        )}
      </SettingsSection>

      {/* License + links */}
      <SettingsSection
        title={t("about.license.title")}
        description={t("about.license.description")}
        icon={FileText}
        flush
      >
        <div className="flex items-center gap-3 border-b border-border/50 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-immutable-subtle text-immutable">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-medium">{t("about.license.openSourceTitle")}</div>
            <p className="text-xs text-muted-foreground">
              {t("about.license.openSourceBlurb")}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border/50">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{link.label}</div>
                  <p className="truncate text-xs text-muted-foreground">{link.blurb}</p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </a>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <div className="flex justify-center pt-1 text-xs text-muted-foreground">
        <Button variant="link" size="sm" asChild>
          <a href="https://github.com/altastor/altastor/releases" target="_blank" rel="noreferrer noopener">
            {t("about.releaseNotes")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}
