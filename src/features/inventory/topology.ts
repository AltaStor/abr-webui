// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import type { Environment, Host, Hypervisor, VM } from "@/types";
import { PLATFORM_META } from "@/lib/platform";

export type NodeKind = "platform" | "datacenter" | "cluster" | "host" | "vm";

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

/** Physical vs. allocated compute for a node — the infrastructure-native signal. */
export interface Capacity {
  /** Physical CPU cores across the hosts under this node. */
  pCores: number;
  /** Allocated (sum of guest) vCPUs. */
  vCpu: number;
  /** Physical memory, GB. */
  pMem: number;
  /** Allocated (sum of guest) memory, GB. */
  vMem: number;
  /** Guest used storage, GB. */
  usedGB: number;
  hosts: number;
  online: number;
  maintenance: number;
  disconnected: number;
}

const EMPTY_CAPACITY: Capacity = {
  pCores: 0,
  vCpu: 0,
  pMem: 0,
  vMem: 0,
  usedGB: 0,
  hosts: 0,
  online: 0,
  maintenance: 0,
  disconnected: 0,
};

function hostCapacity(host: Host, hostVms: VM[]): Capacity {
  return {
    pCores: host.cpuCores,
    vCpu: hostVms.reduce((a, v) => a + v.vcpus, 0),
    pMem: host.memoryGB,
    vMem: hostVms.reduce((a, v) => a + v.memoryGB, 0),
    usedGB: hostVms.reduce((a, v) => a + v.usedGB, 0),
    hosts: 1,
    online: host.status === "online" ? 1 : 0,
    maintenance: host.status === "maintenance" ? 1 : 0,
    disconnected: host.status === "disconnected" ? 1 : 0,
  };
}

function mergeCapacity(parts: Capacity[]): Capacity {
  return parts.reduce<Capacity>(
    (acc, c) => ({
      pCores: acc.pCores + c.pCores,
      vCpu: acc.vCpu + c.vCpu,
      pMem: acc.pMem + c.pMem,
      vMem: acc.vMem + c.vMem,
      usedGB: acc.usedGB + c.usedGB,
      hosts: acc.hosts + c.hosts,
      online: acc.online + c.online,
      maintenance: acc.maintenance + c.maintenance,
      disconnected: acc.disconnected + c.disconnected,
    }),
    { ...EMPTY_CAPACITY },
  );
}

/** A normalized node so one recursive component can render the whole tree. */
export interface TreeNode {
  key: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  roll: Rollup;
  children: TreeNode[];
  /** Populated on leaf (vm) and host nodes for richer rendering. */
  vm?: VM;
  host?: Host;
  hypervisor?: Hypervisor;
  /** Physical vs allocated compute — on platform/datacenter/cluster/host nodes. */
  capacity?: Capacity;
  /** The owning environment — on datacenter nodes, for connectivity + version. */
  environment?: Environment;
  /** Count of immediate compute nodes under this node (for "N hosts" labels). */
  hostCount?: number;
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
 * Build the Platform → Datacenter → Cluster → Host → VM tree.
 * Environment = the datacenter/site (managed by its vCenter endpoint); the
 * hypervisor it runs is the platform grouping at the top.
 */
export function buildTree(environments: Environment[], hosts: Host[], vms: VM[]): TreeNode[] {
  const vmsByHost = groupBy(vms, (v) => v.hostId);
  const hostsByEnv = groupBy(hosts, (h) => h.environmentId);
  const envsByPlatform = groupBy(environments, (e) => e.hypervisor);

  const platforms: TreeNode[] = [];

  for (const [hypervisor, envs] of envsByPlatform) {
    const platformVms: VM[] = [];
    const platformCaps: Capacity[] = [];
    const datacenters: TreeNode[] = [];

    for (const env of envs) {
      const envHosts = hostsByEnv.get(env.id) ?? [];
      const hostsByCluster = groupBy(envHosts, (h) => h.cluster);
      const dcVms: VM[] = [];
      const dcCaps: Capacity[] = [];
      const clusters: TreeNode[] = [];

      for (const [clusterName, clusterHosts] of hostsByCluster) {
        const clusterVms: VM[] = [];
        const clusterCaps: Capacity[] = [];
        const hostNodes: TreeNode[] = [];

        for (const host of clusterHosts.slice().sort((a, b) => a.name.localeCompare(b.name))) {
          const hostVms = vmsByHost.get(host.id) ?? [];
          const cap = hostCapacity(host, hostVms);
          clusterVms.push(...hostVms);
          clusterCaps.push(cap);
          hostNodes.push({
            key: host.id,
            kind: "host",
            label: host.name,
            roll: rollup(hostVms),
            host,
            hypervisor,
            capacity: cap,
            children: hostVms
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((vm) => ({
                key: vm.id,
                kind: "vm" as const,
                label: vm.name,
                sublabel: vm.guestOs,
                roll: rollup([vm]),
                vm,
                children: [],
              })),
          });
        }

        const clusterCap = mergeCapacity(clusterCaps);
        dcVms.push(...clusterVms);
        dcCaps.push(clusterCap);
        clusters.push({
          key: `${env.id}::${clusterName}`,
          kind: "cluster",
          label: clusterName,
          sublabel: `${hostNodes.length} ${PLATFORM_META[hypervisor].hostTermPlural}`,
          roll: rollup(clusterVms),
          capacity: clusterCap,
          hostCount: hostNodes.length,
          children: hostNodes,
        });
      }

      const dcCap = mergeCapacity(dcCaps);
      platformVms.push(...dcVms);
      platformCaps.push(dcCap);
      datacenters.push({
        key: env.id,
        kind: "datacenter",
        label: env.name,
        sublabel: `${env.endpoint} · ${env.version}`,
        roll: rollup(dcVms),
        capacity: dcCap,
        environment: env,
        hostCount: envHosts.length,
        children: clusters.sort((a, b) => a.label.localeCompare(b.label)),
      });
    }

    platforms.push({
      key: `platform-${hypervisor}`,
      kind: "platform",
      label: PLATFORM_META[hypervisor].label,
      sublabel: `${datacenters.length} ${datacenters.length === 1 ? "datacenter" : "datacenters"}`,
      roll: rollup(platformVms),
      capacity: mergeCapacity(platformCaps),
      hypervisor,
      children: datacenters.sort((a, b) => a.label.localeCompare(b.label)),
    });
  }

  // VMware first, then others.
  return platforms.sort((a, b) => (a.hypervisor === "vmware" ? -1 : b.hypervisor === "vmware" ? 1 : 0));
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
    platform: env ? PLATFORM_META[env.hypervisor].label : "Unknown platform",
    datacenter: env?.name ?? vm.environmentId,
    cluster: host?.cluster ?? "—",
    host: host?.name ?? vm.hostId,
  };
}
