"use client";

import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney, fmtRevpar } from "../../../lib/format";

export interface FilingPoint {
  period: string;
  receipts: number | null;
  revpar: number | null;
  benchmarkRevpar: number | null;
}

const GRID = "color-mix(in oklch, currentColor 12%, transparent)";
const INK_MUTED = "color-mix(in oklch, currentColor 55%, transparent)";

const axisProps = {
  stroke: INK_MUTED,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function DetailTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const by = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div className="rounded-md border border-zinc-200 bg-background px-2.5 py-1.5 text-[12px] shadow-sm dark:border-zinc-800">
      <div className="text-zinc-500 dark:text-zinc-400">{label}</div>
      {by.receipts != null && (
        <div className="tabular-nums">Receipts: {fmtMoney(by.receipts)}</div>
      )}
      {by.revpar != null && <div className="tabular-nums">RevPAR: {fmtRevpar(by.revpar)}</div>}
      {by.benchmarkRevpar != null && (
        <div className="tabular-nums text-blue-600 dark:text-blue-300">
          Comp median: {fmtRevpar(by.benchmarkRevpar)}
        </div>
      )}
    </div>
  );
}

/** Quarterly RevPAR vs comp-set median. Blue = benchmark (DESIGN.md). */
export function RevparVsBenchmarkChart({ data }: { data: FilingPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={(v: number) => `$${v}`} width={52} />
        <Tooltip content={<DetailTooltip />} cursor={{ stroke: GRID }} />
        <Line
          type="monotone"
          dataKey="benchmarkRevpar"
          name="Comp median"
          stroke="var(--color-blue-500)"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="revpar"
          name="This hotel"
          stroke="var(--color-foreground)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Quarterly room receipts. */
export function ReceiptsBarChart({ data }: { data: FilingPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={(v: number) => fmtMoney(v)} width={56} />
        <Tooltip content={<DetailTooltip />} cursor={{ fill: GRID }} />
        <Bar dataKey="receipts" fill="var(--color-foreground)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
