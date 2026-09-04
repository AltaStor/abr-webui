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
      {/* The seven columns need 57.5rem (49.5rem of tracks, 6rem of gaps, 2rem of
          row padding). Narrower than that the grid scrolls sideways in here,
          rather than being silently clipped by the card and stranding its
          right-hand columns. Keep this in step with ROW_GRID: no track can
          shrink, so a widened column that misses this guard overflows by
          exactly the difference. The footer sits outside the scroller so paging
          stays put. */}
      <div className="overflow-x-auto">
        <div className="min-w-[57.5rem]">
          {/* Column header — visual aid only; each row carries a full aria-label for SR. */}
          <div
            aria-hidden="true"
            className={`${ROW_GRID} label-overline border-b border-border bg-muted/30 px-4 py-2`}
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
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
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
