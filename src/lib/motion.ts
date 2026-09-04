// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

/**
 * The brand's motion constants, shared by CSS and Framer Motion.
 *
 * The website's grammar: .25s for colour and border transitions, .3s for menus
 * and arrows, .45s for art. Reveals and settles ride an exponential ease-out —
 * no bounce, no elastic. Tailwind exposes the same curves as `ease-settle` /
 * `ease-brand` and the same timings as `duration-250` / `duration-450`.
 */

/** Draw / settle — the curve the website uses for anything arriving. */
export const EASE_SETTLE = [0.16, 1, 0.3, 1] as const;

/** The secondary brand curve, used for shorter state changes. */
export const EASE_BRAND = [0.2, 0.7, 0.2, 1] as const;

export const DUR = {
  /** Colour, border, and opacity changes. */
  color: 0.25,
  /** Menus, drawers, arrows. */
  menu: 0.3,
  /** Art and filter transitions. */
  art: 0.45,
} as const;

/** A settle transition for Framer Motion, at the brand's arrival timing. */
export const settle = { duration: DUR.menu, ease: EASE_SETTLE };
