// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Shared full-screen shell for the console's own auth pages (login, forced
 * password change) — outside AppShell, same brand treatment as the first-boot
 * Setup wizard (hairline + basalt lattice + centered card) but respects the
 * user's light/dark preference instead of forcing dark: unlike Setup, which
 * fires once on an unconfigured appliance, sign-in is a page people land on
 * every day.
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "@/lib/icons";
import { Logo } from "@/components/brand/Logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="h-px bg-primary" />
      <div
        aria-hidden
        className="basalt-lattice pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
      />
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Logo className="mb-8" />
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1.5 text-center">
            <CardTitle className="text-xl">{title}</CardTitle>
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer && <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * The refusal notice both auth screens use.
 *
 * `title` and `body` are the console's own translated copy; `detail` is
 * whatever the appliance said, and stays subordinate to both — it is raw
 * English from the orchestrator, so it can never be the sentence a French or
 * German operator reads first.
 */
export function AuthFailureNotice({
  title,
  body,
  detail,
}: {
  title: string;
  body: string;
  detail?: string | null;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 border border-danger/30 bg-danger-subtle px-3 py-2.5"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="min-w-0 space-y-1">
        <p className="font-display text-sm font-semibold text-danger-text">{title}</p>
        <p className="text-xs leading-relaxed text-danger-text/90">{body}</p>
        {detail && <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
