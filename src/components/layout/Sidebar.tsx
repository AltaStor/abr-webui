// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronsLeft } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Hint } from "@/components/ui/tooltip";
import { WipBadge } from "@/components/WorkInProgress";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "@/app/nav";
import { useUiStore } from "@/store/ui";

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { t } = useTranslation("nav");
  const active = item.match ? item.match(pathname) : pathname === item.href;
  const Icon = item.icon;
  const label = t(item.labelKey);
  const link = (
    <Link
      to={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-primary-foreground" : "text-muted-foreground/80 group-hover:text-foreground",
          item.wip && !active && "opacity-60",
        )}
      />
      {!collapsed && (
        <span className={cn("flex flex-1 items-center gap-2", item.wip && !active && "opacity-70")}>
          {label}
          {item.wip && <WipBadge className="ml-auto" />}
        </span>
      )}
    </Link>
  );
  return collapsed ? (
    <Hint label={label} side="right">
      {link}
    </Hint>
  ) : (
    link
  );
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation("nav");
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
        <Link to="/" onClick={onNavigate} aria-label={t("home")}>
          {collapsed ? <LogoMark className="h-7 w-7" /> : <Logo />}
        </Link>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        <div className={cn("mb-1 mt-5 px-3", collapsed && "px-0 text-center")}>
          {!collapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{t("manage")}</span>
          )}
        </div>
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

export function DesktopSidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const { t } = useTranslation("nav");
  return (
    <aside
      className={cn(
        "relative hidden shrink-0 border-r border-border/70 bg-card/40 transition-[width] duration-200 lg:flex lg:flex-col",
        sidebarCollapsed ? "w-[68px]" : "w-64",
      )}
    >
      <SidebarNav collapsed={sidebarCollapsed} />
      <button
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
        className="tap-target !absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
      >
        <ChevronsLeft className={cn("h-3.5 w-3.5 transition-transform", sidebarCollapsed && "rotate-180")} />
      </button>
    </aside>
  );
}
