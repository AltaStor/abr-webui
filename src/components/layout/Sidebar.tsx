// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronsLeft } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { Hint } from "@/components/ui/tooltip";
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
        // Quiet-to-ink with an accent rule, not a filled slab — the solid
        // accent stays the mark of a primary action. The transparent rule on
        // the rest state reserves the 2px so nothing shifts on activation.
        "group flex items-center gap-3 border-l-2 px-3 py-2 font-display text-sm font-medium transition-colors duration-250",
        active
          ? "border-primary bg-accent/40 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent/25 hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-250",
          active ? "text-foreground" : "text-muted-foreground/80 group-hover:text-foreground",
        )}
      />
      {!collapsed && <span className="flex flex-1 items-center gap-2">{label}</span>}
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
      {/* Same 68px as the top bar, with the same bottom hairline, so the rule
          runs unbroken from the rail across the header. */}
      <div className={cn("flex h-[68px] items-center border-b border-border px-4", collapsed && "justify-center px-0")}>
        <Link to="/" onClick={onNavigate} aria-label={t("home")}>
          <Logo collapsed={collapsed} className={collapsed ? "h-8 w-8" : undefined} />
        </Link>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        <div className={cn("mb-1 mt-5 px-3", collapsed && "px-0 text-center")}>
          {!collapsed && (
            <span className="label-overline">{t("manage")}</span>
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
        "relative hidden shrink-0 border-r border-border bg-card transition-[width] duration-250 lg:flex lg:flex-col",
        sidebarCollapsed ? "w-[68px]" : "w-64",
      )}
    >
      <SidebarNav collapsed={sidebarCollapsed} />
      <button
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
        className="tap-target !absolute -right-3 top-[86px] z-10 flex h-6 w-6 items-center justify-center border border-border bg-card text-muted-foreground transition-colors duration-250 hover:text-foreground"
      >
        <ChevronsLeft className={cn("h-3.5 w-3.5 transition-transform duration-300", sidebarCollapsed && "rotate-180")} />
      </button>
    </aside>
  );
}
