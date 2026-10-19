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
  /** Shown only when the signed-in role allows one of these function IDs;
   *  always shown without. */
  functions?: string[];
}

export const PRIMARY_NAV: NavItem[] = [
  { labelKey: "dashboard", href: "/", icon: LayoutDashboard, match: (p) => p === "/" },
  // The schedules that produce backups, and the restore points they've
  // produced so far — both live under this one entry now, as tabs.
  {
    labelKey: "backups",
    href: "/jobs",
    icon: DatabaseBackup,
    match: (p) => p.startsWith("/jobs"),
    functions: ["job.view", "backup.view"],
  },
  {
    labelKey: "activity",
    href: "/activity",
    icon: Activity,
    match: (p) => p.startsWith("/activity"),
    functions: ["session.view"],
  },
  {
    labelKey: "restore",
    href: "/restore",
    icon: RotateCcw,
    match: (p) => p.startsWith("/restore"),
    functions: ["restore.view"],
  },
];

// Infrastructure's topology tree now lives as a tab on Inventory (`/inventory?tab=topology`)
// rather than its own sidebar entry.
export const SECONDARY_NAV: NavItem[] = [
  {
    labelKey: "inventory",
    href: "/inventory",
    icon: Server,
    match: (p) => p.startsWith("/inventory"),
    functions: ["inventory.view"],
  },
  {
    labelKey: "repositories",
    href: "/repositories",
    icon: HardDrive,
    match: (p) => p.startsWith("/repositories"),
    functions: ["repository.view"],
  },
  {
    labelKey: "logs",
    href: "/logs",
    icon: Terminal,
    match: (p) => p.startsWith("/logs"),
    functions: ["system.logs", "audit.view"],
  },
];

/** The function IDs a route needs one of, for the pages behind the sidebar.
 *  A deep link to a page the role does not allow lands on an explanation
 *  rather than a page of refusals. */
export function navItemFor(path: string): NavItem | undefined {
  return [...PRIMARY_NAV, ...SECONDARY_NAV].find((item) => item.functions && item.match?.(path));
}
