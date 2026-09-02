// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, Moon, Play, Search, Server, Settings, Sun, User } from "@/lib/icons";
import { cn, isMacPlatform } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarNav } from "./Sidebar";
import { NotificationsBell } from "./NotificationsBell";
import { useUiStore } from "@/store/ui";
import { useWorldStore } from "@/store/world";
import { useAuthStore } from "@/store/auth";
import { switchWorldMode } from "@/lib/worldMode";
import { toast } from "@/components/ui/sonner";

/** "Alex Rivera" → "AR"; "admin" → "AD". Falls back to "?" for an empty name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Topbar() {
  const { t } = useTranslation("layout");
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggleTheme, setCommandOpen } = useUiStore();
  const mode = useWorldStore((s) => s.mode);
  const connected = useWorldStore((s) => s.connected);
  const ready = useWorldStore((s) => s.ready);
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const themeAction = t(theme === "dark" ? "cmdPalette.switchToLight" : "cmdPalette.switchToDark");

  // In live mode this is the signed-in operator; the demo simulation has no
  // real session, so it keeps the illustrative placeholder identity.
  const accountName = mode === "live" && authUser ? authUser.fullName || authUser.name : "Alex Rivera";
  const accountHandle = mode === "live" && authUser ? authUser.name : "admin@corp.local";

  const onSignOut = async () => {
    if (mode !== "live") {
      toast.info(t("topbar.signOutToast"));
      return;
    }
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur-md sm:px-5">
      {/* Mobile menu */}
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("topbar.openMenu")}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Command / search trigger */}
      <button
        onClick={() => setCommandOpen(true)}
        className={cn(
          "group flex h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-border/70 bg-card/50 px-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-card",
          "sm:flex-initial sm:w-72",
        )}
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">
          {t("topbar.search")}
          <span className="hidden sm:inline"> ({isMacPlatform() ? "⌘K" : "Ctrl K"})</span>
        </span>
      </button>

      {/* Which world the console is showing — only surfaced when it isn't the
          connected live appliance, so the default state stays quiet. */}
      {mode === "sim" && ready && (
        <span
          className="hidden items-center gap-1.5 border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex"
          title={t("topbar.demoDataTip")}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
          {t("topbar.demoData")}
        </span>
      )}
      {mode === "live" && ready && !connected && (
        <span
          className="hidden items-center gap-1.5 border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning-text sm:inline-flex"
          title={t("topbar.reconnectingTip")}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" aria-hidden />
          {t("topbar.reconnecting")}
        </span>
      )}

      <div className="flex-1" />

      <Hint label={themeAction}>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={themeAction}>
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </Button>
      </Hint>

      <NotificationsBell />

      {/* Settings lives here rather than in the sidebar — appliance configuration
          is chrome, not a destination alongside the workload sections. */}
      <Hint label={t("topbar.settings")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings")}
          aria-label={t("topbar.settings")}
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={cn(pathname.startsWith("/settings") && "bg-accent text-accent-foreground")}
        >
          <Settings className="h-[18px] w-[18px]" />
        </Button>
      </Hint>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-9 w-9 items-center justify-center bg-gradient-to-br from-primary/80 to-immutable/70 text-sm font-semibold text-primary-foreground ring-offset-background transition-shadow hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t("topbar.accountMenu")}
          >
            {initialsOf(accountName)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="truncate text-sm font-medium text-foreground">{accountName}</span>
              <span className="truncate text-xs text-muted-foreground">{accountHandle}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? t("cmdPalette.switchToLight") : t("cmdPalette.switchToDark")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", mode === "sim" ? "bg-muted-foreground" : "bg-success")}
              aria-hidden
            />
            <span className="text-xs">
              {mode === "sim" ? t("topbar.demoSimulation") : t("topbar.liveAppliance")}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void switchWorldMode()}>
            {mode === "sim" ? <Server className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {mode === "sim" ? t("cmdPalette.connectLive") : t("cmdPalette.switchDemo")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void onSignOut()}>
            <User className="h-4 w-4" />
            {t("topbar.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mobile sidebar drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="left-0 top-0 h-full max-w-[280px] translate-x-0 translate-y-0 rounded-none rounded-r-xl border-l-0 p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:rounded-none sm:rounded-r-xl"
          hideClose
        >
          <DialogTitle className="sr-only">{t("topbar.navigation")}</DialogTitle>
          <DialogDescription className="sr-only">{t("topbar.navigationMenu")}</DialogDescription>
          <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>
    </header>
  );
}
