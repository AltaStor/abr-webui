// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import wordmarkOnDarkUrl from "@/assets/brand/altastor-wordmark-on-dark.svg";
import { useSettingsStore } from "@/store/settings";

/**
 * The website's first-load ritual, replayed once after a successful sign-in:
 * the three plates fly onto the stage, the hexagon seals itself around them,
 * the corner ticks land, the wordmark surfaces, and the veil lifts onto the
 * console. The login form is the only writer of the pending flag, so a
 * restored session or a plain reload never replays it.
 *
 * The veil is a night island — like the website's intro it stays #0C1013 in
 * both themes, because the assembled artwork is the on-dark mark. Any click
 * or key skips it; reduced motion (OS or the app toggle) consumes the flag
 * without rendering a single frame.
 */
export const INTRO_FLAG = "as-intro-pending";

/* One clock, website-shaped but product-brisk (the site runs ~4.2s; a console
 * should hand the keys over sooner). All figures in seconds. */
const PLATE_1 = 0.15; // bottom plate, from lower-left
const PLATE_2 = 0.55; // middle plate, from upper-right
const PLATE_3 = 0.95; // top plate, from upper-left
const RING = 1.4; // hexagon seal draw-on
const TICKS = 2.45; // six corner ticks
const WORDMARK = 2.6;
const LIFT_MS = 3600; // veil starts lifting
const GONE_MS = 4200; // unmount, no matter what

const SETTLE = [0.16, 1, 0.3, 1] as const;
const FLY = [0.2, 0.7, 0.2, 1] as const;

function consumePendingFlag(): boolean {
  try {
    if (sessionStorage.getItem(INTRO_FLAG) === null) return false;
    sessionStorage.removeItem(INTRO_FLAG);
    return true;
  } catch {
    return false;
  }
}

/** A plate of the mark: the site's rhombus geometry at stage scale. */
function Plate({ y, fill, from, delay }: { y: number; fill: string; from: { x: number; y: number }; delay: number }) {
  return (
    <motion.g
      initial={{ x: from.x, y: from.y, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={{ duration: 0.65, delay, ease: FLY }}
    >
      <rect width="22.6252" height="22.6252" transform={`matrix(0.866025 0.5 -0.866025 0.5 36.5 ${y})`} fill={fill} />
    </motion.g>
  );
}

export function IntroOverlay() {
  const [play, setPlay] = useState(false);
  const [visible, setVisible] = useState(false);

  /* Consumed in an effect, not a state initializer: StrictMode invokes an
   * initializer twice, and the second call — the one React keeps — would find
   * the flag already eaten by the first. An effect's re-run simply finds
   * nothing and leaves the armed state alone. */
  useEffect(() => {
    if (!consumePendingFlag()) return;
    const osReduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (osReduced || useSettingsStore.getState().appearance.reduceMotion) return;
    setPlay(true);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!play) return;
    const dismiss = () => setVisible(false);
    const lift = window.setTimeout(dismiss, LIFT_MS);
    // The site's safety net, kept: whatever happens to the timeline, the
    // console is reachable again by this deadline.
    const gone = window.setTimeout(dismiss, GONE_MS);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", dismiss);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(gone);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, [play]);

  if (!play) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0C1013]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeOut" } }}
        >
          <div className="flex items-center gap-6">
            <svg width="120" height="120" viewBox="-14 -14 101 101" fill="none" aria-hidden="true">
              {/* Plates land first, in the mark's stacking order. */}
              <Plate y={36.5825} fill="#3179C4" from={{ x: -46, y: 34 }} delay={PLATE_1} />
              <Plate y={25.3103} fill="#ADD3ED" from={{ x: 46, y: -30 }} delay={PLATE_2} />
              <Plate y={13.9978} fill="#EEF3F6" from={{ x: -42, y: -36 }} delay={PLATE_3} />
              {/* The hexagon seals itself around them — the drawn ring, not the
                  filled one; the intro is a schematic of the mark, not the mark. */}
              <motion.path
                d="M36.5 0L68.1099 18.25V54.75L36.5 73L4.89007 54.75V18.25L36.5 0Z"
                stroke="#EEF3F6"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, delay: RING, ease: SETTLE }}
              />
              {/* Six corner ticks, Signal Blue — the lock landing. */}
              <motion.g
                stroke="#3179C4"
                strokeWidth="2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, delay: TICKS }}
              >
                <line x1="36.5" y1="-4.5" x2="36.5" y2="-8" />
                <line x1="72" y1="16" x2="75" y2="14.3" />
                <line x1="72" y1="57" x2="75" y2="58.7" />
                <line x1="36.5" y1="77.5" x2="36.5" y2="81" />
                <line x1="1" y1="57" x2="-2" y2="58.7" />
                <line x1="1" y1="16" x2="-2" y2="14.3" />
              </motion.g>
            </svg>
            <motion.img
              src={wordmarkOnDarkUrl}
              alt=""
              className="h-7 w-auto"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: WORDMARK, ease: SETTLE }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
