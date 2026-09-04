// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * Is this host in a failover cluster, or on its own?
 *
 * One rule, in one place, because the answer is read from three unrelated
 * angles — the estate tree's cluster tier, a VM's location breadcrumb, and
 * which storage a restore can land on — and a host that counts as clustered in
 * one of them and standalone in another is a bug nobody sees until a restore
 * offers a cluster shared volume on a machine that has none.
 *
 * `Host.cluster` is a plain string with no null: the Hyper-V registration
 * writes the literal "standalone" when `Get-Cluster` is absent or the host is
 * not a member, and the demo world / vSphere path writes "Standalone" for a
 * lone ESXi host. Both are SENTINELS, not names — an estate that renders them
 * as a cluster tier invents a cluster, which is exactly the fiction that got
 * tolerated while a Hyper-V environment could only ever hold one host.
 */
import type { Host } from "@/types";

/** The value that means "this host belongs to no cluster", case-insensitively. */
export const NO_CLUSTER = "standalone";

/**
 * The real cluster this host belongs to, or null when it stands alone.
 * Empty/whitespace counts as standalone too: an appliance that simply never
 * filled the field must not produce a cluster named "".
 */
export function clusterOf(host: Pick<Host, "cluster">): string | null {
  const name = (host.cluster ?? "").trim();
  if (name === "" || name.toLowerCase() === NO_CLUSTER) return null;
  return name;
}

