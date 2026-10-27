// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/** What Settings → Users needs to know about roles, built-in and custom. */
import type { RoleInfo } from "@/services/api.http";
import { ROLE_NAMES } from "@/store/permissions";

const BUILT_IN_ORDER = Object.keys(ROLE_NAMES);

/** The built-in roles in their fixed order, then the custom ones by name —
 *  the order the appliance lists them in, kept if a reply comes back unsorted. */
export function sortRoles(roles: readonly RoleInfo[]): RoleInfo[] {
  const rank = (role: RoleInfo) => {
    const index = BUILT_IN_ORDER.indexOf(role.id);
    return role.builtIn && index >= 0 ? index : BUILT_IN_ORDER.length;
  };
  return [...roles].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function roleName(roles: readonly RoleInfo[] | undefined, id: string | null): string {
  if (!id) return "—";
  return roles?.find((role) => role.id === id)?.name ?? ROLE_NAMES[id] ?? id;
}

/** What a role's name is compared by: any case, spaces, hyphens or
 *  underscores alike, as the appliance compares them. */
export function roleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, "_");
}

/** The first free "<name> (copy)" for a clone, as the appliance would name it. */
export function copyName(source: RoleInfo, roles: readonly RoleInfo[]): string {
  const taken = new Set(roles.flatMap((role) => [roleKey(role.name), roleKey(role.id)]));
  for (let n = 1; n < 1000; n += 1) {
    const name = n === 1 ? `${source.name} (copy)` : `${source.name} (copy ${n})`;
    if (!taken.has(roleKey(name))) return name;
  }
  return `${source.name} (copy)`;
}

/** Product functions grouped by area ("job", "backup"), in catalog order. */
export function byArea<T extends { id: string }>(functions: readonly T[]): [string, T[]][] {
  const grouped = new Map<string, T[]>();
  for (const fn of functions) {
    const area = fn.id.split(".")[0];
    grouped.set(area, [...(grouped.get(area) ?? []), fn]);
  }
  return [...grouped.entries()];
}
