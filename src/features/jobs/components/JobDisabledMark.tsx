import { Power } from "@/lib/icons";
import { JOB_DISABLED_META } from "@/lib/status";
import { cn } from "@/lib/utils";

interface JobDisabledMarkProps {
  /** Drop the word where the row already prints it in another column. */
  showLabel?: boolean;
  className?: string;
}

/**
 * "This job is switched off", as a bare icon and word rather than a `StatusPill`.
 *
 * The pill sat on the first line of a two-line name cell, which parked its box
 * half a line above every other chip in the row — and it announced in a box what
 * the row now says by going quiet all the way across. Without the box there is
 * nothing left to misalign: the mark shares the name's baseline. It stays at all
 * because the quiet alone would leave enablement carried by colour, and a marker
 * that survives greyscale is the point of keeping one.
 */
export function JobDisabledMark({ showLabel = true, className }: JobDisabledMarkProps) {
  const label = JOB_DISABLED_META.label;
  return (
    <span
      title={showLabel ? undefined : label}
      className={cn(
        "flex shrink-0 items-center gap-1 font-normal text-muted-foreground",
        showLabel && "text-xs",
        className,
      )}
    >
      <Power className="h-3.5 w-3.5" aria-hidden="true" />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  );
}
