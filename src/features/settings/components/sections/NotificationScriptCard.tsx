// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, FileText, FolderOpen, Loader2, Play, Terminal, Trash2, XCircle } from "@/lib/icons";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { DateTime } from "@/components/DateTime";
import { qk } from "@/lib/query";
import { formatInt } from "@/lib/format";
import {
  apiErrorFields,
  apiErrorMessage,
  deleteNotificationScript,
  getNotificationScript,
  getNotificationScriptContent,
  testNotificationScript,
  updateNotificationScript,
  uploadNotificationScript,
  type NotificationScriptRun,
  type NotificationScriptState,
} from "@/services/api.http";
import { useCan } from "@/store/permissions";
import { useWorldStore } from "@/store/world";
import { SettingsSection } from "../SettingsSection";
import { Field } from "../FormField";
import { EventSwitches, HistoryList } from "./notificationParts";

/**
 * Settings → Notifications → Custom script: a script the appliance runs when a
 * chosen event happens (`abr notification script` changes the same thing).
 *
 * Uploading, replacing and removing take effect at once; whether it runs, on
 * which events and for how long are a draft saved together. It runs on the
 * appliance as the service user, and the card says so where the choice is made.
 */

const MAX_SCRIPT_BYTES = 256 * 1024;
const MIN_TIMEOUT = 5;
const MAX_TIMEOUT = 600;

interface Draft {
  enabled: boolean;
  timeout: string;
  events: Record<string, boolean>;
}

function draftOf(state: NotificationScriptState): Draft {
  return {
    enabled: state.enabled,
    timeout: String(state.timeoutSeconds),
    events: Object.fromEntries(state.events.map((e) => [e.id, e.enabled])),
  };
}

const VARIABLES = "ABR_EVENT, ABR_EVENT_NAME, ABR_SEVERITY, ABR_SUBJECT, ABR_BODY, ABR_TIME, ABR_HOST, ABR_VERSION";
const SAMPLE = `#!/bin/sh
# Post each event to a chat webhook.
curl -fsS -H 'Content-Type: application/json' \\
  --data "$(jq -n --arg text "$ABR_SUBJECT" '{text: $text}')" \\
  https://chat.example.com/hooks/...`;

