"use client";

import { useMemo } from "react";

type Point = { t: number; eurUsd: number };

type Props = {
  points: Point[];
  width?: number;
  height?: number;
};

export function PriceSparkline({ points, width = 560, height = 120 }: Props) {
  const d = useMemo(() => {
    if (points.length < 2) return "";
    const vals = points.map((p) => p.eurUsd);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const xStep = width / (points.length - 1);
    return points
      .map((p, i) => {
        const x = i * xStep;
        const y = height - ((p.eurUsd - min) / range) * (height - 8) - 4;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, width, height]);

  const last = points.at(-1)?.eurUsd;
  const first = points.at(0)?.eurUsd;
  const trendUp = last !== undefined && first !== undefined && last >= first;

  if (!d) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-md border-2 border-dashed border-black/20 bg-[#f8f7ff] font-mono text-[11px] text-zinc-500">
        Waiting for price samples…
      </div>
    );
  }

  return (
    <div className="rounded-md border-2 border-black bg-[#0a0a12] p-3">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-label="EUR/USD price chart"
      >
        <path
          d={d}
          fill="none"
          stroke={trendUp ? "#34d399" : "#f472b6"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
