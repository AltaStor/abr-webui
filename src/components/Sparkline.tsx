// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useId } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** CSS color, defaults to the primary token. */
  color?: string;
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
}

/** Tiny inline trend line — no external chart lib needed. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  color = "hsl(var(--primary))",
  fill = true,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  const id = useId();
  if (data.length === 0) return <svg width={width} height={height} className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - 3 - ((d - min) / range) * (height - 6);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className={className} preserveAspectRatio="none" aria-hidden>
      {fill && (
        <>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#spark-${id})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
