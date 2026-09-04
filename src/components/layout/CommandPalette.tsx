// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Command } from "cmdk";
import {
  Activity,
  DatabaseBackup,
  Globe,
  HardDrive,
  LayoutDashboard,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Search,
  Server,
  Settings,
  Sun,
  Terminal,
} from "@/lib/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/StatusPill";
import { SESSION_META } from "@/lib/status";
import { useUiStore } from "@/store/ui";
import { useWorldStore } from "@/store/world";
import { useSettingsStore } from "@/store/settings";
import { switchWorldMode } from "@/lib/worldMode";
import { toast } from "@/components/ui/sonner";
import { LANGUAGES } from "@/i18n/languages";
import type { Language } from "@/types";

export function CommandPalette() {
  const navigate = useNavigate();
  const { t } = useTranslation("layout");
  const { commandOpen, setCommandOpen, toggleTheme, theme } = useUiStore();
  const jobs = useWorldStore((s) => s.jobs);
  const vms = useWorldStore((s) => s.vms);
  const runJob = useWorldStore((s) => s.runJob);
  const mode = useWorldStore((s) => s.mode);
  const currentLanguage = useSettingsStore((s) => s.appearance.language);
  const setLanguage = useSettingsStore((s) => s.updateAppearance);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(!commandOpen);
        return;
      }
      // Bare "N"/"/" shortcuts, but never while typing in a field or with the
      // palette / a modifier engaged.
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // "/" opens the palette — a Ctrl/Cmd+K fallback. Chrome and Edge reserve
      // Ctrl+K on Windows/Linux for their own address-bar search and don't let
      // page JS override it (preventDefault has no effect), so it silently
      // never reaches this handler in those browsers; "/" isn't reserved and
      // is the same fallback GitHub/Notion/etc. ship for this exact conflict.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !commandOpen && !typing) {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey && !commandOpen && !typing) {
        e.preventDefault();
        navigate("/jobs/new/backup");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen, navigate]);

  const go = (path: string) => {
    setCommandOpen(false);
    navigate(path);
  };

  const onRun = async (jobId: string, name: string) => {
    setCommandOpen(false);
    const id = await runJob(jobId);
    if (id) {
      toast.success(t("cmdPalette.started", { name }), { description: t("cmdPalette.startedDescription") });
      navigate("/activity");
      return;
    }
    // `runJob` only ever answers "a session id, or nothing" — the reason lives
    // in the job's own state, which is exactly how the Jobs page tells the two
    // refusals apart. Anything else (a 404, a dead network) is neither, and
    // saying so is more honest than guessing at one of the two.
    const job = jobs.find((j) => j.id === jobId);
    if (job?.state === "disabled") {
      toast.info(t("cmdPalette.jobDisabled", { name }), { description: t("cmdPalette.jobDisabledDescription") });
    } else if (job?.state === "running") {
      toast.info(t("cmdPalette.alreadyRunning", { name }), {
        description: t("cmdPalette.alreadyRunningDescription"),
      });
    } else {
      toast.error(t("cmdPalette.runRefused", { name }), { description: t("cmdPalette.runRefusedDescription") });
    }
  };

  const onPickLanguage = (code: Language) => {
    setCommandOpen(false);
    setLanguage({ language: code });
  };

  const onSwitchWorld = async () => {
    setCommandOpen(false);
    await switchWorldMode();
  };

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">{t("cmdPalette.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("cmdPalette.description")}</DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder={t("cmdPalette.searchPlaceholder")}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[min(60vh,calc(100dvh-160px))] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">{t("cmdPalette.empty")}</Command.Empty>

            <Command.Group heading={t("cmdPalette.group.navigation")}>
              <Item onSelect={() => go("/")} icon={<LayoutDashboard className="h-4 w-4" />} label={t("nav:dashboard")} />
              <Item value={`${t("nav:backups")} backup jobs schedules restore points`} onSelect={() => go("/jobs")} icon={<DatabaseBackup className="h-4 w-4" />} label={t("nav:backups")} />
              <Item onSelect={() => go("/activity")} icon={<Activity className="h-4 w-4" />} label={t("nav:activity")} />
              <Item onSelect={() => go("/restore")} icon={<RotateCcw className="h-4 w-4" />} label={t("nav:restore")} />
              <Item onSelect={() => go("/inventory")} icon={<Server className="h-4 w-4" />} label={t("nav:inventory")} />
              <Item onSelect={() => go("/repositories")} icon={<HardDrive className="h-4 w-4" />} label={t("nav:repositories")} />
              <Item onSelect={() => go("/logs")} icon={<Terminal className="h-4 w-4" />} label={t("nav:logs")} />
              <Item value={`${t("nav:settings")} settings preferences configuration`} onSelect={() => go("/settings")} icon={<Settings className="h-4 w-4" />} label={t("nav:settings")} />
            </Command.Group>

            <Command.Group heading={t("cmdPalette.group.actions")}>
              <Item onSelect={() => go("/jobs/new/backup")} icon={<Plus className="h-4 w-4" />} label={t("cmdPalette.createJob")} shortcut="N" />
              <Item
                onSelect={() => {
                  setCommandOpen(false);
                  toggleTheme();
                }}
                icon={theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                label={theme === "dark" ? t("cmdPalette.switchToLight") : t("cmdPalette.switchToDark")}
              />
              <Item
                value={`${mode === "sim" ? t("cmdPalette.connectLive") : t("cmdPalette.switchDemo")} world mode demo simulation live appliance`}
                onSelect={() => void onSwitchWorld()}
                icon={mode === "sim" ? <Server className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                label={mode === "sim" ? t("cmdPalette.connectLive") : t("cmdPalette.switchDemo")}
              />
            </Command.Group>

            <Command.Group heading={t("cmdPalette.group.language")}>
              {LANGUAGES.map((l) => (
                <Item
                  key={l.code}
                  value={`language ${l.nativeName} ${l.code}`}
                  onSelect={() => onPickLanguage(l.code)}
                  icon={<Globe className="h-4 w-4" />}
                  label={l.nativeName}
                  trailing={l.code === currentLanguage ? <StatusPill meta={SESSION_META.success} size="sm" /> : undefined}
                />
              ))}
            </Command.Group>

            <Command.Group heading={t("cmdPalette.group.runJob")}>
              {jobs
                .filter((j) => j.state !== "disabled")
                .map((j) => (
                  <Item
                    key={j.id}
                    value={`run ${j.name}`}
                    onSelect={() => onRun(j.id, j.name)}
                    icon={<Play className="h-4 w-4" />}
                    label={t("cmdPalette.runJobLabel", { name: j.name })}
                    trailing={j.state === "running" ? <StatusPill meta={SESSION_META.running} size="sm" /> : undefined}
                  />
                ))}
            </Command.Group>

            <Command.Group heading={t("cmdPalette.group.jumpToVm")}>
              {vms.slice(0, 80).map((vm) => (
                <Item
                  key={vm.id}
                  value={`vm ${vm.name} ${vm.guestOs}`}
                  onSelect={() => go(`/inventory/${vm.id}`)}
                  icon={<Server className="h-4 w-4" />}
                  label={vm.name}
                  trailing={<span className="text-xs text-muted-foreground">{vm.guestOs}</span>}
                />
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Item({
  label,
  icon,
  onSelect,
  shortcut,
  trailing,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
  trailing?: React.ReactNode;
  value?: string;
}) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-foreground outline-none transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate" title={label}>{label}</span>
      {trailing}
      {shortcut && (
        <kbd className="border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
