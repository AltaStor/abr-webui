// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Cluster, MapPin, MoreHorizontal, Pencil, RefreshCw, Trash2, Tower, type LucideIcon } from "@/lib/icons";
import { PLATFORM_LOGO } from "@/lib/platform-glyphs";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Environment, HostStatus } from "@/types";
import type { NodeKind, Rollup, TreeNode } from "../topology";
import { useCan } from "@/store/permissions";

const KIND_ICON: Record<Exclude<NodeKind, "vm">, LucideIcon> = {
  datacenter: MapPin,
  cluster: Cluster,
  host: Tower,
};

/**
 * A node's icon: the base glyph says WHAT it is — a site, a cluster, a host —
 * and the platform logo rides it as a corner chip on clusters and hosts.
 *
 * Platform used to be a tree tier instead. As structure it was misleading (a
 * site can mix platforms) and, on this orchestrator, vacuous: it registers
 * vCenter and standalone ESXi, both VMware, so the tier could only ever be one
 * node wrapping the whole estate. As a mark it is what it always was — an
 * attribute of the machine. A datacenter carries no chip: its children may
 * differ, and the tinted site treatment already separates it.
 */
function NodeGlyph({ node }: { node: TreeNode }) {
  const Base = KIND_ICON[node.kind as Exclude<NodeKind, "vm">];
  const isSite = node.kind === "datacenter";
  const Logo = !isSite && node.hypervisor ? PLATFORM_LOGO[node.hypervisor] : null;
  return (
    <span
      className={cn(
        "relative flex h-6 w-6 shrink-0 items-center justify-center",
        isSite ? "bg-info-subtle text-info" : "bg-muted text-muted-foreground",
      )}
    >
      <Base className="h-3.5 w-3.5" />
      {Logo && (
        <span className="absolute -bottom-[3px] -right-[3px] flex h-3.5 w-3.5 items-center justify-center bg-card text-foreground ring-1 ring-border">
          <Logo className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  );
}

const HOST_STATUS_TONE: Record<HostStatus, string> = {
  online: "success",
  maintenance: "warning",
  disconnected: "danger",
};

/** Default open: down through clusters, so the hosts they hold — the tree's
 *  leaves — are visible without expanding each branch by hand. */
function defaultOpen(nodes: TreeNode[], acc: Set<string>): Set<string> {
  for (const n of nodes) {
    if (n.kind === "datacenter" || n.kind === "cluster") {
      acc.add(n.key);
      defaultOpen(n.children, acc);
    }
  }
  return acc;
}

interface VisibleRow {
  node: TreeNode;
  level: number;
  hasChildren: boolean;
  expanded: boolean;
  posinset: number;
  setsize: number;
}

/**
 * Flatten to visible rows, stopping at the host level — VMs are never tree
 * rows; they live only in the scoped list on the right, so no entity appears
 * twice. A host is a selectable leaf (it has VM children for scoping, but
 * they aren't rendered here).
 */
function flattenEstate(nodes: TreeNode[], expanded: Set<string>, level = 1, out: VisibleRow[] = []): VisibleRow[] {
  const branches = nodes.filter((n) => n.kind !== "vm");
  branches.forEach((n, i) => {
    const canExpand = n.kind !== "host" && n.children.some((c) => c.kind !== "vm");
    const isOpen = expanded.has(n.key);
    out.push({ node: n, level, hasChildren: canExpand, expanded: isOpen, posinset: i + 1, setsize: branches.length });
    if (canExpand && isOpen) flattenEstate(n.children, expanded, level + 1, out);
  });
  return out;
}

interface EstateTreeProps {
  tree: TreeNode[];
  /** Currently-scoped node key, or null for the whole estate. */
  selectedKey: string | null;
  onSelectScope: (node: TreeNode) => void;
  /** Per-environment edit/rescan/remove — shown on each datacenter (environment) row. */
  onEditEnvironment: (environment: Environment) => void;
  onRescanEnvironment: (environment: Environment) => void;
  onDeleteEnvironment: (environment: Environment) => void;
}

/**
 * The estate navigator: Platform → Datacenter → Cluster → Host as an ARIA tree
 * with roving-tabindex keyboard nav. Selecting any node scopes the VM list —
 * this is the tree that sits to the left of Inventory's VM list.
 */
export function EstateTree({
  tree,
  selectedKey,
  onSelectScope,
  onEditEnvironment,
  onRescanEnvironment,
  onDeleteEnvironment,
}: EstateTreeProps) {
  const { t } = useTranslation("inventory");
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultOpen(tree, new Set()));

  // Top-level branches that appear after mount (e.g. a newly connected
  // environment) arrive open, matching what defaultOpen would have done had
  // they existed initially.
  const knownTopKeys = useRef(new Set(tree.map((n) => n.key)));
  useEffect(() => {
    const fresh = tree.filter((n) => !knownTopKeys.current.has(n.key));
    if (fresh.length === 0) return;
    setExpanded((prev) => defaultOpen(fresh, new Set(prev)));
    for (const n of fresh) knownTopKeys.current.add(n.key);
  }, [tree]);

  const rows = useMemo(() => flattenEstate(tree, expanded), [tree, expanded]);

  const [focusedKey, setFocusedKey] = useState<string | null>(() => tree[0]?.key ?? null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (rows.length > 0 && !rows.some((r) => r.node.key === focusedKey)) {
      setFocusedKey(rows[0]?.node.key ?? null);
    }
  }, [rows, focusedKey]);

  const registerRef = (key: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  };

  const moveFocus = (key: string) => {
    setFocusedKey(key);
    rowRefs.current.get(key)?.focus();
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // A click anywhere on the row selects the node as the list scope — it does
  // NOT expand/collapse. Expansion is the chevron's job (and the arrow keys),
  // so a click filters the table without the tree shifting underneath you.
  const activate = (node: TreeNode) => onSelectScope(node);

  const onRowKeyDown = (e: React.KeyboardEvent, key: string) => {
    const idx = rows.findIndex((r) => r.node.key === key);
    if (idx < 0) return;
    const row = rows[idx];
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (idx < rows.length - 1) moveFocus(rows[idx + 1].node.key);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (idx > 0) moveFocus(rows[idx - 1].node.key);
        break;
      case "Home":
        e.preventDefault();
        moveFocus(rows[0].node.key);
        break;
      case "End":
        e.preventDefault();
        moveFocus(rows[rows.length - 1].node.key);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (row.hasChildren && !row.expanded) toggle(key);
        else if (row.hasChildren && row.expanded && idx < rows.length - 1) moveFocus(rows[idx + 1].node.key);
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (row.hasChildren && row.expanded) toggle(key);
        else {
          for (let j = idx - 1; j >= 0; j--) {
            if (rows[j].level < row.level) {
              moveFocus(rows[j].node.key);
              break;
            }
          }
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activate(row.node);
        break;
    }
  };

  return (
    <div role="tree" aria-label={t("estate.navigator")} className="space-y-0.5">
      {rows.map((row) => {
        const { node, level, hasChildren, expanded: isOpen } = row;
        const pad = (level - 1) * 16 + 8;
        const selected = selectedKey === node.key;
        return (
          <div
            key={node.key}
            ref={(el) => registerRef(node.key, el)}
            role="treeitem"
            aria-level={level}
            aria-setsize={row.setsize}
            aria-posinset={row.posinset}
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-selected={selected || undefined}
            tabIndex={focusedKey === node.key ? 0 : -1}
            onClick={() => activate(node)}
            onKeyDown={(e) => onRowKeyDown(e, node.key)}
            onFocus={() => setFocusedKey(node.key)}
            style={{ paddingLeft: pad }}
            className={cn(
              "group flex w-full cursor-pointer items-center gap-1.5 py-1.5 pr-2 text-left transition-colors",
              "",
              "[@media(pointer:coarse)]:min-h-[40px]",
              selected ? "bg-primary/[0.08]" : "hover:bg-muted/50",
            )}
          >
            <BranchRow
              node={node}
              expanded={isOpen}
              hasChildren={hasChildren}
              selected={selected}
              onToggle={toggle}
              onEditEnvironment={onEditEnvironment}
              onRescanEnvironment={onRescanEnvironment}
              onDeleteEnvironment={onDeleteEnvironment}
            />
          </div>
        );
      })}
    </div>
  );
}

function BranchRow({
  node,
  expanded,
  hasChildren,
  selected,
  onToggle,
  onEditEnvironment,
  onRescanEnvironment,
  onDeleteEnvironment,
}: {
  node: TreeNode;
  expanded: boolean;
  hasChildren: boolean;
  selected: boolean;
  onToggle: (key: string) => void;
  onEditEnvironment: (environment: Environment) => void;
  onRescanEnvironment: (environment: Environment) => void;
  onDeleteEnvironment: (environment: Environment) => void;
}) {
  const { t } = useTranslation("inventory");
  const env = node.environment;
  return (
    <>
      {hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.key);
          }}
          className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}

      <NodeGlyph node={node} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm", selected ? "font-semibold" : "font-medium")}>{node.label}</span>
          {node.kind === "host" && node.host && <StatusDot tone={HOST_STATUS_TONE[node.host.status]} />}
          {node.kind === "datacenter" && env && !env.connected && (
            <span
              className="flex items-center gap-1 text-[11px] text-danger-text"
              title={env.statusError ?? undefined}
            >
              <StatusDot tone="danger" />
              {t("estate.disconnected")}
            </span>
          )}
        </div>
      </div>

      <RollupBadge roll={node.roll} />

      {node.kind === "datacenter" && env && (
        <SourceSettingsMenu
          environment={env}
          onEdit={onEditEnvironment}
          onRescan={onRescanEnvironment}
          onDelete={onDeleteEnvironment}
        />
      )}
    </>
  );
}

