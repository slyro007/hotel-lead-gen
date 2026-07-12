"use client";

import Link from "next/link";
import type { HotelListRow } from "../../../db/queries/hotels";
import { fmtInt, fmtMoney, fmtPct, toNum } from "../../../lib/format";
import { isUnderperforming } from "../../../lib/score-labels";
import { Sparkline } from "../../_components/charts";
import { Badge, ScoreChip } from "../../_components/score-chip";
import { SortHeader } from "./sort-header";

/** Compact, sortable table view — the export/scan workflow. */
export function HotelsTable({
  rows,
  sparklines,
  onHover,
  onSelect,
  hoveredId,
  selectedId,
}: {
  rows: HotelListRow[];
  sparklines: Record<string, (number | null)[]>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  hoveredId: string | null;
  selectedId: string | null;
}) {
  return (
    <div className="h-full overflow-auto px-4 py-3 sm:px-6">
      <table className="w-full min-w-[880px] border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border [&>th]:py-2 [&>th]:pr-3">
            <th className="w-16 text-left"><SortHeader column="score">Score</SortHeader></th>
            <th className="text-left"><SortHeader column="name">Hotel</SortHeader></th>
            <th className="w-24 text-left">Trend</th>
            <th className="text-left"><SortHeader column="city">City</SortHeader></th>
            <th className="w-20 text-right"><SortHeader column="rooms" align="right">Rooms</SortHeader></th>
            <th className="w-20 text-right"><SortHeader column="index" align="right">RevPAR idx</SortHeader></th>
            <th className="w-24 text-right"><SortHeader column="yoy" align="right">YoY</SortHeader></th>
            <th className="w-28 text-right"><SortHeader column="revenue" align="right">Trailing rev</SortHeader></th>
            <th className="text-left pl-4">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const yoy = toNum(r.yoy);
            const idx = toNum(r.revparIndex);
            const active = r.id === hoveredId || r.id === selectedId;
            return (
              <tr
                key={r.id}
                onMouseEnter={() => onHover(r.id)}
                onMouseLeave={() => onHover(null)}
                className={`border-b border-zinc-100 transition-colors dark:border-zinc-900 [&>td]:py-2.5 [&>td]:pr-3 ${
                  active ? "bg-surface" : "hover:bg-surface"
                }`}
              >
                <td><ScoreChip score={r.leadScore} /></td>
                <td className="max-w-72">
                  <Link
                    href={`/hotels/${r.id}`}
                    scroll={false}
                    onClick={() => onSelect(r.id)}
                    className="font-medium hover:underline"
                  >
                    {r.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="truncate text-[12px] text-ink-muted">{r.address}</span>
                    {r.stoppedFiling && <Badge tone="red">stopped filing</Badge>}
                    {isUnderperforming(idx) && <Badge tone="red">underperforming</Badge>}
                    {r.brandClass === "independent" && <Badge tone="zinc">independent</Badge>}
                  </div>
                </td>
                <td className="w-24">
                  <div className="w-20">
                    <Sparkline values={sparklines[r.id] ?? []} height={24} />
                  </div>
                </td>
                <td className="text-ink-muted">{r.city}</td>
                <td className="text-right tabular-nums">{fmtInt(r.rooms)}</td>
                <td className="text-right tabular-nums">
                  <span className={idx != null && idx < 75 ? "text-hot" : ""}>
                    {idx?.toFixed(0) ?? "—"}
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  <span className={yoy == null ? "" : yoy < 0 ? "text-hot" : "text-above"}>
                    {fmtPct(yoy)}
                  </span>
                </td>
                <td className="text-right tabular-nums">{fmtMoney(r.trailingRevenue)}</td>
                <td className="max-w-52 truncate pl-4 text-ink-muted">{r.ownerName ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
