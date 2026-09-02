// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Session flag set by the wizard's "Skip wizard" link so AppShell's first-boot
 * gate doesn't bounce an unconfigured appliance straight back to /setup.
 * Session-scoped on purpose: the next visit gets the wizard again.
 */
export const SETUP_SKIPPED_KEY = "basalt.setup-skipped";

export function markSetupSkipped(): void {
  sessionStorage.setItem(SETUP_SKIPPED_KEY, "1");
}

export function isSetupSkipped(): boolean {
  return sessionStorage.getItem(SETUP_SKIPPED_KEY) === "1";
}
