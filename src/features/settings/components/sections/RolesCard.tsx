// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Settings -> Users -> Roles & permissions: the built-in roles, the custom
 * roles an Administrator made, and what each allows, function by function.
 *
 * Built-in roles are read-only; any role can be cloned into a custom one, and
 * a custom role can be renamed, given other functions or deleted once nobody
 * holds it. The appliance enforces all of it — including that nobody grants,
 * changes or deletes more than their own role allows, nor their own role —
 * and this card greys out what it would refuse and says why, then shows what
 * it answered when it refuses anyway.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Lock, Minus, Pencil, Plus, Search, ShieldCheck, Trash2 } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { qk } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  apiErrorMessage,
  createRole,
  deleteRole,
  listFunctions,
  listRoles,
  listUsers,
  updateRole,
  type ProductFunction,
  type RoleInfo,
} from "@/services/api.http";
import { beyondGrants, useCan, useGrants, usePermissionsStore } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import { Field } from "../FormField";
import { SettingsSection } from "../SettingsSection";
import { byArea, copyName, roleKey, sortRoles } from "./roles";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 256;

type EditorState = { mode: "create" } | { mode: "clone"; source: RoleInfo } | { mode: "edit"; role: RoleInfo };

/** Why the signed-in user may not change, clone or delete `role`, or null.
 *  Mirrors the appliance's refusals so the button says it before a click. */
function useRoleRefusal() {
  const { t } = useTranslation("settings");
  const grants = useGrants();
  const myRole = usePermissionsStore((s) => s.role);
  return (role: RoleInfo, action: "edit" | "clone" | "delete"): string | null => {
    if (action !== "clone" && role.builtIn) return t("roles.reason.builtIn");
    if (action !== "clone" && role.id === myRole?.id) return t("roles.reason.ownRole");
    if (beyondGrants(grants, role.allowedFunctions).length > 0) {
      return action === "clone" ? t("roles.reason.beyondYoursClone") : t("roles.reason.beyondYours");
    }
    return null;
  };
}

