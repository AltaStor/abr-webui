// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Clock } from "@/lib/icons";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* A 24-hour time field.
 *
 * `<input type="time">` hands the dropdown to the browser: a rounded grey panel
 * with its own type ramp and its own blue selection, drawn over a console that
 * has none of those things. It cannot be styled — so the field is drawn here
 * instead, from the same primitives as every other control.
 *
 * The value is always canonical "HH:MM" 24-hour, which is what the schedule
 * types store; the text box is forgiving about how you reach it. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Reads what people actually type — "9", "930", "9.30", "09:3", " 9 30 " —
 *  and returns canonical "HH:MM", or null when no reading makes sense. */
export function parseTimeValue(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  let h: number;
  let m: number;
  const separated = /^(\d{1,2})\s*[:.\-\s]\s*(\d{1,2})$/.exec(s);
  if (separated) {
    h = Number(separated[1]);
    m = Number(separated[2]);
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    m = 0;
  } else if (/^\d{3}$/.test(s)) {
    h = Number(s.slice(0, 1));
    m = Number(s.slice(1));
  } else if (/^\d{4}$/.test(s)) {
    h = Number(s.slice(0, 2));
    m = Number(s.slice(2));
  } else {
    return null;
  }

  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Row height in px (`h-8`). The column is an exact six rows tall so that a
 *  scrolled column never shows a half row, and both columns stay in register. */
const ROW_HEIGHT = 32;

export interface TimeFieldProps {
  /** Canonical "HH:MM", 24-hour. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Minute granularity offered in the picker. Typing is never held to it. */
  minuteStep?: number;
  "aria-label"?: string;
}

export function TimeField({
  value,
  onChange,
  id,
  className,
  disabled,
  minuteStep = 5,
  "aria-label": ariaLabel,
}: TimeFieldProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The draft only diverges from `value` while someone is mid-edit, and nothing
  // is committed until they leave or press Enter — so an incoming value is
  // always the authority.
  React.useEffect(() => setDraft(value), [value]);

  const parsed = parseTimeValue(value);
  const selectedHour = parsed ? Number(parsed.slice(0, 2)) : null;
  const selectedMinute = parsed ? Number(parsed.slice(3)) : null;

  const minutes = React.useMemo(() => {
    const step = Math.min(Math.max(Math.round(minuteStep), 1), 30);
    const list: number[] = [];
    for (let m = 0; m < 60; m += step) list.push(m);
    // A value typed off the step still has to be visible as the selected row.
    if (selectedMinute !== null && !list.includes(selectedMinute)) {
      list.push(selectedMinute);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [minuteStep, selectedMinute]);

  const commit = (raw: string) => {
    const next = parseTimeValue(raw);
    if (!next) {
      setDraft(value); // unreadable — fall back rather than write nonsense
      return;
    }
    setDraft(next);
    if (next !== value) onChange(next);
  };

  /** Nudges the whole time, wrapping across midnight. */
  const nudge = (deltaMinutes: number) => {
    const base = parseTimeValue(draft) ?? parsed ?? "00:00";
    const total = Number(base.slice(0, 2)) * 60 + Number(base.slice(3));
    const next = (((total + deltaMinutes) % 1440) + 1440) % 1440;
    const formatted = `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
    setDraft(formatted);
    if (formatted !== value) onChange(formatted);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const magnitude = event.shiftKey ? 60 : Math.max(Math.round(minuteStep), 1);
      nudge(event.key === "ArrowUp" ? magnitude : -magnitude);
    } else if (event.key === "Enter") {
      // The field lives inside the job wizard's form; committing must not submit it.
      event.preventDefault();
      commit(event.currentTarget.value);
      setOpen(false);
    } else if (event.key === "Escape" && !open) {
      setDraft(value);
    }
  };

  const setHour = (hour: number) => {
    const minute = selectedMinute ?? 0;
    commit(`${pad(hour)}:${pad(minute)}`);
  };

  const setMinute = (minute: number) => {
    const hour = selectedHour ?? 0;
    commit(`${pad(hour)}:${pad(minute)}`);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <input
            id={id}
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={5}
            disabled={disabled}
            value={draft}
            aria-label={ariaLabel}
            placeholder="--:--"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={onInputKeyDown}
            className={cn(
              "nums flex h-9 w-full border border-input bg-background/40 py-1 pl-3 pr-9 text-sm transition-colors duration-250",
              "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t("timeField.openPicker")}
              title={t("timeField.openPicker")}
              className={cn(
                "absolute right-0 top-0 flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors duration-250",
                "hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                open && "text-foreground",
              )}
            >
              <Clock className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex divide-x divide-border">
          <TimeColumn
            label={t("timeField.hour")}
            values={HOURS}
            selected={selectedHour}
            onSelect={setHour}
            autoFocus
          />
          <TimeColumn
            label={t("timeField.minute")}
            values={minutes}
            selected={selectedMinute}
            onSelect={setMinute}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
  autoFocus,
}: {
  label: string;
  values: number[];
  selected: number | null;
  onSelect: (value: number) => void;
  autoFocus?: boolean;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Open on the current value rather than at midnight, three rows down so its
  // neighbours are visible. The offset is set in whole rows, not by
  // scrollIntoView: a fractional scroll leaves the two columns' rows a few
  // pixels out of step with each other, which reads as a misprint.
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const index = selected === null ? 0 : Math.max(values.indexOf(selected), 0);
    list.scrollTop = Math.max(0, (index - 2) * ROW_HEIGHT);
    if (autoFocus) {
      list.querySelectorAll<HTMLButtonElement>("[role=option]")[index]?.focus({ preventScroll: true });
    }
    // Mount only: re-running would yank the scroll back while someone is browsing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const target =
      event.key === "ArrowDown" ? options[Math.min(index + 1, options.length - 1)]
      : event.key === "ArrowUp" ? options[Math.max(index - 1, 0)]
      : event.key === "Home" ? options[0]
      : event.key === "End" ? options[options.length - 1]
      : null;
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.scrollIntoView({ block: "nearest" });
  };

  // One stop per column in the tab order — the arrow keys walk the rest.
  const tabbable = selected === null ? 0 : Math.max(values.indexOf(selected), 0);

  return (
    <div className="flex flex-col">
      <div className="label-overline border-b border-border px-3 py-2 text-center">{label}</div>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="h-48 w-[4.5rem] overflow-y-auto"
      >
        {values.map((entry, index) => {
          const isSelected = entry === selected;
          return (
            <button
              key={entry}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-selected={isSelected || undefined}
              tabIndex={index === tabbable ? 0 : -1}
              onClick={() => onSelect(entry)}
              className={cn(
                "nums flex h-8 w-full items-center justify-center text-sm transition-colors duration-250",
                isSelected
                  ? "bg-primary/15 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {pad(entry)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
