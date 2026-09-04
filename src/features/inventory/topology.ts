// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { Environment, Host, Hypervisor, VM } from "@/types";
import i18n from "@/i18n";
import { PLATFORM_META } from "@/lib/platform";
import { clusterOf } from "@/lib/cluster";

export type NodeKind = "datacenter" | "cluster" | "host" | "vm";

export interface Rollup {
  total: number;
  protected: number;
  warning: number;
  unprotected: number;
  /** % of VMs protected, 0–100. */
  coverage: number;
}

export function rollup(vms: VM[]): Rollup {
  const protectedCount = vms.filter((v) => v.protection === "protected").length;
  return {
    total: vms.length,
    protected: protectedCount,
    warning: vms.filter((v) => v.protection === "warning").length,
    unprotected: vms.filter((v) => v.protection === "unprotected").length,
    coverage: vms.length ? (protectedCount / vms.length) * 100 : 0,
  };
}

/** A normalized node so one recursive component can render the whole tree. */
export interface TreeNode {
  key: string;
  kind: NodeKind;
  label: string;
  roll: Rollup;
  children: TreeNode[];
  /** Populated on leaf (vm) and host nodes for richer rendering. */
  vm?: VM;
  host?: Host;
  hypervisor?: Hypervisor;
  /** The owning environment — on datacenter nodes, for connectivity + version. */
  environment?: Environment;
}

function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = map.get(k);
    if (arr) arr.push(it);
    else map.set(k, [it]);
  }
  return map;
}

/**
 * Build the Datacenter → Cluster → Host → VM tree.
 *
 * No platform tier. Grouping by hypervisor at the top reads as structure the
 * estate does not have: a site can mix platforms, and on this orchestrator —
 * which registers vCenter and standalone ESXi, both VMware — it can only ever
 * produce ONE such node wrapping everything, costing a row and a click to say
 * something every child already says. Platform is an attribute of a host, so it
 * rides on the node's icon (see `PLATFORM_LOGO`), never on the hierarchy.
 *
 * A host with no real cluster becomes a direct child of its datacenter rather
 * than being filed under an invented one: `clusterOf` treats "Standalone" as
 * the sentinel it is.
 */
export function buildTree(environments: Environment[], hosts: Host[], vms: VM[]): TreeNode[] {
  const vmsByHost = groupBy(vms, (v) => v.hostId);
  const hostsByEnv = groupBy(hosts, (h) => h.environmentId);

  const hostNode = (host: Host, hypervisor: Hypervisor): TreeNode => {
    const hostVms = vmsByHost.get(host.id) ?? [];
    return {
      key: host.id,
      kind: "host",
      label: host.name,
      roll: rollup(hostVms),
      host,
      hypervisor,
      children: hostVms
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((vm) => ({
          key: vm.id,
          kind: "vm" as const,
          label: vm.name,
          roll: rollup([vm]),
          vm,
          children: [],
        })),
    };
  };

  const datacenters: TreeNode[] = [];

  for (const env of environments) {
    const hypervisor = env.hypervisor;
    const envHosts = (hostsByEnv.get(env.id) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const dcVms: VM[] = [];
    const clusters: TreeNode[] = [];
    const loneHosts: TreeNode[] = [];

    // One pass: a host either joins its cluster's bucket or becomes a direct
    // child of the datacenter. Insertion order is the name-sorted host order,
    // so the clusters come out deterministically before their final sort.
    const hostsByCluster = new Map<string, Host[]>();
    for (const host of envHosts) {
      const cluster = clusterOf(host);
      if (cluster !== null) {
        const bucket = hostsByCluster.get(cluster);
        if (bucket) bucket.push(host);
        else hostsByCluster.set(cluster, [host]);
        continue;
      }
      dcVms.push(...(vmsByHost.get(host.id) ?? []));
      loneHosts.push(hostNode(host, hypervisor));
    }

    for (const [clusterName, clusterHosts] of hostsByCluster) {
      const clusterVms: VM[] = [];
      const hostNodes: TreeNode[] = [];
      for (const host of clusterHosts) {
        clusterVms.push(...(vmsByHost.get(host.id) ?? []));
        hostNodes.push(hostNode(host, hypervisor));
      }
      dcVms.push(...clusterVms);
      clusters.push({
        key: `${env.id}::${clusterName}`,
        kind: "cluster",
        label: clusterName,
        roll: rollup(clusterVms),
        hypervisor,
        children: hostNodes,
      });
    }

    datacenters.push({
      key: env.id,
      kind: "datacenter",
      label: env.name,
      roll: rollup(dcVms),
      environment: env,
      hypervisor,
      // Clusters first, then the hosts that belong to none — a real grouping
      // outranks a bare machine at the same level.
      children: [
        ...clusters.sort((a, b) => a.label.localeCompare(b.label)),
        ...loneHosts,
      ],
    });
  }

  return datacenters.sort((a, b) => a.label.localeCompare(b.label));
}

/** VM ids under a node (its whole subtree) — the scope for the VM list when a
 *  tree node is selected in the estate navigator. */
export function collectVmIds(node: TreeNode, acc: string[] = []): string[] {
  if (node.kind === "vm" && node.vm) acc.push(node.vm.id);
  for (const c of node.children) collectVmIds(c, acc);
  return acc;
}

export interface VmLocation {
  platform: string;
  datacenter: string;
  cluster: string;
  host: string;
}

/** The full placement path for a single VM — used on the VM detail page. */
export function vmLocation(vm: VM, hosts: Host[], environments: Environment[]): VmLocation {
  const host = hosts.find((h) => h.id === vm.hostId);
  const env = environments.find((e) => e.id === vm.environmentId);
  return {
    platform: env
      ? PLATFORM_META[env.hypervisor].label
      : i18n.t("inventory:vmDetail.unknownPlatform"),
    datacenter: env?.name ?? vm.environmentId,
    cluster: host?.cluster ?? "—",
    host: host?.name ?? vm.hostId,
  };
}
