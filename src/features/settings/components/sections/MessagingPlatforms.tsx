// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ (AltaStor.com)

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Eye,
  Hash,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Send,
  Trash2,
  XCircle,
  type LucideIcon,
} from "@/lib/icons";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { DateTime } from "@/components/DateTime";
import { qk } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  MESSAGING_PLATFORM_IDS,
  apiErrorCode,
  apiErrorDeliveredTo,
  apiErrorFields,
  apiErrorMessage,
  apiErrorStage,
  getMessaging,
  removeMessagingPlatform,
  testMessagingPlatform,
  updateMessagingPlatform,
  type AppriseState,
  type MessagingPatch,
  type MessagingPlatformId,
  type MessagingPlatformState,
  type MessagingState,
} from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import { ExperimentalBadge } from "@/components/ExperimentalBadge";
import { SettingsSection } from "../SettingsSection";
import { ChipList } from "../controls";
import type { Secret } from "./emailForm";
import { EnabledSwitch, EventSwitches, HistoryList, SecretField } from "./notificationParts";

/**
 * Settings → Notifications → Messaging platforms: Telegram, Slack, Discord and
 * ntfy, which the appliance sends to through Apprise. "Add a
 * platform" offers the ones not set up yet; each one set up is a column with
 * its switch, a summary, Edit and Remove. Edit opens the whole form: the
 * platform's secret, its events (apart from e-mail's), a test message and its
 * recent deliveries (GET /notifications/messaging, PUT/DELETE
 * /notifications/{platform}; `abr notification <platform>` changes the same).
 *
 * A platform chosen but not saved yet is a column too, marked so, until it is
 * saved or removed; it lives in this page only. Secrets never come back from
 * the appliance: a stored one shows as stored, left empty it is kept.
 */

type T = (key: string, options?: Record<string, unknown>) => string;

const TELEGRAM_TOKEN = /^(bot)?[0-9]{3,20}:[A-Za-z0-9_-]{20,80}$/i;
export const TELEGRAM_CHAT = /^(-?[0-9]{1,20}|@[A-Za-z][A-Za-z0-9_]{3,31})(:[0-9]{1,10})?$/;
const MAX_CHATS = 10;
const NTFY_TOKEN = /^tk_[A-Za-z0-9]{8,64}$/;
const DISCORD_HOSTS = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];

const FAILURE_CODES = new Set([
  "connection_failed",
  "tls_failed",
  "delivery_refused",
  "delivery_failed",
  "timed_out",
  "apprise_missing",
  "apprise_not_started",
  "apprise_url_refused",
  "apprise_failed",
]);

const ICONS: Record<MessagingPlatformId, LucideIcon> = {
  telegram: Send,
  slack: Hash,
  discord: MessageCircle,
  ntfy: Bell,
};

/** Why `url` is not the platform's URL, or null. Telegram has none. */
function urlProblem(id: MessagingPlatformId, url: string, t: T): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return t(`${id}.error.url`);
  }
  if (/\s/.test(url) || parsed.protocol !== "https:") return t(`${id}.error.url`);
  const host = parsed.hostname.toLowerCase();
  if (id === "ntfy" && (parsed.search || parsed.hash || !/^\/[A-Za-z0-9_-]{1,64}\/?$/.test(parsed.pathname))) {
    return t("ntfy.error.url");
  }
  if (id === "slack" && (host !== "hooks.slack.com" || !/^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/?$/.test(parsed.pathname))) {
    return t("slack.error.url");
  }
  if (id === "discord" && (!DISCORD_HOSTS.includes(host) || !/^\/api(\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname))) {
    return t("discord.error.url");
  }
  return null;
}

/* ---------------------------------------------------------------- draft -- */

interface Draft {
  enabled: boolean;
  botToken: Secret;
  chatIds: string[];
  webhookUrl: Secret;
  /** ntfy only. */
  accessToken: Secret;
  events: Record<string, boolean>;
}

