// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { History } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DateTime } from "@/components/DateTime";
import type { NotificationEventSetting } from "@/services/api.http";

/* What the e-mail and script cards have in common: the form's draft, the
 * on/off switch, choosing events, and the list of what was delivered. */

/**
 * The form's draft of the appliance's settings: seeded from the first answer,
 * and kept in step with the appliance while nothing here has been edited.
 *
 * Seeding only once left a console showing what the appliance said when the
 * card first rendered — often a cached answer from before another console
 * changed it — while the badge beside the switch showed the newer one (ABR-566).
 */
export function useSettingsDraft<S, D>(
  state: S | undefined,
  draftOf: (state: S) => D,
): [D | null, Dispatch<SetStateAction<D | null>>, boolean] {
  const [draft, setDraft] = useState<D | null>(null);
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const previous = seeded.current;
    seeded.current = JSON.stringify(draftOf(state));
    setDraft((d) => (d === null || JSON.stringify(d) === previous ? draftOf(state) : d));
    // draftOf is a plain mapping; only a new answer reseeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const dirty = draft !== null && state !== undefined && JSON.stringify(draft) !== JSON.stringify(draftOf(state));
  return [draft, setDraft, dirty];
}

/**
 * A card's on/off switch. The badge says what the switch says, and "Not saved"
 * while that differs from the appliance's setting: it once showed the saved
 * setting only, so turning the switch on left it reading "Off" (ABR-566).
 */
export function EnabledSwitch({
  checked,
  saved,
  onChange,
  disabled,
  label,
  testId,
}: {
  checked: boolean;
  saved: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  testId?: string;
}) {
  const { t } = useTranslation("settings");
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      {checked !== saved && (
        <span className="text-xs font-normal text-warning-text" data-testid={testId && `${testId}-unsaved`}>
          {t("email.unsaved")}
        </span>
      )}
      <Badge variant={checked ? "success" : "outline"}>{checked ? t("email.on") : t("email.off")}</Badge>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} data-testid={testId} />
    </label>
  );
}

/** One switch per event. `extra` adds a control under an event's description. */
export function EventSwitches({
  events,
  selected,
  onChange,
  readOnly,
  extra,
}: {
  events: NotificationEventSetting[];
  selected: Record<string, boolean>;
  onChange: (selected: Record<string, boolean>) => void;
  readOnly: boolean;
  extra?: (eventId: string) => ReactNode;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="divide-y divide-border/60 border border-border">
      {events.map((event) => {
        const name = t(`email.events.names.${event.id}`, { defaultValue: event.name });
        return (
          <div key={event.id} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{name}</span>
                <code className="text-[11px] text-muted-foreground">{event.id}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(`email.events.descriptions.${event.id}`, { defaultValue: event.description })}
              </p>
              {extra?.(event.id)}
            </div>
            <Switch
              checked={selected[event.id] ?? event.enabled}
              onCheckedChange={(on) => onChange({ ...selected, [event.id]: on })}
              disabled={readOnly}
              aria-label={name}
            />
          </div>
        );
      })}
    </div>
  );
}

export type DeliveryStatus = "queued" | "retrying" | "sent" | "failed" | "cancelled";

export interface HistoryItem {
  id: string;
  at: string | null;
  status: DeliveryStatus;
  statusLabel: string;
  subject: string;
  /** Shown beside the subject: an exit code, how long it took. */
  aside?: string;
  error: { code: string; message: string } | null;
  retryAt?: string | null;
  /** What a script printed. */
  output?: string | null;
}

const STATUS_VARIANT = { sent: "success", failed: "danger", retrying: "warning", queued: "info", cancelled: "outline" } as const;

export function HistoryList({ title, empty, items }: { title: string; empty: string; items: HistoryItem[] }) {
  const { t } = useTranslation("settings");
  return (
    <div className="space-y-2">
      <h3 className="label-overline flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" aria-hidden />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/60 border border-border" data-testid="notification-history">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-xs">
              <DateTime value={item.at} className="shrink-0 text-muted-foreground" />
              <Badge variant={STATUS_VARIANT[item.status]}>{item.statusLabel}</Badge>
              <span className="min-w-0 flex-1 truncate" title={item.subject}>
                {item.subject}
              </span>
              {item.aside && <span className="nums shrink-0 text-muted-foreground">{item.aside}</span>}
              {item.error && (
                <span className="basis-full text-danger-text">
                  <code>{item.error.code}</code>: {item.error.message}
                  {item.retryAt && (
                    <>
                      {" "}
                      {t("email.history.retryAt")} <DateTime value={item.retryAt} />
                    </>
                  )}
                </span>
              )}
              {item.output && (
                <details className="basis-full">
                  <summary className="cursor-pointer text-muted-foreground">{t("script.history.output")}</summary>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words bg-muted/30 p-2 font-mono text-[11px]">
                    {item.output}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
