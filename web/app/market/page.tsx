import Link from "next/link";
import { getDataFreshness } from "../../db/queries/ingestion";
import {
  getMarketKpis,
  getMarketTrend,
  getReportedHotRevenue,
  getTopDecliners,
} from "../../db/queries/market";
import { requireApproved } from "../../lib/auth";
import { fmtInt, fmtMoney, fmtPct, fmtQuarter, fmtRevpar, toNum } from "../../lib/format";
import { EmptyState, NotApproved } from "../_components/not-approved";
import { ScoreChip } from "../_components/score-chip";
import { ReceiptsChart, RevparTrendChart, type TrendPoint } from "./_components/market-charts";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">{sub}</div>}
    </div>
  );
}

export default async function MarketPage() {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const [kpis, trend, decliners, hotRevenue, freshness] = await Promise.all([
    getMarketKpis(),
    getMarketTrend(),
    getTopDecliners(),
    getReportedHotRevenue(),
    getDataFreshness(),
  ]);

  const points: TrendPoint[] = trend.map((t) => ({
    period: fmtQuarter(t.year, t.quarter),
    revparMedian: toNum(t.revparMedian),
    totalReceipts: toNum(t.totalReceipts),
    totalRooms: t.totalRooms,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-fade-up">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dallas County market</h1>
        {freshness && (
          <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Data through {fmtQuarter(freshness.year, freshness.quarter)}
          </span>
        )}
      </div>

      {!kpis ? (
        <div className="mt-8">
          <EmptyState
            title="No market data yet"
            hint="Run the SIFT ingestion pipeline (see CLAUDE.md), then score.py — this page fills itself."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Quarterly room receipts"
              value={fmtMoney(kpis.totalReceipts)}
              sub={
                kpis.receiptsYoyPct != null ? `${fmtPct(kpis.receiptsYoyPct)} YoY` : undefined
              }
            />
            <Kpi label="Median RevPAR (implied)" value={fmtRevpar(kpis.revparMedian)} />
            <Kpi label="Active properties" value={fmtInt(kpis.propertyCount)} />
            <Kpi label="Rooms (supply)" value={fmtInt(kpis.totalRooms)} />
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <section className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
              <h2 className="text-[13px] font-medium">Median RevPAR by quarter</h2>
              <div className="mt-3">
                <RevparTrendChart data={points} />
              </div>
            </section>
            <section className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
              <h2 className="text-[13px] font-medium">Total room receipts by quarter</h2>
              <div className="mt-3">
                <ReceiptsChart data={points} />
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <section className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
              <h2 className="text-[13px] font-medium">Steepest revenue decliners (trailing YoY)</h2>
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                {decliners.length === 0 && (
                  <li className="py-3 text-[13px] text-zinc-500">No scored hotels yet.</li>
                )}
                {decliners.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/hotels/${d.id}`}
                      className="flex items-center justify-between gap-3 py-2 text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <span className="min-w-0 truncate">
                        {d.name}
                        <span className="ml-2 text-zinc-500">{d.city}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 tabular-nums">
                        <span className="text-red-600 dark:text-red-300">{fmtPct(toNum(d.yoy))}</span>
                        <ScoreChip score={d.leadScore} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
              <h2 className="text-[13px] font-medium">
                Reported City of Dallas HOT revenue (fiscal years)
              </h2>
              <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                {hotRevenue.length === 0 && (
                  <li className="py-3 text-[13px] text-zinc-500">
                    Run pipeline/socrata_market.py to pull the Comptroller series.
                  </li>
                )}
                {hotRevenue.map((r) => (
                  <li
                    key={`${r.geography}-${r.year}`}
                    className="flex items-center justify-between py-2 text-[13px]"
                  >
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {r.geography.replace("city:", "City of ").replace("county:", "")} · FY
                      {r.year}
                    </span>
                    <span className="font-medium tabular-nums">{fmtMoney(r.taxCollected)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                Self-reported to the Comptroller (data.texas.gov). Context only — property-level
                numbers come from SIFT filings.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
