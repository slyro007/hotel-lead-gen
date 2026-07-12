import Link from "next/link";
import { getHotelSeries } from "../../db/queries/hotels";
import {
  getMarketKpis,
  getMarketTrend,
  getReportedHotRevenue,
  getTopDecliners,
} from "../../db/queries/market";
import { requireApproved } from "../../lib/auth";
import { fmtInt, fmtMoney, fmtPct, fmtQuarter, fmtRevpar, toNum } from "../../lib/format";
import { impliedRevpar } from "../../lib/quarter";
import { Sparkline } from "../_components/charts";
import { EmptyState, NotApproved } from "../_components/not-approved";
import { ScoreChip } from "../_components/score-chip";
import { ReceiptsChart, RevparTrendChart, SupplyChart, type TrendPoint } from "./_components/market-charts";

export const dynamic = "force-dynamic";

function Kpi({
  label,
  value,
  delta,
  spark,
  sparkColor,
}: {
  label: string;
  value: string;
  delta?: number | null;
  spark?: (number | null)[];
  sparkColor?: string;
}) {
  return (
    <div className="rounded-lg bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          {delta != null && (
            <div className={`mt-0.5 text-[12px] tabular-nums ${delta < 0 ? "text-hot" : "text-above"}`}>
              {delta < 0 ? "▼" : "▲"} {fmtPct(delta, false)} YoY
            </div>
          )}
        </div>
        {spark && spark.some((v) => v != null) && (
          <div className="w-24 shrink-0">
            <Sparkline values={spark} color={sparkColor ?? "var(--color-ink-muted)"} height={34} />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="text-[13px] font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function MarketPage() {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const [kpis, trend, decliners, hotRevenue] = await Promise.all([
    getMarketKpis(),
    getMarketTrend(),
    getTopDecliners(),
    getReportedHotRevenue(),
  ]);

  const points: TrendPoint[] = trend.map((t) => ({
    period: fmtQuarter(t.year, t.quarter),
    revparMedian: toNum(t.revparMedian),
    totalReceipts: toNum(t.totalReceipts),
    totalRooms: t.totalRooms,
  }));

  const declinerSeries = await getHotelSeries(decliners.map((d) => d.id));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">Dallas County market</h1>

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
              delta={kpis.receiptsYoyPct}
              spark={points.map((p) => p.totalReceipts)}
              sparkColor="var(--color-foreground)"
            />
            <Kpi
              label="Median RevPAR (implied)"
              value={fmtRevpar(kpis.revparMedian)}
              spark={points.map((p) => p.revparMedian)}
              sparkColor="var(--color-benchmark)"
            />
            <Kpi label="Active properties" value={fmtInt(kpis.propertyCount)} />
            <Kpi
              label="Rooms (supply)"
              value={fmtInt(kpis.totalRooms)}
              spark={points.map((p) => p.totalRooms)}
              sparkColor="var(--color-benchmark)"
            />
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <SectionCard title="Median RevPAR by quarter">
              <RevparTrendChart data={points} />
            </SectionCard>
            <SectionCard title="Total room receipts by quarter">
              <ReceiptsChart data={points} />
            </SectionCard>
            <SectionCard title="Room supply by quarter">
              <SupplyChart data={points} />
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <SectionCard title="Steepest revenue decliners (trailing YoY)">
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {decliners.length === 0 && (
                  <li className="py-3 text-[13px] text-ink-muted">No scored hotels yet.</li>
                )}
                {decliners.map((d) => {
                  const spark = (declinerSeries.get(d.id) ?? []).map((p) =>
                    impliedRevpar(p.receipts, p.rooms, p.year, p.quarter)
                  );
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/hotels/${d.id}`}
                        scroll={false}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-[13px] transition-colors hover:bg-surface-raised"
                      >
                        <span className="min-w-0 truncate">
                          {d.name}
                          <span className="ml-2 text-ink-muted">{d.city}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3 tabular-nums">
                          <span className="w-16">
                            <Sparkline values={spark} color="var(--color-hot)" height={22} />
                          </span>
                          <span className="text-hot">{fmtPct(toNum(d.yoy))}</span>
                          <ScoreChip score={d.leadScore} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
            <SectionCard title="Reported City of Dallas HOT revenue (fiscal years)">
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {hotRevenue.length === 0 && (
                  <li className="py-3 text-[13px] text-ink-muted">
                    Run pipeline/socrata_market.py to pull the Comptroller series.
                  </li>
                )}
                {hotRevenue.map((r) => (
                  <li key={`${r.geography}-${r.year}`} className="flex items-center justify-between py-2 text-[13px]">
                    <span className="text-ink-muted">
                      {r.geography.replace("city:", "City of ").replace("county:", "")} · FY{r.year}
                    </span>
                    <span className="font-medium tabular-nums">{fmtMoney(r.taxCollected)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-ink-muted">
                Self-reported to the Comptroller (data.texas.gov). Context only — property-level
                numbers come from SIFT filings.
              </p>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
