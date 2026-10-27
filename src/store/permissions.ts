// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * What the signed-in user's role allows — the function IDs the appliance
 * reports at sign-in and from `GET /auth/me` ("job.start", "backup.delete").
 *
 * The console only uses this to show what the user can do: actions their role
 * does not allow are hidden or disabled, and reads it does not allow are never
 * requested. The appliance authorizes every request itself, so nothing here is
 * a security boundary — a stale set can only make a button the appliance then
 * refuses.
 *
 * Deliberately imports no other store: the auth store writes it on sign-in and
 * out, and the live world driver refreshes it before each hydrate.
 */
import { create } from "zustand";

/** "all" for the demo world and for an appliance that predates roles, where
 *  every function is allowed. */
export type Grants = ReadonlySet<string> | "all";

export interface RoleRef {
  id: string;
  name: string;
}

interface PermissionsState {
  role: RoleRef | null;
  grants: Grants;
  setGrants: (permissions: readonly string[] | null, role?: RoleRef | null) => void;
  clear: () => void;
}

export const ALL_GRANTS: Grants = "all";

/** Readable names for the built-in roles, for when only the ID is known (the
 *  sign-in answer carries the ID; `/auth/me` adds the name, a custom role's
 *  too). */
export const ROLE_NAMES: Record<string, string> = {
  administrator: "Administrator",
  backup_administrator: "Backup Administrator",
  backup_operator: "Backup Operator",
  restore_operator: "Restore Operator",
  auditor: "Auditor",
};

export function roleRef(id: string | null | undefined): RoleRef | null {
  return id ? { id, name: ROLE_NAMES[id] ?? id } : null;
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  role: null,
  grants: ALL_GRANTS,
  setGrants: (permissions, role) =>
    set((s) => {
      const grants: Grants = permissions ? new Set(permissions) : ALL_GRANTS;
      const nextRole = role === undefined ? s.role : role;
      // Refreshed before every hydrate: only a real change notifies anyone. A
      // custom role can be renamed under the same ID, so the name counts too.
      if (sameGrants(s.grants, grants) && s.role?.id === nextRole?.id && s.role?.name === nextRole?.name) return s;
      return { grants, role: nextRole };
    }),
  clear: () => set({ grants: new Set<string>(), role: null }),
}));

function sameGrants(a: Grants, b: Grants): boolean {
  if (a === "all" || b === "all") return a === b;
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function allows(grants: Grants, functionId: string): boolean {
  return grants === "all" || grants.has(functionId);
}

/** Outside React (the world driver, event handlers). */
export function can(functionId: string): boolean {
  return allows(usePermissionsStore.getState().grants, functionId);
}

/** Whether the signed-in user's role allows `functionId`; re-renders when the
 *  grants change. */
export function useCan(functionId: string): boolean {
  return usePermissionsStore((s) => allows(s.grants, functionId));
}

/** Whether the role allows any of `functionIds`. */
export function useCanAny(...functionIds: string[]): boolean {
  return usePermissionsStore((s) => functionIds.some((id) => allows(s.grants, id)));
}

/** What the signed-in user's role allows, for comparing with another role. */
export function useGrants(): Grants {
  return usePermissionsStore((s) => s.grants);
}

/** Those of `functionIds` that `grants` does not allow. The appliance refuses
 *  to let anyone grant, assign or take over more than their own role allows;
 *  the console uses this to say so before it asks. */
export function beyondGrants(grants: Grants, functionIds: readonly string[]): string[] {
  return grants === "all" ? [] : functionIds.filter((id) => !grants.has(id));
}
