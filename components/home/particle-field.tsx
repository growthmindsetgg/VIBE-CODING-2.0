"use client";

import { useEffect, useRef } from "react";

type ParticleFieldProps = {
  className?: string;
};

export function ParticleField({ className }: ParticleFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);

    const particles = Array.from({ length: 72 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.00035,
      vy: (Math.random() - 0.5) * 0.00035,
      hue: Math.random() > 0.5 ? 180 + Math.random() * 60 : 280 + Math.random() * 50,
    }));

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.floor(clientWidth * dpr);
      canvas.height = Math.floor(clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      frame++;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(5,5,16,0.02)";
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx * (1 + Math.sin(frame * 0.002 + p.y * 6) * 0.25);
        p.y += p.vy * (1 + Math.cos(frame * 0.002 + p.x * 6) * 0.25);
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;

        const g = ctx.createRadialGradient(
          p.x * w,
          p.y * h,
          0,
          p.x * w,
          p.y * h,
          p.r * 14,
        );
        g.addColorStop(0, `hsla(${p.hue}, 95%, 65%, 0.35)`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r * 14, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(tick);
    };

    const id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden
      style={{ width: "100%", height: "100%" }}
    />
  );
}