export function NotificationScriptCard() {
  const { t } = useTranslation("settings");
  const live = useWorldStore((s) => s.mode === "live" && s.ready);
  const allowed = useCan("notification.script");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.notificationScript, queryFn: getNotificationScript, enabled: live });
  const state = query.data;

  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<NotificationScriptRun | null>(null);
  const [viewing, setViewing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (state && draft === null) setDraft(draftOf(state));
  }, [state, draft]);

  const pristine = useMemo(() => (state ? JSON.stringify(draftOf(state)) : ""), [state]);
  const dirty = draft !== null && JSON.stringify(draft) !== pristine;

  /** Takes the appliance's answer as the new starting point: saving, and
   *  removing the script, which also switches it off. */
  const adopt = (next: NotificationScriptState) => {
    queryClient.setQueryData(qk.notificationScript, next);
    setDraft(draftOf(next));
    setErrors({});
  };

  const upload = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => uploadNotificationScript(name, content),
    onMutate: () => setUploadError(null),
    onSuccess: (next) => {
      queryClient.setQueryData(qk.notificationScript, next);
      setOutcome(null);
      toast.success(t("script.uploaded", { name: next.file?.name }));
    },
    onError: (err) => {
      const fields = apiErrorFields(err);
      setUploadError(fields?.script_content ?? fields?.name ?? apiErrorMessage(err) ?? t("script.uploadFailed"));
    },
  });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      updateNotificationScript({ enabled: d.enabled, timeoutSeconds: Number(d.timeout), events: d.events }),
    onSuccess: (next) => {
      adopt(next);
      toast.success(t("saved.title"), { description: t("script.saved") });
    },
    onError: (err) => {
      setErrors(apiErrorFields(err) ?? {});
      toast.error(t("script.saveFailed"), { description: apiErrorMessage(err) ?? undefined });
    },
  });

  const remove = useMutation({
    mutationFn: deleteNotificationScript,
    onSuccess: (next) => {
      adopt(next);
      setOutcome(null);
      setConfirmRemove(false);
      toast.success(t("script.removed"));
    },
    onError: (err) => toast.error(t("script.removeFailed"), { description: apiErrorMessage(err) ?? undefined }),
  });

  const test = useMutation({
    mutationFn: testNotificationScript,
    onMutate: () => setOutcome(null),
    onSuccess: (run) => {
      setOutcome(run);
      void queryClient.invalidateQueries({ queryKey: qk.notificationScript });
    },
    onError: (err) => toast.error(t("script.testFailed"), { description: apiErrorMessage(err) ?? undefined }),
  });

  if (!live) {
    return (
      <SettingsSection title={t("script.title")} description={t("script.description")} icon={Terminal}>
        <p className="py-4 text-sm text-muted-foreground">{t("email.liveOnly")}</p>
      </SettingsSection>
    );
  }
  if (query.isError) {
    return (
      <SettingsSection title={t("script.title")} description={t("script.description")} icon={Terminal}>
        <div className="flex items-center gap-2 py-4 text-sm text-danger-text" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {apiErrorMessage(query.error) ?? t("script.loadFailed")}
        </div>
      </SettingsSection>
    );
  }
  if (!state || !draft) {
    return (
      <SettingsSection title={t("script.title")} description={t("script.description")} icon={Terminal}>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("email.loading")}
        </div>
      </SettingsSection>
    );
  }

  const readOnly = !allowed || !state.available;
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setErrors({});
  };

  const onFile = async (file: File) => {
    setUploadError(null);
    if (file.size > MAX_SCRIPT_BYTES) {
      setUploadError(t("script.tooLarge", { name: file.name }));
      return;
    }
    const content = await file.text();
    if (!content.replace(/^﻿/, "").startsWith("#!")) {
      setUploadError(t("script.noInterpreter", { name: file.name }));
      return;
    }
    upload.mutate({ name: file.name, content });
  };

  const onSave = () => {
    const seconds = Number(draft.timeout);
    if (!Number.isInteger(seconds) || seconds < MIN_TIMEOUT || seconds > MAX_TIMEOUT) {
      setErrors({ timeout_seconds: t("script.timeoutRange", { min: MIN_TIMEOUT, max: MAX_TIMEOUT }) });
      return;
    }
    save.mutate(draft);
  };

  const file = state.file;
  return (
    <SettingsSection
      title={t("script.title")}
      description={t("script.description")}
      icon={Terminal}
      headerAside={
        <label className="flex items-center gap-2 text-sm font-medium">
          <Badge variant={state.enabled ? "success" : "outline"}>{state.enabled ? t("email.on") : t("email.off")}</Badge>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
            disabled={readOnly || !file}
            aria-label={t("script.enable")}
            data-testid="script-enabled"
          />
        </label>
      }
      footer={
        allowed && state.available ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="sm:mr-auto"
              onClick={() => test.mutate()}
              disabled={!file || test.isPending}
              data-testid="script-test"
            >
              {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {test.isPending ? t("script.running") : t("script.test")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setDraft(draftOf(state));
                setErrors({});
              }}
            >
              {t("common:actions.discard")}
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending} data-testid="script-save">
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("controls.saveChanges")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6 py-4">
        {state.available ? (
          <div className="flex items-start gap-2 border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs leading-relaxed text-warning-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("script.warning")}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="script-unavailable">
            {t("script.unavailable")}
          </p>
        )}

        {outcome && <RunOutcome run={outcome} />}

        <div className="space-y-2">
          <h3 className="label-overline">{t("script.file")}</h3>
          {file ? (
            <div className="border border-border p-3 text-sm" data-testid="script-file">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">{file.name}</span>
                <span className="nums text-xs text-muted-foreground">{t("script.size", { size: formatInt(file.size) })}</span>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">SHA-256 {file.sha256}</p>
              {file.uploadedAt && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("script.uploadedBy", { user: file.uploadedBy ?? "—" })} <DateTime value={file.uploadedAt} />
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("script.none")}</p>
          )}
          {uploadError && (
            <p className="text-xs text-danger-text" role="alert" data-testid="script-upload-error">
              {uploadError}
            </p>
          )}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
                {file ? t("script.replace") : t("script.upload")}
              </Button>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                tabIndex={-1}
                aria-label={t("script.upload")}
                data-testid="script-file-input"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) void onFile(picked);
                  // Let the same file be picked again after it was edited on disk.
                  e.target.value = "";
                }}
              />
              {file && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setViewing(true)}>
                    {t("script.view")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("script.remove")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">{t("script.receives.title")}</summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>{t("script.receives.stdin")}</p>
            <p>{t("script.receives.variables")}</p>
            <p className="break-words font-mono text-[11px]">{VARIABLES}</p>
            <p>{t("script.receives.outcome")}</p>
            <pre className="overflow-x-auto bg-muted/30 p-2 font-mono text-[11px]">{SAMPLE}</pre>
          </div>
        </details>

        <fieldset className="space-y-3" disabled={readOnly}>
          <Field
            id="script-timeout"
            label={t("script.timeout")}
            error={errors.timeout_seconds}
            hint={t("script.timeoutHint", { min: MIN_TIMEOUT, max: MAX_TIMEOUT })}
          >
            <Input
              id="script-timeout"
              inputMode="numeric"
              className="w-28"
              value={draft.timeout}
              onChange={(e) => update({ timeout: e.target.value })}
              aria-invalid={!!errors.timeout_seconds}
            />
          </Field>
          {errors.enabled && <p className="text-xs text-danger-text">{errors.enabled}</p>}
        </fieldset>

        <fieldset className="space-y-2" disabled={readOnly}>
          <legend className="label-overline mb-2">{t("script.events")}</legend>
          <p className="text-xs text-muted-foreground">{t("script.eventsHint")}</p>
          <EventSwitches
            events={state.events}
            selected={draft.events}
            onChange={(events) => update({ events })}
            readOnly={readOnly}
          />
        </fieldset>

        <HistoryList
          title={t("script.history.title")}
          empty={t("script.history.empty")}
          items={state.runs.slice(0, 8).map((run) => ({
            id: run.id,
            at: run.sentAt ?? run.queuedAt,
            status: run.status,
            statusLabel: t(`script.history.status.${run.status}`),
            subject: run.subject,
            aside: runFacts(run, t),
            error: run.error,
            output: run.output,
          }))}
        />
      </div>

      {viewing && <ViewScriptDialog name={file?.name ?? ""} onClose={() => setViewing(false)} />}

      <Dialog open={confirmRemove} onOpenChange={(open) => !remove.isPending && setConfirmRemove(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("script.removeDialog.title")}</DialogTitle>
            <DialogDescription>{t("script.removeDialog.description", { name: file?.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)} disabled={remove.isPending}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("script.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

function runFacts(run: NotificationScriptRun, t: (key: string, options?: Record<string, unknown>) => string): string | undefined {
  const facts = [
    run.exitCode !== null ? t("script.exitCode", { code: run.exitCode }) : null,
    run.durationMs !== null ? t("script.duration", { ms: formatInt(run.durationMs) }) : null,
  ].filter(Boolean);
  return facts.length ? facts.join(" · ") : undefined;
}

/** How a test run went, with what the script printed. */
function RunOutcome({ run }: { run: NotificationScriptRun }) {
  const { t } = useTranslation("settings");
  const ok = run.status === "sent";
  return (
    <div
      role={ok ? "status" : "alert"}
      data-testid="script-test-result"
      className={
        ok
          ? "flex items-start gap-2 border border-success/30 bg-success-subtle px-3 py-2.5 text-sm text-success-text"
          : "flex items-start gap-2 border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-text"
      }
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">
          {ok ? t("script.testPassed") : (run.error?.message ?? t("script.testFailed"))}
          {runFacts(run, t) && <span className="ml-2 text-xs font-normal">{runFacts(run, t)}</span>}
        </p>
        {!ok && run.error && <code className="text-[11px]">{run.error.code}</code>}
        {run.output && (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words bg-background/40 p-2 font-mono text-[11px]">
            {run.output}
          </pre>
        )}
      </div>
    </div>
  );
}

function ViewScriptDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const { t } = useTranslation("settings");
  const content = useQuery({
    queryKey: [...qk.notificationScript, "content", name],
    queryFn: getNotificationScriptContent,
    gcTime: 0,
    staleTime: 0,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{t("script.viewDescription")}</DialogDescription>
        </DialogHeader>
        {content.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("email.loading")}
          </div>
        ) : content.isError ? (
          <p className="text-sm text-danger-text" role="alert">
            {apiErrorMessage(content.error) ?? t("script.loadFailed")}
          </p>
        ) : (
          <pre className="max-h-[60vh] overflow-auto bg-muted/30 p-3 font-mono text-xs" data-testid="script-content">
            {content.data}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
