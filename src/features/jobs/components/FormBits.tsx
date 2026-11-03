// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/* Small pieces of the job forms, shared by the backup job and the backup copy
 * job fields so the two read and behave alike. */
import { useTranslation } from "react-i18next";
import { Clock, HelpCircle } from "@/lib/icons";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Small info affordance: a focusable, keyboard-reachable icon with a plain-language definition. */
export function HelpHint({ label, term }: { label: string; term: string }) {
  const { t } = useTranslation("jobs");
  return (
    <Hint label={label}>
      <button
        type="button"
        aria-label={t("create.whatIs", { term })}
        className="inline-flex shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    </Hint>
  );
}

export function PresetChip({
  icon: Icon,
  label,
  sub,
  active,
  onClick,
  disabled = false,
}: {
  icon: typeof Clock;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start gap-0.5 border p-3 text-left transition-colors",
        active ? "border-primary/40 bg-primary/10" : "border-border hover:border-border hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")} />
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground">{sub}</span>
    </button>
  );
}

export function ToggleRow({
  label,
  hint,
  help,
  helpTerm,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  /** Plain-language definition surfaced via an info tooltip next to the label. */
  help?: string;
  helpTerm?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start justify-between gap-3 border border-border bg-muted/20 p-3",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          {help && <HelpHint label={help} term={helpTerm ?? label} />}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled} />
    </label>
  );
}
