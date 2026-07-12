import Link from "next/link";
import { listCities, listHotels, type HotelFilters } from "../../db/queries/hotels";
import { getDataFreshness } from "../../db/queries/ingestion";
import { requireApproved } from "../../lib/auth";
import { fmtInt, fmtMoney, fmtPct, fmtQuarter, toNum } from "../../lib/format";
import { isUnderperforming } from "../../lib/score-labels";
import { EmptyState, NotApproved } from "../_components/not-approved";
import { Badge, ScoreChip } from "../_components/score-chip";
import { FiltersBar } from "./_components/filters-bar";
import { MapToggle } from "./_components/map-toggle";
import { SortHeader } from "./_components/sort-header";

export const dynamic = "force-dynamic";

export default async function HotelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const raw = await searchParams;
  const f: HotelFilters = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const [rows, cities, freshness] = await Promise.all([
    listHotels(f),
    listCities(),
    getDataFreshness(),
  ]);

  const mapPoints = rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      name: r.name ?? "",
      lat: r.latitude!,
      lng: r.longitude!,
      score: r.leadScore,
    }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-fade-up">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Hotels</h1>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          {rows.length} shown
          {freshness && <> · data through {fmtQuarter(freshness.year, freshness.quarter)}</>}
        </span>
      </div>

      <div className="mt-4">
        <FiltersBar cities={cities} />
      </div>

      <div className="mt-4">
        <MapToggle points={mapPoints} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No hotels match"
            hint="If the database is empty, run the SIFT ingestion pipeline first (CLAUDE.md has the runbook)."
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 [&>th]:py-2 [&>th]:pr-3">
                <th className="w-16 text-left"><SortHeader column="score">Score</SortHeader></th>
                <th className="text-left"><SortHeader column="name">Hotel</SortHeader></th>
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
                return (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900 [&>td]:py-2.5 [&>td]:pr-3"
                  >
                    <td><ScoreChip score={r.leadScore} /></td>
                    <td className="max-w-72">
                      <Link href={`/hotels/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                          {r.address}
                        </span>
                        {r.stoppedFiling && <Badge tone="red">stopped filing</Badge>}
                        {isUnderperforming(idx) && <Badge tone="red">underperforming</Badge>}
                        {r.brandClass === "independent" && <Badge tone="zinc">independent</Badge>}
                      </div>
                    </td>
                    <td className="text-zinc-500 dark:text-zinc-400">{r.city}</td>
                    <td className="text-right tabular-nums">{fmtInt(r.rooms)}</td>
                    <td className="text-right tabular-nums">
                      <span className={idx != null && idx < 75 ? "text-red-600 dark:text-red-300" : ""}>
                        {idx?.toFixed(0) ?? "—"}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">
                      <span
                        className={
                          yoy == null
                            ? ""
                            : yoy < 0
                              ? "text-red-600 dark:text-red-300"
                              : "text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {fmtPct(yoy)}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(r.trailingRevenue)}</td>
                    <td className="max-w-52 truncate pl-4 text-zinc-500 dark:text-zinc-400">
                      {r.ownerName ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
