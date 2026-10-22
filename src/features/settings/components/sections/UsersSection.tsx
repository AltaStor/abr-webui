// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Settings -> Users: the appliance's users and the roles they hold.
 *
 * Every user holds exactly one built-in role. The roles themselves cannot be
 * changed, so the second card is a read-only view of what each one allows.
 * The appliance enforces all of it — including that the last enabled
 * Administrator can be neither demoted, disabled nor deleted — and this page
 * says what it answered rather than second-guessing it.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Minus, Pencil, Plus, ShieldCheck, Trash2, Users } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { qk } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  apiErrorMessage,
  createUser,
  deleteUser,
  listFunctions,
  listRoles,
  listUsers,
  updateUser,
  type AuthUser,
  type ProductFunction,
  type RoleInfo,
  type UserPatch,
} from "@/services/api.http";
import { useAuthStore } from "@/store/auth";
import { ROLE_NAMES, useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import { SettingsSection } from "../SettingsSection";

const MIN_PASSWORD_LENGTH = 8;
const ROLE_ORDER = Object.keys(ROLE_NAMES);

export function UsersSection() {
  const canViewUsers = useCan("user.view");
  const canViewRoles = useCan("role.view");
  return (
    <div className="space-y-4">
      {canViewUsers && <UsersCard />}
      {canViewRoles && <RolesCard />}
    </div>
  );
}

function roleName(roles: RoleInfo[] | undefined, id: string | null): string {
  if (!id) return "—";
  return roles?.find((role) => role.id === id)?.name ?? ROLE_NAMES[id] ?? id;
}

/* -------------------------------------------------------------------- users -- */

function UsersCard() {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode) === "live";
  const me = useAuthStore((s) => s.user);
  const canCreate = useCan("user.create");
  const canEdit = useCan("user.edit");
  const canDelete = useCan("user.delete");
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: qk.users, queryFn: listUsers, enabled: live });
  const roles = useQuery({ queryKey: qk.roles, queryFn: listRoles, enabled: live, staleTime: Infinity });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [deleting, setDeleting] = useState<AuthUser | null>(null);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UserPatch }) => updateUser(id, patch),
    onSuccess: (user) => {
      toast.success(t("users.toast.updated", { name: user.name }));
      void queryClient.invalidateQueries({ queryKey: qk.users });
    },
    onError: (err) => toast.error(t("users.toast.updateFailed"), { description: apiErrorMessage(err) ?? undefined }),
  });

  const sorted = useMemo(
    () => [...(users.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [users.data],
  );

  return (
    <SettingsSection
      title={t("users.title")}
      description={t("users.description")}
      icon={Users}
      flush
      headerAside={
        canCreate && live ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("users.add")}
          </Button>
        ) : null
      }
    >
      {!live ? (
        <p className="px-5 py-3.5 text-sm text-muted-foreground">{t("toast.connectLive")}</p>
      ) : users.isLoading ? (
        <p className="flex items-center gap-2 px-5 py-3.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("users.loading")}
        </p>
      ) : users.isError ? (
        <p className="flex items-start gap-2 px-5 py-3.5 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {apiErrorMessage(users.error) ?? t("users.loadFailed")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("users.column.user")}</TableHead>
              <TableHead>{t("users.column.role")}</TableHead>
              <TableHead>{t("users.column.enabled")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("users.column.created")}</TableHead>
              {(canEdit || canDelete) && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((user) => {
              const self = user.id === me?.id;
              const busy = update.isPending && update.variables?.id === user.id;
              return (
                <TableRow key={user.id} className={cn(!user.enabled && "text-muted-foreground")}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.name}</span>
                      {self && <Badge variant="outline">{t("users.you")}</Badge>}
                    </div>
                    {user.fullName && <div className="text-xs text-muted-foreground">{user.fullName}</div>}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Select
                        value={user.role ?? undefined}
                        onValueChange={(role) => update.mutate({ id: user.id, patch: { role } })}
                        disabled={busy}
                      >
                        <SelectTrigger className="h-8 w-48" aria-label={t("users.roleFor", { name: user.name })}>
                          <SelectValue placeholder={t("users.noRole")} />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_ORDER.map((id) => (
                            <SelectItem key={id} value={id}>
                              {roleName(roles.data, id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      roleName(roles.data, user.role)
                    )}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Switch
                        checked={user.enabled}
                        onCheckedChange={(enabled) => update.mutate({ id: user.id, patch: { enabled } })}
                        disabled={busy}
                        aria-label={t("users.enabledFor", { name: user.name })}
                      />
                    ) : user.enabled ? (
                      t("users.state.enabled")
                    ) : (
                      t("users.state.disabled")
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTime(user.createdAt)}
                  </TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="whitespace-nowrap text-right">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("users.editUser", { name: user.name })}
                          title={t("users.editUser", { name: user.name })}
                          className="text-muted-foreground/70 hover:text-foreground"
                          onClick={() => setEditing(user)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("users.deleteUser", { name: user.name })}
                          className="text-muted-foreground/70 hover:bg-danger/10 hover:text-danger"
                          onClick={() => setDeleting(user)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="border-t border-border/50 px-5 py-3 text-xs text-muted-foreground">{t("users.lastAdminNote")}</p>

      <AddUserDialog open={adding} onOpenChange={setAdding} roles={roles.data} />
      <EditUserDialog user={editing} self={editing?.id === me?.id} onOpenChange={(open) => !open && setEditing(null)} />
      <DeleteUserDialog user={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </SettingsSection>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleInfo[] | undefined;
}) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const reset = () => {
    setName("");
    setFullName("");
    setRole("");
    setPassword("");
    setConfirm("");
    setTouched(false);
  };

  const create = useMutation({
    mutationFn: createUser,
    onSuccess: (user) => {
      toast.success(t("users.toast.created", { name: user.name }));
      void queryClient.invalidateQueries({ queryKey: qk.users });
      reset();
      onOpenChange(false);
    },
  });

  const errors = {
    name: name.trim() === "" ? t("users.form.nameRequired") : null,
    role: role === "" ? t("users.form.roleRequired") : null,
    password:
      password.length < MIN_PASSWORD_LENGTH ? t("users.form.passwordTooShort", { count: MIN_PASSWORD_LENGTH }) : null,
    confirm: confirm !== password ? t("users.form.mismatch") : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    create.mutate({ name: name.trim(), fullName: fullName.trim(), role, password });
  };

  const description = roles?.find((r) => r.id === role)?.description;

  const close = () => {
    if (create.isPending) return;
    reset();
    create.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("users.form.title")}</DialogTitle>
            <DialogDescription>{t("users.form.description")}</DialogDescription>
          </DialogHeader>

          {create.isError && (
            <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0">{apiErrorMessage(create.error) ?? t("users.toast.createFailed")}</span>
            </div>
          )}

          <Field id="new-user-name" label={t("users.form.name")} error={touched ? errors.name : null}>
            <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field id="new-user-full-name" label={t("users.form.fullName")}>
            <Input id="new-user-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field id="new-user-role" label={t("users.form.role")} error={touched ? errors.role : null} hint={description}>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="new-user-role">
                <SelectValue placeholder={t("users.form.rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ORDER.map((id) => (
                  <SelectItem key={id} value={id}>
                    {roleName(roles, id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            id="new-user-password"
            label={t("users.form.password")}
            error={touched ? errors.password : null}
            hint={t("users.form.passwordHint", { count: MIN_PASSWORD_LENGTH })}
          >
            <PasswordInput
              id="new-user-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field id="new-user-confirm" label={t("users.form.confirm")} error={touched ? errors.confirm : null}>
            <PasswordInput
              id="new-user-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={create.isPending}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("users.form.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * An Administrator's edit of a user's sign-in: their name, full name and
 * password. The role and whether they may sign in stay in the table, where
 * they are one click each. A new name keeps the password; a new password
 * signs the user out everywhere. Your own password is not set here: the
 * appliance wants the current one for that, which Change password asks for.
 */
function EditUserDialog({
  user,
  self,
  onOpenChange,
}: {
  user: AuthUser | null;
  self: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* Keyed on the user, so the form is seeded from each user afresh and
            never shows the previous one's password. */}
        {user && <EditUserForm key={user.id} user={user} self={self} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({ user, self, onClose }: { user: AuthUser; self: boolean; onClose: () => void }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const adoptUser = useAuthStore((s) => s.adoptUser);
  const [name, setName] = useState(user.name);
  const [fullName, setFullName] = useState(user.fullName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const save = useMutation({
    mutationFn: (patch: UserPatch) => updateUser(user.id, patch),
    onSuccess: (updated) => {
      toast.success(t("users.toast.updated", { name: updated.name }));
      if (self) adoptUser(updated);
      void queryClient.invalidateQueries({ queryKey: qk.users });
      onClose();
    },
  });

  const patch: UserPatch = {
    ...(name.trim() !== user.name && { name: name.trim() }),
    ...(fullName.trim() !== user.fullName && { fullName: fullName.trim() }),
    ...(password !== "" && { password }),
  };
  const dirty = Object.keys(patch).length > 0;
  const errors = {
    name: name.trim() === "" ? t("users.form.nameRequired") : null,
    password:
      password !== "" && password.length < MIN_PASSWORD_LENGTH
        ? t("users.form.passwordTooShort", { count: MIN_PASSWORD_LENGTH })
        : null,
    confirm: password !== "" && confirm !== password ? t("users.form.mismatch") : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !dirty) return;
    save.mutate(patch);
  };

  const close = () => {
    if (!save.isPending) onClose();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t("users.edit.title", { name: user.name })}</DialogTitle>
        <DialogDescription>{t("users.edit.description")}</DialogDescription>
      </DialogHeader>

      {save.isError && (
        <div className="flex items-center gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0">{apiErrorMessage(save.error) ?? t("users.toast.updateFailed")}</span>
        </div>
      )}

      <Field
        id="edit-user-name"
        label={t("users.form.name")}
        error={touched ? errors.name : null}
        hint={name.trim() !== user.name ? t("users.edit.renameHint") : undefined}
      >
        <Input id="edit-user-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </Field>
      <Field id="edit-user-full-name" label={t("users.form.fullName")}>
        <Input id="edit-user-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>

      {self ? (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">{t("users.edit.ownPassword")}</p>
      ) : (
        <div className="space-y-4 border-t border-border pt-3">
          <Field
            id="edit-user-password"
            label={t("users.edit.password")}
            error={touched ? errors.password : null}
            hint={t("users.edit.passwordHint", { count: MIN_PASSWORD_LENGTH })}
          >
            <PasswordInput
              id="edit-user-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("users.edit.passwordUnchanged")}
              autoComplete="new-password"
            />
          </Field>
          {password !== "" && (
            <Field id="edit-user-confirm" label={t("users.form.confirm")} error={touched ? errors.confirm : null}>
              <PasswordInput
                id="edit-user-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={save.isPending}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" disabled={save.isPending || !dirty}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("users.edit.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteUserDialog({
  user,
  onOpenChange,
}: {
  user: AuthUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success(t("users.toast.deleted", { name: user?.name ?? "" }));
      void queryClient.invalidateQueries({ queryKey: qk.users });
      onOpenChange(false);
    },
    onError: (err) => toast.error(t("users.toast.deleteFailed"), { description: apiErrorMessage(err) ?? undefined }),
  });

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !remove.isPending && onOpenChange(open)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center bg-danger-subtle text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{t("users.deleteDialog.title", { name: user?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("users.deleteDialog.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={remove.isPending}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => user && remove.mutate(user.id)} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("common:actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger-text">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- roles -- */

/** One row per product function, one column per role: allowed or disabled. */
function RolesCard() {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode) === "live";
  const roles = useQuery({ queryKey: qk.roles, queryFn: listRoles, enabled: live, staleTime: Infinity });
  const functions = useQuery({ queryKey: qk.functions, queryFn: listFunctions, enabled: live, staleTime: Infinity });

  const areas = useMemo(() => {
    const grouped = new Map<string, ProductFunction[]>();
    for (const fn of functions.data ?? []) {
      const area = fn.id.split(".")[0];
      grouped.set(area, [...(grouped.get(area) ?? []), fn]);
    }
    return [...grouped.entries()];
  }, [functions.data]);

  const ordered = useMemo(
    () => [...(roles.data ?? [])].sort((a, b) => ROLE_ORDER.indexOf(a.id) - ROLE_ORDER.indexOf(b.id)),
    [roles.data],
  );

  return (
    <SettingsSection title={t("roles.title")} description={t("roles.description")} icon={ShieldCheck} flush>
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
              <TableHead>{t("roles.column.function")}</TableHead>
              {ordered.map((role) => (
                <TableHead key={role.id} className="text-center" title={role.description}>
                  {role.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.map(([, fns]) =>
              fns.map((fn, index) => (
                <TableRow key={fn.id} className={cn(index === 0 && "border-t-2 border-t-border")}>
                  <TableCell className="py-1.5">
                    <div className="font-mono text-xs">{fn.id}</div>
                    <div className="text-xs text-muted-foreground">{fn.name}</div>
                  </TableCell>
                  {ordered.map((role) => {
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
      )}
      <p className="border-t border-border/50 px-5 py-3 text-xs text-muted-foreground">{t("roles.builtInNote")}</p>
    </SettingsSection>
  );
}
