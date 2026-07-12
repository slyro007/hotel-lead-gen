"use client";

// Shared recharts primitives so the market page, hotel detail, and lead-card
// sparklines all draw from one source (colors/axes/tooltip). Semantic colors
// come from the CSS tokens in globals.css.

import { Line, LineChart, ResponsiveContainer } from "recharts";

export const GRID = "color-mix(in oklch, currentColor 12%, transparent)";
export const INK_MUTED = "color-mix(in oklch, currentColor 55%, transparent)";

export const axisProps = {
  stroke: INK_MUTED,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] shadow-sm">
      <div className="text-ink-muted">{label}</div>
      <div className="font-medium tabular-nums">{format(payload[0].value)}</div>
    </div>
  );
}

/**
 * Tiny axis-less trend line for cards and KPI tiles. `values` are already the
 * numbers to plot (e.g. implied RevPAR per quarter); nulls create gaps.
 */
export function Sparkline({
  values,
  color = "var(--color-foreground)",
  height = 32,
  strokeWidth = 1.5,
}: {
  values: (number | null)[];
  color?: string;
  height?: number;
  strokeWidth?: number;
}) {
  const points = values.map((v, i) => ({ i, v }));
  const hasData = values.some((v) => v != null);
  if (!hasData) {
    return <div style={{ height }} className="w-full" aria-hidden />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={strokeWidth}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
