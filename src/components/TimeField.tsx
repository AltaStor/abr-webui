// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A 24-hour time-of-day field.
 *
 * Deliberately NOT `<input type="time">`: the native control renders in the
 * browser's own locale, so on a 12-hour browser it shows "8:41 PM" while every
 * other timestamp this app prints — `formatClock`, `formatDateTime`,
 * `formatFullDateTime`, the schedule labels — is 24-hour. That mismatch is not
 * fixable on the native input: neither the `lang` attribute nor any CSS
 * overrides its format, it follows the browser/OS regional setting alone. So
 * the field is built from plain numeric inputs, which render exactly what they
 * are given and keep the whole app on one clock.
 *
 * The value contract matches the native input exactly — a "HH:MM" 24-hour
 * string in and out — so callers are unaffected by the swap.
 */
export interface TimeFieldProps {
  /** "HH:MM", 24-hour. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Accessible names for the two segments. */
  hourLabel?: string;
  minuteLabel?: string;
}

/** Split "HH:MM" into numbers, tolerating partial/garbage input. */
function parse(value: string): { h: number; m: number } {
  const [rawH, rawM] = (value ?? "").split(":");
  const h = Number.parseInt(rawH ?? "", 10);
  const m = Number.parseInt(rawM ?? "", 10);
  return {
    h: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0,
    m: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

const pad = (n: number) => n.toString().padStart(2, "0");

export function TimeField({
  value,
  onChange,
  id,
  className,
  disabled,
  hourLabel = "Hour",
  minuteLabel = "Minute",
}: TimeFieldProps) {
  const { h, m } = parse(value);
  // While a segment is focused the user may legitimately have typed "" or "1"
  // on the way to "14", so the raw keystrokes are held here and only
  // normalised back to a padded value on blur. Committing every keystroke
  // straight to `value` would rewrite "1" to "01" under the cursor.
  const [draft, setDraft] = React.useState<{ part: "h" | "m"; text: string } | null>(null);

  const commit = (nextH: number, nextM: number) => {
    onChange(`${pad(Math.min(23, Math.max(0, nextH)))}:${pad(Math.min(59, Math.max(0, nextM)))}`);
  };

  const segment = (part: "h" | "m") => {
    const max = part === "h" ? 23 : 59;
    const current = part === "h" ? h : m;
    const shown = draft?.part === part ? draft.text : pad(current);

    return (
      <input
        id={part === "h" ? id : undefined}
        aria-label={part === "h" ? hourLabel : minuteLabel}
        inputMode="numeric"
        // `type="text"` rather than `number`: a number input adds its own
        // spinners and lets the browser accept "1e3" / "-5", both of which are
        // meaningless for a clock segment.
        type="text"
        maxLength={2}
        disabled={disabled}
        value={shown}
        onFocus={(e) => {
          setDraft({ part, text: shown });
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const text = e.target.value.replace(/\D/g, "").slice(0, 2);
          setDraft({ part, text });
          if (text !== "") {
            const n = Math.min(max, Number.parseInt(text, 10));
            commit(part === "h" ? n : h, part === "m" ? n : m);
          }
        }}
        onBlur={() => {
          setDraft(null);
          commit(h, m); // re-pad whatever the draft left behind
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          // Wrap rather than clamp: stepping past midnight or the hour is what
          // someone spinning through a clock expects.
          const step = e.key === "ArrowUp" ? 1 : -1;
          const next = (current + step + (max + 1)) % (max + 1);
          setDraft(null);
          commit(part === "h" ? next : h, part === "m" ? next : m);
        }}
        className="w-7 bg-transparent text-center tabular-nums outline-none disabled:cursor-not-allowed"
      />
    );
  };

  return (
    <div
      className={cn(
        "flex h-9 items-center rounded-lg border border-input bg-background/40 px-3 text-sm shadow-sm transition-colors",
        "focus-within:border-ring/40 focus-within:ring-2 focus-within:ring-ring",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {segment("h")}
      <span aria-hidden className="px-0.5 text-muted-foreground">
        :
      </span>
      {segment("m")}
    </div>
  );
}
