// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import type { Session } from "@/types";
import { ROW_GRID, RunRow } from "./RunRow";

const PAGE = 25;

interface RunFeedProps {
  sessions: Session[];
  /** True when a filter/search is active — changes the empty-state copy. */
  filtered: boolean;
  onReset: () => void;
  /** Open the run-detail drawer for a session. */
  onOpen: (sessionId: string) => void;
}

export function RunFeed({ sessions, filtered, onReset, onOpen }: RunFeedProps) {
  const { t } = useTranslation("activity");
  const [limit, setLimit] = useState(PAGE);
  const visible = sessions.slice(0, limit);
  const hasMore = sessions.length > limit;

  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title={filtered ? t("feed.empty.filteredTitle") : t("feed.empty.title")}
          description={filtered ? t("feed.empty.filteredDescription") : t("feed.empty.description")}
          action={
            filtered ? (
              <Button variant="outline" size="sm" onClick={onReset}>
                {t("feed.empty.clearFilters")}
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Column header — visual aid only; each row carries a full aria-label for SR. */}
      <div
        aria-hidden="true"
        className={`${ROW_GRID} border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70`}
      >
        <span>{t("feed.columns.status")}</span>
        <span>{t("feed.columns.run")}</span>
        <span>{t("feed.columns.started")}</span>
        <span>{t("feed.columns.duration")}</span>
        {/* Neutral header — a run's objects may be VMs, disks or servers. */}
        <span>{t("feed.columns.objects")}</span>
        <span>{t("feed.columns.read")}</span>
        <span className="text-right">{t("feed.columns.sent")}</span>
      </div>

      <div role="list" aria-label={t("feed.listLabel")} className="divide-y divide-border/40">
        <AnimatePresence initial={false}>
          {visible.map((s) => (
            <motion.div
              key={s.id}
              role="listitem"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <RunRow session={s} onOpen={onOpen} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="nums">
          {t("feed.showing", { visible: visible.length, total: sessions.length })}
        </span>
        {hasMore && (
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            {t("feed.showMore")}
          </Button>
        )}
      </div>
    </Card>
  );
}
