"use client";

import clsx from "clsx";
import Link from "next/link";
import { forwardRef } from "react";
import type { HotelListRow } from "../../../db/queries/hotels";
import { fmtInt, fmtMoney, fmtPct, toNum } from "../../../lib/format";
import { isUnderperforming, scoreBand } from "../../../lib/score-labels";
import { cardHeadline } from "../../../lib/verdict";
import { Sparkline } from "../../_components/charts";
import { Badge, ScoreChip } from "../../_components/score-chip";

/** Horizontal bullet: hotel's RevPAR index vs the comp-set benchmark (100). */
function IndexBullet({ index }: { index: number | null }) {
  if (index == null) {
    return <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800" />;
  }
  const SCALE = 150; // track spans index 0..150; benchmark tick at 100
  const pct = Math.max(0, Math.min(index, SCALE)) / SCALE;
  const benchmarkPct = 100 / SCALE;
  const color =
    index < 75 ? "bg-hot" : index < 95 ? "bg-warm" : "bg-above";
  return (
    <div className="relative h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className={clsx("absolute inset-y-0 left-0 rounded-full", color)}
        style={{ width: `${pct * 100}%` }}
      />
      {/* benchmark marker at index 100 */}
      <div
        className="absolute inset-y-[-2px] w-px bg-zinc-500/70"
        style={{ left: `${benchmarkPct * 100}%` }}
        title="Comp-set median (index 100)"
      />
    </div>
  );
}

function YoY({ yoy }: { yoy: number | null }) {
  if (yoy == null) return <span className="text-zinc-400">—</span>;
  const down = yoy < 0;
  return (
    <span className={down ? "text-hot" : "text-above"}>
      {down ? "▼" : "▲"} {fmtPct(yoy, false)}
    </span>
  );
}

export interface LeadCardProps {
  row: HotelListRow;
  spark: (number | null)[];
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

export const LeadCard = forwardRef<HTMLAnchorElement, LeadCardProps>(function LeadCard(
  { row, spark, hovered, selected, onHover, onSelect },
  ref
) {
  const idx = toNum(row.revparIndex);
  const yoy = toNum(row.yoy);
  const band = scoreBand(row.leadScore);
  const sparkColor =
    band === "hot" ? "var(--color-hot)" : band === "warm" ? "var(--color-warm)" : "var(--color-foreground)";

  return (
    <Link
      ref={ref}
      href={`/hotels/${row.id}`}
      scroll={false}
      role="listitem"
      aria-selected={selected}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(row.id)}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 132px" }}
      className={clsx(
        "block scroll-mt-2 rounded-lg border p-3 transition-colors duration-150",
        selected
          ? "border-foreground/40 bg-surface ring-1 ring-foreground/30"
          : hovered
            ? "border-zinc-300 bg-surface dark:border-zinc-700"
            : "border-border bg-surface-raised hover:border-zinc-300 dark:hover:border-zinc-700"
      )}
    >
      <div className="flex items-start gap-3">
        <ScoreChip score={row.leadScore} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium leading-tight">{row.name}</div>
              <div className="truncate text-[12px] text-ink-muted">
                {row.address}
                {row.city ? ` · ${row.city}` : ""}
              </div>
            </div>
            <div className="w-20 shrink-0">
              <Sparkline values={spark} color={sparkColor} height={30} />
            </div>
          </div>

          <p className="mt-1.5 text-[12px] leading-snug text-foreground/80">
            {cardHeadline(row)}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.stoppedFiling && <Badge tone="red">stopped filing</Badge>}
            {isUnderperforming(idx) && <Badge tone="red">underperforming</Badge>}
            {row.brandClass === "independent" && <Badge tone="zinc">independent</Badge>}
            {row.brandFamily && <Badge tone="blue">{row.brandFamily}</Badge>}
          </div>

          <div className="mt-2">
            <IndexBullet index={idx} />
            <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
              <span>vs. similar hotels</span>
              <span className="tabular-nums text-foreground">{idx?.toFixed(0) ?? "—"}</span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-ink-muted">
            <span>{fmtInt(row.rooms)} rooms</span>
            <span>·</span>
            <span>{fmtMoney(row.trailingRevenue)}/yr</span>
            <span>·</span>
            <YoY yoy={yoy} />
            {row.ownerName && (
              <>
                <span>·</span>
                <span className="truncate text-owner" title={row.ownerName}>
                  {row.ownerName}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
});
