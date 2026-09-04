// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { cn } from "@/lib/utils";
import lockupOnDarkUrl from "@/assets/brand/altastor-lockup-on-dark.svg";
import lockupOnLightUrl from "@/assets/brand/altastor-lockup-on-light.svg";
import markOnDarkUrl from "@/assets/brand/altastor-mark.svg";
import markOnLightUrl from "@/assets/brand/altastor-mark-on-light.svg";
import wordmarkOnDarkUrl from "@/assets/brand/altastor-wordmark-on-dark.svg";
import wordmarkOnLightUrl from "@/assets/brand/altastor-wordmark-on-light.svg";

/**
 * Theme-paired AltaStor mark. Light mode swaps the neutral layers for contrast
 * while preserving the supplied geometry and blue brand layers.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      aria-hidden="true"
    >
      <img
        src={markOnLightUrl}
        alt=""
        className="block h-full w-full object-contain dark:hidden"
      />
      <img
        src={markOnDarkUrl}
        alt=""
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}

/**
 * Theme-paired AltaStor lockups. Dark mode uses the supplied pale artwork;
 * light mode uses a transparent derivative with dark lettering and the same
 * supplied geometry, mark and blue brand layers.
 */
export function Logo({
  collapsed,
  variant = "lockup",
  size = "md",
  className,
}: {
  collapsed?: boolean;
  variant?: "lockup" | "wordmark";
  size?: "md" | "lg";
  className?: string;
}) {
  if (collapsed) return <LogoMark className={className} />;

  const heightClass =
    size === "lg"
      ? variant === "wordmark"
        ? "h-10"
        : "h-12"
      : variant === "wordmark"
        ? "h-[30px]"
        : "h-[34px]";
  const onLightUrl = variant === "wordmark" ? wordmarkOnLightUrl : lockupOnLightUrl;
  const onDarkUrl = variant === "wordmark" ? wordmarkOnDarkUrl : lockupOnDarkUrl;

  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", className)}>
      <img
        src={onLightUrl}
        alt="AltaStor — Backup & Replication"
        className={cn("block w-auto object-contain dark:hidden", heightClass)}
      />
      <img
        src={onDarkUrl}
        alt="AltaStor — Backup & Replication"
        className={cn("hidden w-auto object-contain dark:block", heightClass)}
      />
    </span>
  );
}
