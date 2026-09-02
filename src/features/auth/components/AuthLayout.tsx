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
      <div className="brand-gradient h-0.5" />
      <div
        aria-hidden
        className="basalt-lattice pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(60% 100% at 50% 0%, hsl(199 60% 62% / 0.4), transparent 70%)",
        }}
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
