// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Plus, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";

/* ----------------------------------------------------------------------------
 * Segmented control — a pill group of mutually-exclusive options.
 * -------------------------------------------------------------------------- */

interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  "aria-label": string;
  className?: string;
  size?: "sm" | "md";
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  ...rest
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={rest["aria-label"]}
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-lg border border-border/70 bg-muted/40 p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Chip-list editor — add/remove string entries (emails, DNS, NTP servers).
 * -------------------------------------------------------------------------- */

interface ChipListProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  /** Screen-reader label for the add field. */
  ariaLabel: string;
  /** Optional validator; return false to reject a candidate. */
  validate?: (value: string) => boolean;
  className?: string;
  inputClassName?: string;
}

export function ChipList({
  values,
  onChange,
  placeholder,
  ariaLabel,
  validate,
  className,
  inputClassName,
}: ChipListProps) {
  const { t } = useTranslation("settings");
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    if (validate && !validate(v)) return;
    onChange([...values, v]);
    setDraft("");
  };

  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const valid = !validate || draft.trim() === "" || validate(draft.trim());

  return (
    <div className={cn("space-y-2", className)}>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="nums inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 py-0.5 pl-2 pr-1 text-xs text-foreground"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={t("controls.removeItem", { value: v })}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger-text"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={cn("h-9", !valid && "border-danger/60 focus-visible:ring-danger/40", inputClassName)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          disabled={!draft.trim() || !valid}
          aria-label={ariaLabel}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Save bar — sticky footer for a draft section. Shows an "Unsaved changes"
 * hint and Discard / Save buttons.
 * -------------------------------------------------------------------------- */

interface SaveBarProps {
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Disable Save (e.g. failed validation) even when dirty. */
  saveDisabled?: boolean;
}

export function SaveBar({ dirty, onSave, onDiscard, saveDisabled }: SaveBarProps) {
  const { t } = useTranslation("settings");
  /* Every section's save funnels through here, so the offline gate does too:
   * when the last `GET /settings` failed, the values on screen are shipped
   * defaults or a browser cache, not the appliance's configuration. Saving one
   * edited field would PUT the whole stand-in over what the appliance really
   * holds. Discard stays live — it only restores the draft. */
  const offline = useSettingsStore((s) => s.syncStatus === "unreachable");
  return (
    <>
      <span
        className={cn(
          "mr-auto inline-flex items-center gap-1.5 text-xs font-medium transition-opacity",
          offline
            ? "text-danger-text opacity-100"
            : dirty
              ? "text-warning-text opacity-100"
              : "text-muted-foreground opacity-0",
        )}
        aria-live="polite"
      >
        {offline ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
          </span>
        )}
        {offline ? t("controls.saveUnavailable") : t("controls.unsavedChanges")}
      </span>
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={!dirty}>
        {t("common:actions.discard")}
      </Button>
      <Button size="sm" onClick={onSave} disabled={!dirty || saveDisabled || offline}>
        <Check className="h-3.5 w-3.5" />
        {t("controls.saveChanges")}
      </Button>
    </>
  );
}
