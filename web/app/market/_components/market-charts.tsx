"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtInt, fmtMoney, fmtRevpar } from "../../../lib/format";
import { axisProps, ChartTooltip, GRID } from "../../_components/charts";

export interface TrendPoint {
  period: string; // "Q1 '25"
  revparMedian: number | null;
  totalReceipts: number | null;
  totalRooms: number | null;
}

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

/** Room supply (total rooms across active filers) by quarter. */
export function SupplyChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="supplyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-benchmark)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-benchmark)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={(v: number) => fmtInt(v)} width={52} />
        <Tooltip
          content={<ChartTooltip format={(v) => `${fmtInt(v)} rooms`} />}
          cursor={{ stroke: GRID }}
        />
        <Area
          type="monotone"
          dataKey="totalRooms"
          stroke="var(--color-benchmark)"
          strokeWidth={2}
          fill="url(#supplyFill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
