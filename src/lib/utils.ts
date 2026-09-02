// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Clamp a number to a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Deterministic pseudo-random in [0,1) from a numeric seed — keeps the mock world stable. */
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Pick an element from an array using a 0..1 roll. */
export function pick<T>(arr: readonly T[], roll: number): T {
  return arr[Math.floor(roll * arr.length) % arr.length];
}

/** Best-effort Mac detection, for showing ⌘ vs Ctrl in keyboard-shortcut hints. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent;
  return /mac/i.test(platform);
}
