// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/** Consistent title block at the top of every wizard step. */
export function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 space-y-1">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