/** A platform being added starts switched on: that is what adding it is for. */
function draftOf(p: MessagingPlatformState, adding: boolean): Draft {
  return {
    enabled: adding ? true : p.enabled,
    botToken: undefined,
    chatIds: [...p.chatIds],
    webhookUrl: undefined,
    accessToken: undefined,
    events: Object.fromEntries(p.events.map((e) => [e.id, e.enabled])),
  };
}

function patchOf(id: MessagingPlatformId, d: Draft): MessagingPatch {
  if (id === "telegram") {
    return {
      enabled: d.enabled,
      ...(d.botToken !== undefined ? { botToken: d.botToken.trim() } : {}),
      chatIds: d.chatIds,
      events: d.events,
    };
  }
  return {
    enabled: d.enabled,
    ...(d.webhookUrl !== undefined ? { webhookUrl: d.webhookUrl.trim() } : {}),
    ...(id === "ntfy" && d.accessToken !== undefined ? { accessToken: d.accessToken.trim() } : {}),
    events: d.events,
  };
}

/** The appliance's own checks, keyed as it names the fields. `complete`:
 *  switched on, or a test. */
function problemsOf(p: MessagingPlatformState, d: Draft, complete: boolean, t: T): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.id === "telegram") {
    const token = d.botToken?.trim();
    if (token && !TELEGRAM_TOKEN.test(token)) out.bot_token = t("telegram.error.token");
    else if (complete && (d.botToken === "" || (d.botToken === undefined && !p.botTokenSet))) {
      out.bot_token = t("telegram.error.tokenRequired");
    }
    const bad = d.chatIds.filter((c) => !TELEGRAM_CHAT.test(c));
    if (bad.length) out.chat_ids = t("telegram.error.chats", { list: bad.join(", ") });
    else if (d.chatIds.length > MAX_CHATS) out.chat_ids = t("telegram.error.tooMany", { max: MAX_CHATS });
    else if (complete && !d.chatIds.length) out.chat_ids = t("telegram.error.chatsRequired");
    return out;
  }
  const url = d.webhookUrl?.trim();
  const problem = url ? urlProblem(p.id, url, t) : null;
  if (problem) out.webhook_url = problem;
  else if (complete && (d.webhookUrl === "" || (d.webhookUrl === undefined && !p.webhookUrlSet))) {
    out.webhook_url = t(`${p.id}.error.urlRequired`);
  }
  const token = d.accessToken?.trim();
  if (p.id === "ntfy" && token && !NTFY_TOKEN.test(token)) out.access_token = t("ntfy.error.token");
  return out;
}

/* -------------------------------------------------------------- section -- */

