// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { ComponentType } from "react";
import type { Hypervisor } from "@/types";
import { ProxmoxLogo, WindowsLogo } from "@/lib/icons";

export type PlatformLogo = ComponentType<{ className?: string }>;

/**
 * VMware "boxes" mark — a clean 2×2 grid of rounded squares. Clearer at small
 * sizes than the "vm" wordmark, which also literally reads as "virtual machine".
 */
function VmwareBoxes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden focusable="false">
      <rect x="3" y="3" width="7.6" height="7.6" rx="1.7" />
      <rect x="13.4" y="3" width="7.6" height="7.6" rx="1.7" />
      <rect x="3" y="13.4" width="7.6" height="7.6" rx="1.7" />
      <rect x="13.4" y="13.4" width="7.6" height="7.6" rx="1.7" />
    </svg>
  );
}

/** Per-platform brand mark, shown as a small chip on hosts & clusters. */
export const PLATFORM_LOGO: Record<Hypervisor, PlatformLogo> = {
  vmware: VmwareBoxes,
  hyperv: WindowsLogo,
  proxmox: ProxmoxLogo,
};
