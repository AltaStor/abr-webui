// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import {
  Activity,
  DatabaseBackup,
  HardDrive,
  LayoutDashboard,
  RotateCcw,
  Server,
  Terminal,
  type LucideIcon,
} from "@/lib/icons";

export interface NavItem {
  /** i18next key in the `nav` namespace (resolved at render). */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Match nested routes for active state. */
  match?: (path: string) => boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { labelKey: "dashboard", href: "/", icon: LayoutDashboard, match: (p) => p === "/" },
  // The schedules that produce backups, and the restore points they've
  // produced so far — both live under this one entry now, as tabs.
  { labelKey: "backups", href: "/jobs", icon: DatabaseBackup, match: (p) => p.startsWith("/jobs") },
  { labelKey: "activity", href: "/activity", icon: Activity, match: (p) => p.startsWith("/activity") },
  { labelKey: "restore", href: "/restore", icon: RotateCcw, match: (p) => p.startsWith("/restore") },
];

// Infrastructure's topology tree now lives as a tab on Inventory (`/inventory?tab=topology`)
// rather than its own sidebar entry.
export const SECONDARY_NAV: NavItem[] = [
  { labelKey: "inventory", href: "/inventory", icon: Server, match: (p) => p.startsWith("/inventory") },
  { labelKey: "repositories", href: "/repositories", icon: HardDrive, match: (p) => p.startsWith("/repositories") },
  { labelKey: "logs", href: "/logs", icon: Terminal, match: (p) => p.startsWith("/logs") },
];
