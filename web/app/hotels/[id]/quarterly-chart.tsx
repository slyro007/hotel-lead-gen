"use client";

import {
  Area,
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
import { axisProps, GRID } from "../../_components/charts";

export interface FilingPoint {
  period: string;
  receipts: number | null;
  revpar: number | null;
  benchmarkRevpar: number | null;
}

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
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] shadow-sm">
      <div className="text-ink-muted">{label}</div>
      {by.receipts != null && (
        <div className="tabular-nums">Receipts: {fmtMoney(by.receipts)}</div>
      )}
      {by.revpar != null && <div className="tabular-nums">RevPAR: {fmtRevpar(by.revpar)}</div>}
      {by.benchmarkRevpar != null && (
        <div className="tabular-nums text-benchmark">
          Comp median: {fmtRevpar(by.benchmarkRevpar)}
        </div>
      )}
    </div>
  );
}

/**
 * Quarterly RevPAR vs comp-set median. Blue dashed = benchmark; the hotel line
 * is foreground ink, with a red fill in the gap wherever it sits *below* the
 * benchmark (DESIGN.md: red = underperformance). `shortfall` is a derived
 * series = benchmark value only in quarters where revpar < benchmark, so the
 * area shades exactly the below-market region.
 */
export function RevparVsBenchmarkChart({ data }: { data: FilingPoint[] }) {
  // `shortfall` = the benchmark value only in quarters where the hotel sits
  // below it, else null. The Area fills from the baseline up to that value, so
  // the red band appears exactly under the below-market quarters. Kept as a
  // constant chart child (never conditionally rendered) so recharts' internal
  // hook order stays stable across renders.
  const withShortfall = data.map((d) => ({
    ...d,
    shortfall:
      d.revpar != null && d.benchmarkRevpar != null && d.revpar < d.benchmarkRevpar
        ? d.benchmarkRevpar
        : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={withShortfall} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} tickFormatter={(v: number) => `$${v}`} width={52} />
        <Tooltip content={<DetailTooltip />} cursor={{ stroke: GRID }} />
        {/* Red band under below-market quarters (nulls elsewhere → no fill). */}
        <Area
          type="monotone"
          dataKey="shortfall"
          stroke="none"
          fill="var(--color-hot)"
          fillOpacity={0.16}
          baseValue="dataMin"
          connectNulls={false}
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="benchmarkRevpar"
          name="Comp median"
          stroke="var(--color-benchmark)"
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