export function MessagingPlatformsSection() {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode === "live" && s.ready);
  const canEdit = useCan("notification.edit");
  const queryClient = useQueryClient();
  // Another console may change these: look again on coming back to the tab.
  const query = useQuery({ queryKey: qk.messaging, queryFn: getMessaging, enabled: live, refetchOnWindowFocus: true });
  const state = query.data;

  /** Chosen with "Add a platform" and not saved yet. */
  const [pending, setPending] = useState<MessagingPlatformId[]>([]);
  const [editing, setEditing] = useState<MessagingPlatformId | null>(null);
  const [removing, setRemoving] = useState<MessagingPlatformId | null>(null);

  // A pending platform the appliance now has (saved here or elsewhere) is just added.
  useEffect(() => {
    if (state) setPending((list) => list.filter((id) => !state.platforms.find((p) => p.id === id)?.added));
  }, [state]);

  const adopt = (next: MessagingPlatformState) =>
    queryClient.setQueryData<MessagingState>(qk.messaging, (old) =>
      old ? { ...old, platforms: old.platforms.map((p) => (p.id === next.id ? next : p)) } : old,
    );

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: MessagingPlatformId; enabled: boolean }) => updateMessagingPlatform(id, { enabled }),
    onSuccess: (next) => {
      adopt(next);
      toast.success(t(next.enabled ? "messaging.switchedOn" : "messaging.switchedOff", { name: t(`${next.id}.title`) }));
    },
    onError: (err, { id }) =>
      toast.error(t("messaging.toggleFailed", { name: t(`${id}.title`) }), {
        description: Object.values(apiErrorFields(err) ?? {})[0] ?? apiErrorMessage(err) ?? undefined,
      }),
  });

  const remove = useMutation({
    mutationFn: removeMessagingPlatform,
    onSuccess: (next) => {
      adopt(next);
      setRemoving(null);
      toast.success(t("messaging.removed", { name: t(`${next.id}.title`) }));
    },
    onError: (err, id) =>
      toast.error(t("messaging.removeFailed", { name: t(`${id}.title`) }), { description: apiErrorMessage(err) ?? undefined }),
  });

  // Experimental: marked once, at the section's name, not on each platform.
  const title = (
    <span className="inline-flex flex-wrap items-center gap-2">
      {t("messaging.title")}
      <ExperimentalBadge>{t("messaging.experimental")}</ExperimentalBadge>
    </span>
  );
  const shell = (body: ReactNode) => (
    <SettingsSection title={title} description={t("messaging.description")} icon={MessagesSquare}>
      {body}
    </SettingsSection>
  );
  if (!live) return shell(<p className="py-4 text-sm text-muted-foreground">{t("messaging.liveOnly")}</p>);
  if (query.isError) {
    return shell(
      <div className="flex items-center gap-2 py-4 text-sm text-danger-text" role="alert">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {apiErrorMessage(query.error) ?? t("messaging.loadFailed")}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void query.refetch()}>
          {t("common:actions.retry")}
        </Button>
      </div>,
    );
  }
  if (!state) {
    return shell(
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("messaging.loading")}
      </div>,
    );
  }

  const byId = (id: MessagingPlatformId) => state.platforms.find((p) => p.id === id);
  const shown = MESSAGING_PLATFORM_IDS.filter((id) => byId(id)?.added || pending.includes(id));
  const addable = MESSAGING_PLATFORM_IDS.filter((id) => byId(id) && !shown.includes(id));
  const editingPlatform = editing ? byId(editing) : undefined;
  const removingPlatform = removing ? byId(removing) : undefined;

  const onAdd = (id: string) => {
    const platform = id as MessagingPlatformId;
    setPending((list) => (list.includes(platform) ? list : [...list, platform]));
    setEditing(platform);
  };
  const onRemove = (id: MessagingPlatformId) => {
    // One never saved has nothing on the appliance to remove.
    if (!byId(id)?.added) setPending((list) => list.filter((x) => x !== id));
    else setRemoving(id);
  };

  return (
    <SettingsSection title={title} description={t("messaging.description")} icon={MessagesSquare}>
      <div className="space-y-4 py-4">
        <AppriseNote apprise={state.apprise} />

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="messaging-add" className="text-sm font-medium">
              {t("messaging.add")}
            </label>
            <Select value="" onValueChange={onAdd} disabled={!addable.length}>
              <SelectTrigger id="messaging-add" className="w-full sm:w-72" data-testid="messaging-add">
                <SelectValue placeholder={addable.length ? t("messaging.addPlaceholder") : t("messaging.allAdded")} />
              </SelectTrigger>
              <SelectContent>
                {addable.map((id) => {
                  const Icon = ICONS[id];
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {t(`${id}.title`)}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground" data-testid="messaging-empty">
            {canEdit ? t("messaging.empty") : t("messaging.emptyReadOnly")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {shown.map((id) => {
              const platform = byId(id);
              return (
                platform && (
                  <PlatformColumn
                    key={id}
                    platform={platform}
                    apprise={state.apprise}
                    canEdit={canEdit}
                    toggling={toggle.isPending && toggle.variables?.id === id}
                    onToggle={(enabled) => toggle.mutate({ id, enabled })}
                    onEdit={() => setEditing(id)}
                    onRemove={() => onRemove(id)}
                  />
                )
              );
            })}
          </div>
        )}
      </div>

      {editingPlatform && (
        <PlatformDialog
          key={editingPlatform.id}
          platform={editingPlatform}
          apprise={state.apprise}
          adding={!editingPlatform.added}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            adopt(next);
            setEditing(null);
          }}
        />
      )}

      <Dialog open={!!removingPlatform} onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}>
        <DialogContent className="max-w-md">
          {removingPlatform && (
            <>
              <DialogHeader>
                <DialogTitle>{t("messaging.removeDialog.title", { name: t(`${removingPlatform.id}.title`) })}</DialogTitle>
                <DialogDescription>
                  {t("messaging.removeDialog.description", { secret: t(`messaging.secret.${removingPlatform.id}`) })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRemoving(null)} disabled={remove.isPending}>
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => remove.mutate(removingPlatform.id)}
                  disabled={remove.isPending}
                  data-testid="messaging-remove-confirm"
                >
                  {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("messaging.remove")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

function AppriseNote({ apprise }: { apprise: AppriseState }) {
  const { t } = useTranslation("settings");
  return apprise.available ? (
    <p className="text-xs text-muted-foreground" data-testid="messaging-apprise">
      {t("chat.apprise.via", { version: apprise.version ?? "" })}
    </p>
  ) : (
    <div
      className="flex items-start gap-2 border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs leading-relaxed text-warning-text"
      data-testid="messaging-apprise-missing"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{t("chat.apprise.missing")}</span>
    </div>
  );
}

const STATUS_VARIANT = { sent: "success", failed: "danger", retrying: "warning", queued: "info", cancelled: "outline" } as const;

/* --------------------------------------------------------------- column -- */

function PlatformColumn({
  platform,
  apprise,
  canEdit,
  toggling,
  onToggle,
  onEdit,
  onRemove,
}: {
  platform: MessagingPlatformState;
  apprise: AppriseState;
  canEdit: boolean;
  toggling: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("settings");
  const Icon = ICONS[platform.id];
  const name = t(`${platform.id}.title`);
  const saved = platform.added;
  const latest = platform.deliveries[0];
  const eventsOn = platform.events.filter((e) => e.enabled).length;
  return (
    <div
      className={cn("flex flex-col border bg-card", saved ? "border-border" : "border-dashed border-primary/40")}
      data-testid={`platform-${platform.id}`}
    >
      <div className="flex items-start gap-2.5 border-b border-border p-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center",
            saved && platform.enabled ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-medium leading-tight">{name}</div>
          {saved ? (
            <Badge variant={platform.enabled ? "success" : "outline"}>{platform.enabled ? t("email.on") : t("email.off")}</Badge>
          ) : (
            <span className="text-xs text-warning-text">{t("messaging.notSaved")}</span>
          )}
        </div>
        {saved && (
          <Switch
            checked={platform.enabled}
            onCheckedChange={onToggle}
            // Without Apprise nothing can be sent: it can still be switched off.
            disabled={!canEdit || toggling || (!apprise.available && !platform.enabled)}
            aria-label={t("messaging.enableNamed", { name })}
            data-testid={`platform-${platform.id}-enabled`}
          />
        )}
      </div>

      <div className="flex-1 space-y-1 p-3 text-xs text-muted-foreground">
        {!saved ? (
          <p>{t("messaging.pending")}</p>
        ) : (
          <>
            {platform.id === "telegram" ? (
              <p className="truncate">
                {[platform.botId ? t("messaging.summary.bot", { id: platform.botId }) : null, t("messaging.summary.chats", { count: platform.chatIds.length })]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : (
              platform.webhookHost && <p className="truncate" title={platform.webhookHost}>{t("messaging.summary.host", { host: platform.webhookHost })}</p>
            )}
            <p>{t("messaging.summary.events", { on: eventsOn, total: platform.events.length })}</p>
            {latest ? (
              <p className="flex flex-wrap items-center gap-1.5">
                <Badge variant={STATUS_VARIANT[latest.status]}>{t(`email.history.status.${latest.status}`)}</Badge>
                <DateTime value={latest.sentAt ?? latest.queuedAt} />
              </p>
            ) : (
              <p>{t("messaging.summary.never")}</p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-border p-2">
        <Button variant="ghost" size="sm" onClick={onEdit} data-testid={`platform-${platform.id}-edit`}>
          {canEdit ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {canEdit ? t("messaging.edit") : t("messaging.view")}
        </Button>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-danger-text hover:text-danger-text"
            onClick={onRemove}
            data-testid={`platform-${platform.id}-remove`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("messaging.remove")}
          </Button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- dialog -- */

type Outcome =
  | { ok: true; deliveredTo: string[]; durationMs: number }
  | { ok: false; code: string; stage: string | null; message: string; deliveredTo: string[] };

function PlatformDialog({
  platform,
  apprise,
  adding,
  onClose,
  onSaved,
}: {
  platform: MessagingPlatformState;
  apprise: AppriseState;
  adding: boolean;
  onClose: () => void;
  onSaved: (next: MessagingPlatformState) => void;
}) {
  const { t } = useTranslation("settings");
  const canEdit = useCan("notification.edit");
  const canTest = useCan("notification.test");
  const queryClient = useQueryClient();
  const id = platform.id;
  const name = t(`${id}.title`);
  const Icon = ICONS[id];
  const [draft, setDraft] = useState<Draft>(() => draftOf(platform, adding));
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const dirty = adding || JSON.stringify(draft) !== JSON.stringify(draftOf(platform, false));

  const save = useMutation({
    mutationFn: (d: Draft) => updateMessagingPlatform(id, patchOf(id, d)),
    onSuccess: (next) => {
      toast.success(t("saved.title"), { description: t("chat.saved", { name }) });
      onSaved(next);
    },
    onError: (err) => {
      setServerErrors(apiErrorFields(err) ?? {});
      setShowErrors(true);
      toast.error(t("chat.saveFailed", { name }), { description: apiErrorMessage(err) ?? undefined });
    },
  });

  const test = useMutation({
    mutationFn: (d: Draft) => testMessagingPlatform(id, patchOf(id, d)),
    onMutate: () => setOutcome(null),
    onSuccess: (result) => {
      setOutcome({ ok: true, ...result });
      void queryClient.invalidateQueries({ queryKey: qk.messaging });
    },
    onError: (err) => {
      const fields = apiErrorFields(err);
      if (fields) {
        setServerErrors(fields);
        setShowErrors(true);
      }
      setOutcome({
        ok: false,
        code: apiErrorCode(err) ?? "unknown",
        stage: apiErrorStage(err),
        message: apiErrorMessage(err) ?? t("email.test.unreachable"),
        deliveredTo: apiErrorDeliveredTo(err),
      });
      void queryClient.invalidateQueries({ queryKey: qk.messaging });
    },
  });

  const clientErrors = problemsOf(platform, draft, draft.enabled, t);
  const errors = showErrors ? { ...serverErrors, ...clientErrors } : {};
  const err = (key: string) => errors[key] ?? null;
  const readOnly = !canEdit;
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // An edit retires the appliance's last verdict; the checks here still run.
    setServerErrors((s) => (Object.keys(s).length ? {} : s));
  };
  const onSave = () => {
    setShowErrors(true);
    if (Object.keys(clientErrors).length) return;
    save.mutate(draft);
  };
  const onTest = () => {
    const complete = problemsOf(platform, draft, true, t);
    if (Object.keys(complete).length) {
      setServerErrors(complete);
      setShowErrors(true);
      setOutcome(null);
      return;
    }
    test.mutate(draft);
  };
  const busy = save.isPending || test.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid={`platform-${id}-dialog`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {adding ? t("messaging.addTitle", { name }) : name}
          </DialogTitle>
          <DialogDescription>{t(`${id}.description`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t("messaging.enable")}</span>
            <EnabledSwitch
              checked={draft.enabled}
              saved={adding ? !draft.enabled : platform.enabled}
              onChange={(enabled) => update({ enabled })}
              disabled={readOnly || (!apprise.available && !draft.enabled)}
              label={t("messaging.enableNamed", { name })}
              testId={`platform-${id}-dialog-enabled`}
            />
          </div>

          {showErrors && Object.keys(errors).length > 0 && (
            <div role="alert" className="flex items-start gap-2 border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t("email.error.summary", { count: Object.keys(errors).length })}
                {errors.enabled && <span className="mt-1 block text-xs">{errors.enabled}</span>}
              </span>
            </div>
          )}

          {!apprise.available && <AppriseNote apprise={apprise} />}

          {outcome && (
            <TestOutcomePanel
              outcome={outcome}
              where={(list) => (id === "telegram" ? list.join(", ") : t(`${id}.target`))}
              testId={`platform-${id}-test-result`}
            />
          )}

          <fieldset className="space-y-3" disabled={readOnly}>
            <legend className="label-overline mb-2">{t(`${id}.settings`)}</legend>
            {id === "telegram" ? (
              <TelegramFields platform={platform} draft={draft} update={update} err={err} readOnly={readOnly} />
            ) : (
              <WebhookFields platform={platform} draft={draft} update={update} err={err} readOnly={readOnly} />
            )}
          </fieldset>

          <fieldset className="space-y-2" disabled={readOnly}>
            <legend className="label-overline mb-2">{t("chat.events.title")}</legend>
            <p className="text-xs text-muted-foreground">{t("chat.events.hint")}</p>
            <EventSwitches events={platform.events} selected={draft.events} onChange={(events) => update({ events })} readOnly={readOnly} />
          </fieldset>

          {!adding && (
            <HistoryList
              title={t("email.history.title")}
              empty={t("email.history.empty")}
              items={platform.deliveries.slice(0, 8).map((d) => ({
                id: d.id,
                at: d.sentAt ?? d.queuedAt,
                status: d.status,
                statusLabel: t(`email.history.status.${d.status}`),
                subject: d.subject,
                aside: id === "telegram" && d.deliveredTo.length ? t("chat.history.to", { list: d.deliveredTo.join(", ") }) : undefined,
                error: d.error,
                retryAt: d.status === "retrying" ? d.nextAttemptAt : null,
              }))}
            />
          )}

          {!adding && platform.updatedAt && (
            <p className="text-xs text-muted-foreground">
              {t("email.lastChanged", { user: platform.updatedBy ?? "—" })} <DateTime value={platform.updatedAt} />
            </p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {canTest ? (
            <Button variant="outline" size="sm" onClick={onTest} disabled={busy || !apprise.available} data-testid={`platform-${id}-test`}>
              {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {test.isPending ? t("chat.test.sending") : t("chat.test.send")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              {canEdit ? t("common:actions.cancel") : t("messaging.close")}
            </Button>
            {canEdit && (
              <Button size="sm" onClick={onSave} disabled={!dirty || busy} data-testid={`platform-${id}-save`}>
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {adding ? t("messaging.addSave") : t("controls.saveChanges")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FieldsProps {
  platform: MessagingPlatformState;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  err: (key: string) => string | null;
  readOnly: boolean;
}

function TelegramFields({ platform, draft, update, err, readOnly }: FieldsProps) {
  const { t } = useTranslation("settings");
  return (
    <>
      <SecretField
        id="telegram-token"
        label={t("telegram.botToken")}
        stored={platform.botTokenSet}
        value={draft.botToken}
        onChange={(botToken) => update({ botToken })}
        error={err("bot_token")}
        readOnly={readOnly}
        placeholder="123456789:AAE…"
        hint={t("telegram.botTokenHint")}
      />
      {platform.botTokenSet && platform.botId && draft.botToken === undefined && (
        <p className="-mt-1 text-xs text-muted-foreground" data-testid="telegram-bot-id">
          {t("telegram.botId", { id: platform.botId })}
        </p>
      )}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">{t("telegram.chats")}</span>
        {readOnly ? (
          <p className="text-sm">{draft.chatIds.join(", ") || "—"}</p>
        ) : (
          <ChipList
            values={draft.chatIds}
            onChange={(chatIds) => update({ chatIds })}
            placeholder="-1001234567890"
            ariaLabel={t("telegram.addChat")}
            validate={(v) => TELEGRAM_CHAT.test(v)}
          />
        )}
        {err("chat_ids") ? (
          <p className="text-xs text-danger-text">{err("chat_ids")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("telegram.chatsHint", { max: MAX_CHATS })}</p>
        )}
      </div>
      <Setup steps={[t("telegram.setup.bot"), t("telegram.setup.add"), t("telegram.setup.chatId")]} />
    </>
  );
}

function WebhookFields({ platform, draft, update, err, readOnly }: FieldsProps) {
  const { t } = useTranslation("settings");
  const id = platform.id;
  return (
    <>
      <SecretField
        id={`${id}-url`}
        label={t(`${id}.url`)}
        stored={platform.webhookUrlSet}
        value={draft.webhookUrl}
        onChange={(webhookUrl) => update({ webhookUrl })}
        error={err("webhook_url")}
        readOnly={readOnly}
        placeholder={t(`${id}.urlPlaceholder`)}
        hint={t(`${id}.urlHint`)}
      />
      {platform.webhookUrlSet && platform.webhookHost && draft.webhookUrl === undefined && (
        <p className="-mt-1 break-all text-xs text-muted-foreground" data-testid={`${id}-host`}>
          {t("chat.storedHost", { host: platform.webhookHost })}
        </p>
      )}
      {id === "ntfy" && (
        <SecretField
          id="ntfy-token"
          label={t("ntfy.token")}
          stored={platform.accessTokenSet}
          value={draft.accessToken}
          onChange={(accessToken) => update({ accessToken })}
          error={err("access_token")}
          readOnly={readOnly}
          placeholder="tk_…"
          hint={t("ntfy.tokenHint")}
          optional
        />
      )}
      <Setup steps={id === "ntfy" ? [t("ntfy.setup.topic"), t("ntfy.setup.server"), t("ntfy.setup.app")] : [t(`${id}.setup.steps`)]} />
    </>
  );
}

function Setup({ steps }: { steps: string[] }) {
  const { t } = useTranslation("settings");
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium">{t("chat.setup")}</summary>
      {steps.length > 1 ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 leading-relaxed">{steps[0]}</p>
      )}
    </details>
  );
}

function TestOutcomePanel({ outcome, where, testId }: { outcome: Outcome; where: (deliveredTo: string[]) => string; testId: string }) {
  const { t } = useTranslation("settings");
  if (outcome.ok) {
    return (
      <div role="status" data-testid={testId} className="flex items-start gap-2 border border-success/30 bg-success-subtle px-3 py-2.5 text-sm text-success-text">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{t("chat.test.sent", { to: where(outcome.deliveredTo), ms: outcome.durationMs })}</p>
          <p className="text-xs">{t("chat.test.check")}</p>
        </div>
      </div>
    );
  }
  const known = FAILURE_CODES.has(outcome.code);
  return (
    <div role="alert" data-testid={testId} className="flex items-start gap-2 border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{known ? t(`chat.test.failure.${outcome.code}`) : t("chat.test.failure.other")}</p>
        <p className="break-words text-xs">{outcome.message}</p>
        {outcome.deliveredTo.length > 0 && <p className="text-xs">{t("chat.test.partly", { list: outcome.deliveredTo.join(", ") })}</p>}
        <p className="text-[11px] text-danger-text/80">
          <code>{outcome.code}</code>
          {outcome.stage ? ` · ${t("email.test.stage", { stage: outcome.stage })}` : ""}
        </p>
      </div>
    </div>
  );
}
