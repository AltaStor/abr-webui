// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Pre-measure fallback — the cap these lists carried before they learned to
 *  fill the page, and still the answer wherever layout cannot be measured. */
const FALLBACK = "26rem";

/** Below this, filling beats nothing: a short viewport keeps a usable list and
 *  lets the page scroll rather than squeezing the picker into a slot. */
const MIN_HEIGHT = 240;

/** The shell's one scroll viewport — the frame every page is measured against. */
function scrollerOf(el: Element | null): HTMLElement | null {
  return (el?.closest("main") ?? document.querySelector("main")) as HTMLElement | null;
}

/** The page's own outermost element: whatever the shell's content rail wraps. */
function pageOf(el: HTMLElement | null, rail: Element | null): HTMLElement | null {
  let node = el;
  while (node?.parentElement && node.parentElement !== rail) node = node.parentElement;
  return node?.parentElement === rail ? node : null;
}

/**
 * Layout offset of a node from the top of the document.
 *
 * offsetTop is a layout value, so it ignores transforms — which matters here,
 * because both the page and the wizard step animate in on a small translate.
 * getBoundingClientRect() would measure that first frame and leave every list
 * short by the animation's offset until the next resize.
 */
function layoutTop(node: HTMLElement | null): number {
  let top = 0;
  for (let n: HTMLElement | null = node; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
  return top;
}

/**
 * A max height for a list that should use the page it was given rather than
 * end in a fixed stub with the viewport empty beneath it: the room left in the
 * scroll viewport, less whatever the page still renders below the list.
 *
 * Measured rather than written in CSS. A percentage cap needs an ancestor with a
 * definite height, and the shell's content rail is deliberately min-height only
 * so pages can outgrow the viewport. Both ends move, too — the source-kind tabs
 * and the unavailable-recovery notice sit above the list, a wizard action bar
 * below it — so both are read off the layout instead of being spelled out here.
 */
export function useListMaxHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [maxHeight, setMaxHeight] = useState<string>(FALLBACK);

  const measure = useCallback(() => {
    const el = ref.current;
    const scroller = scrollerOf(el);
    const rail = scroller?.firstElementChild ?? null;
    const page = pageOf(el, rail);
    if (!el || !scroller || !rail || !page) return;

    // Layout coordinates ignore scrolling, so the scroll offset comes back in
    // by hand: what we want is the distance from the viewport's top edge.
    const top = layoutTop(el) - layoutTop(scroller) - scroller.scrollTop;
    // What the page still owes below the list — an action bar, the card's own
    // padding and closing hairline — plus the rail's floor. A distance rather
    // than a sum of heights, so it holds whatever this list grows to.
    const railFloor = Number.parseFloat(getComputedStyle(rail).paddingBottom) || 0;
    const below = layoutTop(page) + page.offsetHeight - (layoutTop(el) + el.offsetHeight) + railFloor;

    const next = `${Math.max(MIN_HEIGHT, Math.round(scroller.clientHeight - top - below))}px`;
    setMaxHeight((prev) => (prev === next ? prev : next));
  }, []);

  // No dependency array: the chrome around the list belongs to the parent — a
  // step's tab row, a notice, an action bar — and can change height without
  // this list's props ever moving.
  useLayoutEffect(measure);

  // The window is not the only thing that lifts the floor: the connection
  // banner and the sidebar both resize the scroller under a still window.
  useLayoutEffect(() => {
    const scroller = scrollerOf(ref.current);
    if (!scroller) return;
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [measure]);

  return { ref, maxHeight };
}
