// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 Norvitex OÜ

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface LiveThroughputProps {
  /** Current throughput in MB/s (updates each simulation tick). */
  value: number;
  /** Whether the run is live. When false the waveform decays to a flatline. */
  active: boolean;
  /** Canvas height in CSS px. */
  height?: number;
  /** Semantic tone → CSS variable used for the line/fill. */
  tone?: "info" | "primary" | "success";
  className?: string;
}

const STEP_MS = 16; // one sample per ~frame, time-based so history stays ~constant
const WINDOW = 200; // ~3.2s of history
const MIN_SCALE = 240; // MB/s — keeps a calm idle baseline from filling the panel
const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A live, GPU-light throughput monitor — a scrolling waveform that advances every
 * animation frame and eases toward the latest tick value, so a running backup
 * visibly "breathes" between the discrete 1.2s simulation ticks. Pauses when
 * off-screen; renders a calm static line under prefers-reduced-motion.
 */
export function LiveThroughput({ value, active, height = 48, tone = "info", className }: LiveThroughputProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live values the RAF loop reads without re-subscribing.
  const targetRef = useRef(value);
  const activeRef = useRef(active);
  targetRef.current = value;
  activeRef.current = active;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = new Float32Array(WINDOW).fill(0);
    let displayed = active ? value : 0;
    let yMax = MIN_SCALE;
    let cssW = wrap.clientWidth || 240;
    let cssH = height;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let line = "hsl(214 92% 65%)";
    let raw = "214 92% 65%";

    const readColor = () => {
      const v = getComputedStyle(canvas).getPropertyValue(`--${tone}`).trim();
      if (v) {
        raw = v;
        line = `hsl(${v})`;
      }
    };

    const resize = () => {
      cssW = wrap.clientWidth || cssW;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, cssW, cssH);
      const padTop = 4;
      const usable = cssH - padTop - 1;
      const xAt = (i: number) => (i / (WINDOW - 1)) * cssW;
      const yAt = (val: number) => padTop + usable - (Math.max(0, val) / yMax) * usable;

      // Area fill under the curve.
      ctx.beginPath();
      ctx.moveTo(0, cssH);
      for (let i = 0; i < WINDOW; i++) ctx.lineTo(xAt(i), yAt(buf[i]));
      ctx.lineTo(cssW, cssH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padTop, 0, cssH);
      grad.addColorStop(0, `hsl(${raw} / 0.28)`);
      grad.addColorStop(1, `hsl(${raw} / 0)`);
      ctx.fillStyle = grad;
      ctx.fill();

      // The line.
      ctx.beginPath();
      for (let i = 0; i < WINDOW; i++) {
        const x = xAt(i);
        const y = yAt(buf[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // The write head at the leading (right) edge — a solid node, no halo.
      const hx = xAt(WINDOW - 1);
      const hy = yAt(buf[WINDOW - 1]);
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.arc(hx - 1.5, hy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    };

    // ---- Static path (reduced motion): one calm line, redrawn on value change ----
    if (reduceMotion()) {
      readColor();
      resize();
      const v = active ? Math.max(value, MIN_SCALE * 0.5) : 0;
      yMax = Math.max(MIN_SCALE, v * 1.15);
      for (let i = 0; i < WINDOW; i++) buf[i] = v;
      draw();
      const ro = new ResizeObserver(() => {
        resize();
        draw();
      });
      ro.observe(wrap);
      return () => ro.disconnect();
    }

    // ---- Animated path ----
    readColor();
    resize();

    let visible = true;
    let rafId = 0;
    let last = performance.now();
    let acc = 0;

    const frame = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;

      // Ease the displayed value toward the latest tick (or 0 when finished).
      const target = activeRef.current ? targetRef.current : 0;
      displayed += (target - displayed) * (1 - Math.exp(-dt / 260));

      // Push samples on a fixed time step so the window stays ~constant.
      acc += dt;
      let pushes = 0;
      while (acc >= STEP_MS && pushes < 8) {
        buf.copyWithin(0, 1);
        buf[WINDOW - 1] = displayed;
        acc -= STEP_MS;
        pushes++;
      }

      // Auto-scale Y toward the recent peak, eased so it never jumps.
      let peak = MIN_SCALE;
      for (let i = 0; i < WINDOW; i++) if (buf[i] > peak) peak = buf[i];
      const targetMax = peak * 1.18;
      yMax += (targetMax - yMax) * (1 - Math.exp(-dt / 600));

      draw();
      rafId = requestAnimationFrame(frame);
    };

    const start = () => {
      if (rafId) return;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    io.observe(wrap);

    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);

    const themeObs = new MutationObserver(() => readColor());
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    if (visible) start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      themeObs.disconnect();
    };
    // height/tone are layout-constant for a given mount; value/active flow via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className={cn("w-full", className)} style={{ height }} aria-hidden>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
