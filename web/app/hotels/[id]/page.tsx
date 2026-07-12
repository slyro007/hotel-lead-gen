import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { getHotel, getHotelFilings } from "../../../db/queries/hotels";
import { marketBenchmarks } from "../../../db/schema";
import { requireApproved } from "../../../lib/auth";
import {
  fmtInt,
  fmtMoney,
  fmtMoneyFull,
  fmtPct,
  fmtQuarter,
  fmtRevpar,
  toNum,
} from "../../../lib/format";
import { NotApproved } from "../../_components/not-approved";
import { Badge, ScoreChip } from "../../_components/score-chip";
import { isUnderperforming } from "../../../lib/score-labels";
import { RevparVsBenchmarkChart, ReceiptsBarChart, type FilingPoint } from "./quarterly-chart";

export const dynamic = "force-dynamic";

const DAYS: Record<number, number> = { 1: 90, 2: 91, 3: 92, 4: 92 };

function daysInQuarter(year: number, quarter: number): number {
  if (quarter === 1) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 91 : 90;
  return DAYS[quarter];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
      <h2 className="text-[13px] font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

interface BreakdownComponent {
  points: number;
  max: number;
  rule: string;
}

export default async function HotelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const { id } = await params;
  const row = await getHotel(id).catch(() => null);
  if (!row) notFound();
  const { hotel, score, owner } = row;

  const filings = await getHotelFilings(id);

  // Comp-set median series for the chart, from the score's own comp set key.
  let benchmarks = new Map<string, number>();
  if (score?.compSetKey) {
    const [geo, band, bclass] = score.compSetKey.split("|");
    const rows = await db
      .select({
        year: marketBenchmarks.year,
        quarter: marketBenchmarks.quarter,
        median: marketBenchmarks.revparMedian,
      })
      .from(marketBenchmarks)
      .where(
        and(
          eq(marketBenchmarks.geography, geo),
          eq(marketBenchmarks.roomBand, band),
          eq(marketBenchmarks.brandClass, bclass)
        )
      );
    benchmarks = new Map(rows.map((r) => [`${r.year}-${r.quarter}`, toNum(r.median) ?? 0]));
  }

  const points: FilingPoint[] = filings.map((f) => {
    const receipts = toNum(f.roomReceipts);
    const rooms = f.rooms || hotel.rooms;
    return {
      period: fmtQuarter(f.year, f.quarter),
      receipts,
      revpar:
        receipts != null && rooms
          ? receipts / (rooms * daysInQuarter(f.year, f.quarter))
          : null,
      benchmarkRevpar: benchmarks.get(`${f.year}-${f.quarter}`) ?? null,
    };
  });

  const breakdown = (score?.scoreBreakdown ?? null) as {
    inputs?: Record<string, unknown>;
    components?: Record<string, BreakdownComponent>;
  } | null;
  const idx = toNum(score?.revparIndex);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-fade-up">
      <Link href="/hotels" className="text-[13px] text-zinc-500 hover:text-foreground">
        ← Hotels
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{hotel.locationName}</h1>
        <ScoreChip score={score?.leadScore ?? null} showLabel />
        {score?.stoppedFiling && <Badge tone="red">stopped filing</Badge>}
        {isUnderperforming(idx) && <Badge tone="red">underperforming</Badge>}
        {hotel.brandClass === "independent" && <Badge tone="zinc">independent</Badge>}
        {hotel.brandFamily && <Badge tone="blue">{hotel.brandFamily}</Badge>}
      </div>
      <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
        {hotel.address}, {hotel.city} TX {hotel.zip} · {fmtInt(hotel.rooms)} rooms ·{" "}
        filings {hotel.firstPeriod}–{hotel.lastPeriod}
        {hotel.latitude && (
          <>
            {" · "}
            <a
              className="underline"
              href={`https://www.google.com/maps?q=${hotel.latitude},${hotel.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              map
            </a>
          </>
        )}
      </p>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Section title="Implied RevPAR vs comp-set median">
            {points.length ? (
              <RevparVsBenchmarkChart data={points} />
            ) : (
              <p className="text-[13px] text-zinc-500">No filings ingested.</p>
            )}
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Implied from tax filings: receipts ÷ (rooms × days). Comp set:{" "}
              {score?.compSetKey ?? "—"} ({score?.compSetCount ?? "—"} properties).
            </p>
          </Section>
          <Section title="Quarterly room receipts">
            {points.length ? (
              <ReceiptsBarChart data={points} />
            ) : (
              <p className="text-[13px] text-zinc-500">No filings ingested.</p>
            )}
          </Section>

          <Section title="Score breakdown">
            {breakdown?.components ? (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {Object.entries(breakdown.components).map(([name, c]) => (
                  <li key={name} className="flex items-center justify-between gap-4 py-2 text-[13px]">
                    <div>
                      <div className="font-medium capitalize">{name}</div>
                      <div className="text-[12px] text-zinc-500 dark:text-zinc-400">{c.rule}</div>
                    </div>
                    <div className="shrink-0 tabular-nums">
                      <span className="font-semibold">{c.points}</span>
                      <span className="text-zinc-500"> / {c.max}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-zinc-500">Not scored yet — run pipeline/score.py.</p>
            )}
          </Section>
        </div>

        <div className="space-y-3">
          <Section title="Performance">
            <Fact label="Lead score" value={score?.leadScore ?? "—"} />
            <Fact label="RevPAR index" value={idx != null ? idx.toFixed(0) : "—"} />
            <Fact label="Trailing 4Q RevPAR" value={fmtRevpar(toNum(score?.trailingRevpar4q))} />
            <Fact label="Trailing 4Q revenue" value={fmtMoney(score?.trailingRevenue4q)} />
            <Fact label="YoY revenue" value={fmtPct(toNum(score?.yoyRevenueChangePct))} />
            <Fact label="8Q slope" value={score?.slope8q ? `${score.slope8q}%/q` : "—"} />
            <Fact label="Recovery vs 2019" value={score?.recoveryRatio ?? "—"} />
          </Section>

          <Section title="Owner (DCAD)">
            {owner ? (
              <>
                <Fact label="Owner" value={owner.ownerName ?? "—"} />
                <Fact
                  label="Mailing"
                  value={
                    owner.ownerAddress
                      ? `${owner.ownerAddress}, ${owner.ownerCity ?? ""} ${owner.ownerState ?? ""} ${owner.ownerZip ?? ""}`
                      : "—"
                  }
                />
                <Fact label="Market value" value={fmtMoneyFull(owner.marketValue)} />
                <Fact label="Improvements" value={fmtMoneyFull(owner.improvementValue)} />
                <Fact label="Land" value={fmtMoneyFull(owner.landValue)} />
                <Fact label="Year built" value={owner.yearBuilt ?? "—"} />
                <Fact label="Building sqft" value={fmtInt(owner.buildingSqft)} />
                <Fact label="DCAD account" value={owner.dcadAccountNumber ?? "—"} />
              </>
            ) : (
              <p className="text-[13px] text-zinc-500">
                Not matched to DCAD yet — run pipeline/dcad_match.py.
              </p>
            )}
          </Section>

          <Section title="Taxpayer">
            <Fact label="Current filer" value={hotel.currentTaxpayerName ?? "—"} />
            <Fact label="Taxpayer #" value={hotel.currentTaxpayerNumber ?? "—"} />
            {hotel.priorTaxpayerNumbers.length > 0 && (
              <Fact
                label="Prior taxpayer #s"
                value={hotel.priorTaxpayerNumbers.join(", ")}
              />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
