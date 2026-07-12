"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney, fmtRevpar } from "../../../lib/format";

export interface TrendPoint {
  period: string; // "Q1 '25"
  revparMedian: number | null;
  totalReceipts: number | null;
  totalRooms: number | null;
}

const GRID = "color-mix(in oklch, currentColor 12%, transparent)";
const INK_MUTED = "color-mix(in oklch, currentColor 55%, transparent)";

function ChartTooltip({
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
    <div className="rounded-md border border-zinc-200 bg-background px-2.5 py-1.5 text-[12px] shadow-sm dark:border-zinc-800">
      <div className="text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="font-medium tabular-nums">{format(payload[0].value)}</div>
    </div>
  );
}

const axisProps = {
  stroke: INK_MUTED,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/** Median implied RevPAR across the Dallas County comp universe, by quarter. */
export function RevparTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={(v: number) => `$${v}`} width={52} />
        <Tooltip
          content={<ChartTooltip format={(v) => `${fmtRevpar(v)} RevPAR (median)`} />}
          cursor={{ stroke: GRID }}
        />
        <Line
          type="monotone"
          dataKey="revparMedian"
          stroke="var(--color-blue-500)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Total quarterly room receipts across all filers. */
export function ReceiptsChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="25%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={(v: number) => fmtMoney(v)} width={56} />
        <Tooltip
          content={<ChartTooltip format={(v) => `${fmtMoney(v)} room receipts`} />}
          cursor={{ fill: GRID }}
        />
        <Bar
          dataKey="totalReceipts"
          fill="var(--color-foreground)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