/** Kebab menu of per-environment actions — edit, rescan, or remove — on a datacenter row. */
function SourceSettingsMenu({
  environment,
  onEdit,
  onRescan,
  onDelete,
}: {
  environment: Environment;
  onEdit: (environment: Environment) => void;
  onRescan: (environment: Environment) => void;
  onDelete: (environment: Environment) => void;
}) {
  const { t } = useTranslation("inventory");
  const canEdit = useCan("inventory.edit");
  const canRescan = useCan("inventory.rescan");
  const canDelete = useCan("inventory.delete");
  if (!canEdit && !canRescan && !canDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("estate.settingsFor", { name: environment.name })}
          className="shrink-0 text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 data-[state=open]:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {canEdit && (
          <DropdownMenuItem onSelect={() => onEdit(environment)}>
            <Pencil className="h-4 w-4" />
            {t("sourceSettings.edit")}
          </DropdownMenuItem>
        )}
        {canRescan && (
          <DropdownMenuItem onSelect={() => onRescan(environment)}>
            <RefreshCw className="h-4 w-4" />
            {t("sourceSettings.rescan")}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem destructive onSelect={() => onDelete(environment)}>
            <Trash2 className="h-4 w-4" />
            {t("sourceSettings.remove")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact protection rollup — coverage% · VM count, tinted when anything under
 *  the node is exposed. */
function RollupBadge({ roll }: { roll: Rollup }) {
  const { t } = useTranslation("inventory");
  if (roll.total === 0) {
    return <span className="shrink-0 text-[11px] text-muted-foreground">{t("estate.empty")}</span>;
  }
  const tone = roll.unprotected > 0 ? "text-danger-text" : roll.warning > 0 ? "text-warning-text" : "text-muted-foreground";
  return (
    <span className={cn("nums shrink-0 text-right text-[11px]", tone)}>
      {Math.round(roll.coverage)}%<span className="sr-only"> {t("estate.protectedSr")}</span> · {roll.total}
    </span>
  );
}
