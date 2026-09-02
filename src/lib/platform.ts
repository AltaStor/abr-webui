// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { Hypervisor } from "@/types";

export interface PlatformMeta {
  /** Full platform name shown at the top of the topology. */
  label: string;
  /** Compact name for chips/labels. */
  short: string;
  /** What a compute node is called on this platform. */
  hostTerm: string;
  hostTermPlural: string;
}

export const PLATFORM_META: Record<Hypervisor, PlatformMeta> = {
  vmware: { label: "VMware vSphere", short: "vSphere", hostTerm: "host", hostTermPlural: "hosts" },
  proxmox: { label: "Proxmox VE", short: "Proxmox", hostTerm: "node", hostTermPlural: "nodes" },
  hyperv: { label: "Microsoft Hyper-V", short: "Hyper-V", hostTerm: "host", hostTermPlural: "hosts" },
};
