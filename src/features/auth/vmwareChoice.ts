// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The VMware access choice after sign-in (see VmwareAccessPage): where it
 * lives, and the session flag "Decide later" sets so AppShell's gate does not
 * send the user straight back. Session-scoped on purpose, like the setup
 * wizard's skip: the next session asks again while nobody has saved a choice,
 * as `abr auth login` reminds on every sign-in.
 */
export const VMWARE_CHOICE_PATH = "/vmware-access";

const SKIPPED_KEY = "abr.vmwareChoiceSkipped";

export function markVmwareChoiceSkipped(): void {
  try {
    sessionStorage.setItem(SKIPPED_KEY, "1");
  } catch {
    /* blocked storage: the gate asks again on the next load */
  }
}

export function isVmwareChoiceSkipped(): boolean {
  try {
    return sessionStorage.getItem(SKIPPED_KEY) === "1";
  } catch {
    return false;
  }
}