export function RolesCard() {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode) === "live";
  const canCreate = useCan("role.create");
  const canEdit = useCan("role.edit");
  const canDelete = useCan("role.delete");
  const myRole = usePermissionsStore((s) => s.role);
  const refusal = useRoleRefusal();
  const roles = useQuery({ queryKey: qk.roles, queryFn: listRoles, enabled: live });
  const functions = useQuery({ queryKey: qk.functions, queryFn: listFunctions, enabled: live, staleTime: Infinity });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<RoleInfo | null>(null);

  const ordered = useMemo(() => sortRoles(roles.data ?? []), [roles.data]);
  const areas = useMemo(() => byArea(functions.data ?? []), [functions.data]);
  const total = functions.data?.length ?? 0;
  const manages = canCreate || canEdit || canDelete;

  const loaded = live && roles.data !== undefined && functions.data !== undefined;

  return (
    <>
      <SettingsSection
        title={t("roles.title")}
        description={t("roles.description")}
        icon={ShieldCheck}
        flush
        headerAside={
          canCreate && live ? (
            <Button size="sm" onClick={() => setEditor({ mode: "create" })} disabled={!functions.data}>
              <Plus className="h-3.5 w-3.5" />
              {t("roles.add")}
            </Button>
          ) : null
        }
      >
        {!live ? (
          <p className="px-5 py-3.5 text-sm text-muted-foreground">{t("toast.connectLive")}</p>
        ) : roles.isLoading || functions.isLoading ? (
          <p className="flex items-center gap-2 px-5 py-3.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("roles.loading")}
          </p>
        ) : roles.isError || functions.isError ? (
          <p className="flex items-start gap-2 px-5 py-3.5 text-sm text-warning-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {apiErrorMessage(roles.error ?? functions.error) ?? t("roles.loadFailed")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("roles.column.role")}</TableHead>
                <TableHead>{t("roles.column.type")}</TableHead>
                <TableHead className="text-right">{t("roles.column.users")}</TableHead>
                <TableHead className="text-right">{t("roles.column.allowed")}</TableHead>
                {manages && <TableHead className="w-28" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((role) => {
                const editRefusal = refusal(role, "edit");
                const cloneRefusal = refusal(role, "clone");
                const deleteRefusal = refusal(role, "delete");
                return (
                  <TableRow key={role.id}>
                    <TableCell className="max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.id === myRole?.id && <Badge variant="outline">{t("roles.yours")}</Badge>}
                      </div>
                      {role.description && <div className="text-xs text-muted-foreground">{role.description}</div>}
                      {role.clonedFrom && (
                        <div className="text-xs text-muted-foreground/80">
                          {t("roles.clonedFrom", { name: role.clonedFrom.name })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {role.builtIn ? (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          {t("roles.builtIn")}
                        </Badge>
                      ) : (
                        <Badge variant="info">{t("roles.custom")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="nums text-right text-muted-foreground">{role.userCount ?? "—"}</TableCell>
                    <TableCell className="nums text-right text-muted-foreground">
                      {t("roles.allowedCount", { count: role.allowedFunctions.length, total })}
                    </TableCell>
                    {manages && (
                      <TableCell className="whitespace-nowrap text-right">
                        {canCreate && (
                          <RoleAction
                            label={t("roles.cloneRole", { name: role.name })}
                            refusal={cloneRefusal}
                            onClick={() => setEditor({ mode: "clone", source: role })}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </RoleAction>
                        )}
                        {canEdit && !role.builtIn && (
                          <RoleAction
                            label={t("roles.editRole", { name: role.name })}
                            refusal={editRefusal}
                            onClick={() => setEditor({ mode: "edit", role })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </RoleAction>
                        )}
                        {canDelete && !role.builtIn && (
                          <RoleAction
                            label={t("roles.deleteRole", { name: role.name })}
                            refusal={deleteRefusal}
                            destructive
                            onClick={() => setDeleting(role)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </RoleAction>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="border-t border-border/50 px-5 py-3 text-xs text-muted-foreground">{t("roles.builtInNote")}</p>

        <RoleEditorDialog
          state={editor}
          roles={ordered}
          functions={functions.data ?? []}
          onClose={() => setEditor(null)}
        />
        <DeleteRoleDialog role={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
      </SettingsSection>

      {/* Its own card, a gap below the roles: the list says which roles there
          are, this says what each allows. */}
      {loaded && (
        <SettingsSection title={t("roles.matrixTitle")} description={t("roles.matrixDescription")} icon={KeyRound} flush>
          <PermissionMatrix roles={ordered} areas={areas} />
        </SettingsSection>
      )}
    </>
  );
}

/** An icon action that, when the appliance would refuse it, stays visible but
 *  disabled, with the reason as its tooltip. */
function RoleAction({
  label,
  refusal,
  destructive,
  onClick,
  children,
}: {
  label: string;
  refusal: string | null;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    // The wrapper carries the tooltip: a disabled button gets no pointer events.
    <span title={refusal ?? label} className="inline-flex">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        disabled={refusal !== null}
        className={cn(
          "text-muted-foreground/70 hover:text-foreground",
          destructive && "hover:bg-danger/10 hover:text-danger",
        )}
        onClick={onClick}
      >
        {children}
      </Button>
    </span>
  );
}

/**
 * One row per product function, one column per role. It scrolls inside its own
 * viewport with the role names pinned on top and the function names pinned on
 * the left, so a column never loses its heading however far down or across
 * the reader goes.
 */
function PermissionMatrix({ roles, areas }: { roles: RoleInfo[]; areas: [string, ProductFunction[]][] }) {
  const { t } = useTranslation("settings");
  // Opaque grounds and hairlines drawn as inset shadows: a sticky cell's own
  // border scrolls away in a collapsed table, and rows must not show through.
  const pinnedTop = "sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]";
  const pinnedLeft = "sticky left-0 z-10 bg-card shadow-[inset_-1px_0_0_hsl(var(--border))]";
  return (
    <Table
      containerProps={{
        className: "max-h-[min(70vh,640px)]",
        tabIndex: 0,
        role: "region",
        "aria-label": t("roles.matrixTitle"),
      }}
    >
      <TableHeader className="[&_tr]:border-b-0">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(pinnedTop, "left-0 z-30 shadow-[inset_0_-1px_0_hsl(var(--border)),inset_-1px_0_0_hsl(var(--border))]")}>
            {t("roles.column.function")}
          </TableHead>
          {roles.map((role) => (
            <TableHead key={role.id} className={cn(pinnedTop, "min-w-24 text-center")} title={role.description}>
              <span className="block">{role.name}</span>
              {!role.builtIn && (
                <span className="block text-[10px] font-normal normal-case tracking-normal text-info-text">
                  {t("roles.custom")}
                </span>
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {areas.map(([, fns]) =>
          fns.map((fn, index) => (
            <TableRow key={fn.id} className={cn(index === 0 && "border-t-2 border-t-border")}>
              <TableCell className={cn(pinnedLeft, "py-1.5")}>
                <div className="font-mono text-xs">{fn.id}</div>
                <div className="text-xs text-muted-foreground">{fn.name}</div>
              </TableCell>
              {roles.map((role) => {
                const allowed = role.allowedFunctions.includes(fn.id);
                return (
                  <TableCell key={role.id} className="py-1.5 text-center">
                    {allowed ? (
                      <Check className="mx-auto h-4 w-4 text-success" aria-label={t("roles.allowed")} />
                    ) : (
                      <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label={t("roles.disabled")} />
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          )),
        )}
      </TableBody>
    </Table>
  );
}

/* --------------------------------------------------------------- editor -- */

function RoleEditorDialog({
  state,
  roles,
  functions,
  onClose,
}: {
  state: EditorState | null;
  roles: RoleInfo[];
  functions: ProductFunction[];
  onClose: () => void;
}) {
  const key = state ? (state.mode === "create" ? "create" : `${state.mode}:${state.mode === "clone" ? state.source.id : state.role.id}`) : "";
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {/* Keyed on what is edited, so each opening starts from that role. */}
        {state && <RoleEditorForm key={key} state={state} roles={roles} functions={functions} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function RoleEditorForm({
  state,
  roles,
  functions,
  onClose,
}: {
  state: EditorState;
  roles: RoleInfo[];
  functions: ProductFunction[];
  onClose: () => void;
}) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const grants = useGrants();
  const editing = state.mode === "edit" ? state.role : null;
  const source = state.mode === "clone" ? state.source : null;
  const baseline = useMemo(() => functions.filter((fn) => fn.alwaysAllowed).map((fn) => fn.id), [functions]);

  const [name, setName] = useState(() => editing?.name ?? (source ? copyName(source, roles) : ""));
  const [description, setDescription] = useState(() => editing?.description ?? source?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set([...(editing?.allowedFunctions ?? source?.allowedFunctions ?? []), ...baseline]),
  );
  const [filter, setFilter] = useState("");
  const [touched, setTouched] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const allowedFunctions = functions.filter((fn) => selected.has(fn.id)).map((fn) => fn.id);
      if (editing) {
        const before = new Set(editing.allowedFunctions);
        const changed = allowedFunctions.length !== before.size || allowedFunctions.some((id) => !before.has(id));
        return updateRole(editing.id, {
          ...(name.trim() !== editing.name && { name: name.trim() }),
          ...(description.trim() !== editing.description && { description: description.trim() }),
          ...(changed && { allowedFunctions }),
        });
      }
      return createRole({
        name: name.trim(),
        description: description.trim(),
        allowedFunctions,
        ...(source && { cloneFrom: source.id }),
      });
    },
    onSuccess: (role) => {
      toast.success(editing ? t("roles.toast.updated", { name: role.name }) : t("roles.toast.created", { name: role.name }));
      void queryClient.invalidateQueries({ queryKey: qk.roles });
      onClose();
    },
  });

  const trimmed = name.trim();
  const taken = roles.some(
    (role) => role.id !== editing?.id && [roleKey(role.name), roleKey(role.id)].includes(roleKey(trimmed)),
  );
  const errors = {
    name:
      trimmed === ""
        ? t("roles.editor.nameRequired")
        : trimmed.length > MAX_NAME_LENGTH
          ? t("roles.editor.tooLong", { count: MAX_NAME_LENGTH })
          : taken
            ? t("roles.editor.nameTaken", { name: trimmed })
            : null,
    description:
      description.trim().length > MAX_DESCRIPTION_LENGTH ? t("roles.editor.tooLong", { count: MAX_DESCRIPTION_LENGTH }) : null,
  };
  const valid = errors.name === null && errors.description === null;

  /** Whether a box can be ticked or cleared here: the baseline is always on,
   *  and nobody grants what their own role does not allow. */
  const locked = (fn: ProductFunction) =>
    fn.alwaysAllowed || (!selected.has(fn.id) && beyondGrants(grants, [fn.id]).length > 0);

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const query = filter.trim().toLowerCase();
  const areas = useMemo(
    () =>
      byArea(
        query
          ? functions.filter((fn) => fn.id.toLowerCase().includes(query) || fn.name.toLowerCase().includes(query))
          : functions,
      ),
    [functions, query],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) save.mutate();
  };

  const title = editing
    ? t("roles.editor.titleEdit", { name: editing.name })
    : source
      ? t("roles.editor.titleClone", { name: source.name })
      : t("roles.editor.titleCreate");

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t("roles.editor.description")}</DialogDescription>
      </DialogHeader>

      {save.isError && (
        <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            {apiErrorMessage(save.error) ?? (editing ? t("roles.toast.updateFailed") : t("roles.toast.createFailed"))}
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="role-name" label={t("roles.editor.name")} error={touched ? errors.name : null}>
          <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field id="role-description" label={t("roles.editor.descriptionLabel")} error={touched ? errors.description : null}>
          <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{t("roles.editor.permissions")}</span>
          <span className="nums text-xs text-muted-foreground" aria-live="polite">
            {t("roles.editor.count", { count: selected.size, total: functions.length })}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("roles.editor.filter")}
            aria-label={t("roles.editor.filter")}
            className="h-8 pl-8"
          />
        </div>
        <div className="max-h-[45vh] overflow-y-auto border border-border">
          {areas.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{t("roles.editor.noMatch", { query: filter.trim() })}</p>
          ) : (
            areas.map(([area, fns]) => {
              const open = fns.filter((fn) => !locked(fn));
              const on = open.filter((fn) => selected.has(fn.id)).length;
              const areaLabel = t(`roles.area.${area}`, { defaultValue: area });
              return (
                <fieldset key={area} className="border-b border-border last:border-b-0">
                  <legend className="sr-only">{areaLabel}</legend>
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-muted px-3 py-1.5">
                    <Checkbox
                      id={`role-area-${area}`}
                      checked={open.length > 0 && on === open.length ? true : on > 0 ? "indeterminate" : false}
                      disabled={open.length === 0}
                      onCheckedChange={(checked) => toggle(open.map((fn) => fn.id), checked === true)}
                      aria-label={t("roles.editor.areaToggle", { area: areaLabel })}
                    />
                    <label htmlFor={`role-area-${area}`} className="font-display text-xs font-semibold uppercase tracking-wide">
                      {areaLabel}
                    </label>
                  </div>
                  {fns.map((fn) => {
                    const isLocked = locked(fn);
                    const hint = fn.alwaysAllowed
                      ? t("roles.editor.alwaysAllowed")
                      : isLocked
                        ? t("roles.editor.beyondYours")
                        : undefined;
                    return (
                      <label
                        key={fn.id}
                        htmlFor={`role-fn-${fn.id}`}
                        title={hint}
                        className={cn(
                          "flex items-start gap-2.5 px-3 py-1.5 hover:bg-muted/40",
                          isLocked ? "cursor-not-allowed" : "cursor-pointer",
                        )}
                      >
                        <Checkbox
                          id={`role-fn-${fn.id}`}
                          className="mt-0.5"
                          checked={selected.has(fn.id)}
                          disabled={isLocked}
                          onCheckedChange={(checked) => toggle([fn.id], checked === true)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-xs">{fn.id}</span>
                          <span className="block text-xs text-muted-foreground">{fn.name}</span>
                          {hint && <span className="block text-[11px] text-muted-foreground/80">{hint}</span>}
                        </span>
                        {isLocked && !fn.alwaysAllowed && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
                      </label>
                    );
                  })}
                </fieldset>
              );
            })
          )}
        </div>
        {editing && (editing.userCount ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">{t("roles.editor.usersHint", { count: editing.userCount ?? 0 })}</p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {editing ? t("roles.editor.submitEdit") : t("roles.editor.submitCreate")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* --------------------------------------------------------------- delete -- */

function DeleteRoleDialog({ role, onOpenChange }: { role: RoleInfo | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const live = useWorldStore((s) => s.mode) === "live";
  const canViewUsers = useCan("user.view");
  const users = useQuery({ queryKey: qk.users, queryFn: listUsers, enabled: live && canViewUsers && role !== null });
  const holders = role ? (users.data ?? []).filter((user) => user.role === role.id).map((user) => user.name) : [];
  const inUse = Math.max(role?.userCount ?? 0, holders.length);

  const remove = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      toast.success(t("roles.toast.deleted", { name: role?.name ?? "" }));
      void queryClient.invalidateQueries({ queryKey: qk.roles });
      onOpenChange(false);
    },
    onError: (err) => toast.error(t("roles.toast.deleteFailed"), { description: apiErrorMessage(err) ?? undefined }),
  });

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !remove.isPending && onOpenChange(open)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-danger-subtle text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{t("roles.deleteDialog.title", { name: role?.name ?? "" })}</DialogTitle>
          <DialogDescription>
            {inUse > 0
              ? holders.length > 0
                ? t("roles.deleteDialog.inUse", { count: inUse, name: role?.name ?? "", names: holders.join(", ") })
                : t("roles.deleteDialog.inUseNoNames", { count: inUse, name: role?.name ?? "" })
              : t("roles.deleteDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => role && remove.mutate(role.id)}
            disabled={remove.isPending || inUse > 0}
          >
            {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("common:actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
