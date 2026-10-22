// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "@/lib/icons";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Accessible names of the toggle, for a secret that isn't a password. */
  showLabel?: string;
  hideLabel?: string;
};

/**
 * A password field with an eye button that shows what was typed. It starts
 * hidden on every mount, so reopening a dialog never shows a secret by itself.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, showLabel, hideLabel, ...props }, ref) => {
    const { t } = useTranslation("common");
    const [revealed, setRevealed] = React.useState(false);
    const label = revealed ? (hideLabel ?? t("passwordInput.hide")) : (showLabel ?? t("passwordInput.show"));
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={revealed ? "text" : "password"}
          disabled={disabled}
          // Edge draws its own reveal button inside password fields, which
          // would sit next to this one.
          className={cn("pr-9 [&::-ms-reveal]:hidden", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={label}
          title={label}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
