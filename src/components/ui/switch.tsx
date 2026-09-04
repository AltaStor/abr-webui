// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-250 disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    {...props}
    ref={ref}
  >
    {/* The knob carries no shadow, so its fill has to invert against whichever
        track is under it: page ink when off, accent ink when on. A single fixed
        colour disappears into the accent track in one theme or the other. */}
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full transition-[transform,background-color] duration-250",
        "data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground",
        "data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-foreground",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = "Switch";
