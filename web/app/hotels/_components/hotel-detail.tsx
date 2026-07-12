import Link from "next/link";
import {
  fmtInt,
  fmtMoney,
  fmtMoneyFull,
  fmtPct,
  fmtRevpar,
  toNum,
} from "../../../lib/format";
import { isUnderperforming } from "../../../lib/score-labels";
import { Badge, ScoreChip } from "../../_components/score-chip";
import { ReceiptsBarChart, RevparVsBenchmarkChart } from "../[id]/quarterly-chart";
import { CopyButton } from "./copy-button";
import type { HotelDetail as HotelDetailData } from "./hotel-detail-data";

interface BreakdownComponent {
  points: number;
  max: number;
  rule: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="text-[13px] font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Shared detail body for both the full page (`variant="page"`, wide grid) and
 * the slide-over panel (`variant="panel"`, single column).
 */
export function HotelDetail({
  data,
  variant,
}: {
  data: HotelDetailData;
  variant: "page" | "panel";
}) {
  const { hotel, score, owner, points } = data;
  const idx = toNum(score?.revparIndex);
  const breakdown = (score?.scoreBreakdown ?? null) as {
    components?: Record<string, BreakdownComponent>;
  } | null;

  const mailing = owner?.ownerAddress
    ? `${owner.ownerName ?? ""}\n${owner.ownerAddress}, ${owner.ownerCity ?? ""} ${owner.ownerState ?? ""} ${owner.ownerZip ?? ""}`.trim()
    : null;

  const performance = (
    <Section title="Performance">
      <Fact label="Lead score" value={score?.leadScore ?? "—"} />
      <Fact label="RevPAR index" value={idx != null ? idx.toFixed(0) : "—"} />
      <Fact label="Trailing 4Q RevPAR" value={fmtRevpar(toNum(score?.trailingRevpar4q))} />
      <Fact label="Trailing 4Q revenue" value={fmtMoney(score?.trailingRevenue4q)} />
      <Fact label="YoY revenue" value={fmtPct(toNum(score?.yoyRevenueChangePct))} />
      <Fact label="8Q slope" value={score?.slope8q ? `${score.slope8q}%/q` : "—"} />
      <Fact label="Recovery vs 2019" value={score?.recoveryRatio ?? "—"} />
    </Section>
  );

  const ownerSection = (
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
        <p className="text-[13px] text-ink-muted">Not matched to DCAD yet.</p>
      )}
    </Section>
  );

  const taxpayer = (
    <Section title="Taxpayer">
      <Fact label="Current filer" value={hotel.currentTaxpayerName ?? "—"} />
      <Fact label="Taxpayer #" value={hotel.currentTaxpayerNumber ?? "—"} />
      {hotel.priorTaxpayerNumbers.length > 0 && (
        <Fact label="Prior taxpayer #s" value={hotel.priorTaxpayerNumbers.join(", ")} />
      )}
    </Section>
  );

  const revparChart = (
    <Section title="Implied RevPAR vs comp-set median">
      {points.length ? (
        <RevparVsBenchmarkChart data={points} />
      ) : (
        <p className="text-[13px] text-ink-muted">No filings ingested.</p>
      )}
      <p className="mt-2 text-[11px] text-ink-muted">
        Implied from tax filings: receipts ÷ (rooms × days). Comp set: {score?.compSetKey ?? "—"} (
        {score?.compSetCount ?? "—"} properties). Red band = below the comp-set median.
      </p>
    </Section>
  );

  const receiptsChart = (
    <Section title="Quarterly room receipts">
      {points.length ? (
        <ReceiptsBarChart data={points} />
      ) : (
        <p className="text-[13px] text-ink-muted">No filings ingested.</p>
      )}
    </Section>
  );

  const quarterlyTable = points.length ? (
    <Section title="Quarterly figures">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <tr className="border-b border-border text-ink-muted [&>th]:py-1.5 [&>th]:pr-3 [&>th]:font-medium">
              <th className="text-left">Quarter</th>
              <th className="text-right">Receipts</th>
              <th className="text-right">RevPAR</th>
              <th className="text-right">Comp median</th>
              <th className="text-right">Index</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.period} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900 [&>td]:py-1.5 [&>td]:pr-3">
                <td className="text-left">{p.period}</td>
                <td className="text-right">{fmtMoney(p.receipts)}</td>
                <td className="text-right">{fmtRevpar(p.revpar)}</td>
                <td className="text-right text-benchmark">{fmtRevpar(p.benchmarkRevpar)}</td>
                <td className={`text-right ${p.index != null && p.index < 75 ? "text-hot" : ""}`}>
                  {p.index != null ? p.index.toFixed(0) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  ) : null;

  const scoreBreakdown = (
    <Section title="Score breakdown">
      {breakdown?.components ? (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {Object.entries(breakdown.components).map(([name, c]) => (
            <li key={name} className="flex items-center justify-between gap-4 py-2 text-[13px]">
              <div>
                <div className="font-medium capitalize">{name}</div>
                <div className="text-[12px] text-ink-muted">{c.rule}</div>
              </div>
              <div className="shrink-0 tabular-nums">
                <span className="font-semibold">{c.points}</span>
                <span className="text-ink-muted"> / {c.max}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-muted">Not scored yet.</p>
      )}
    </Section>
  );

  const actionBar = (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/export/hotels?ids=${hotel.id}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-foreground"
      >
        Export row
      </a>
      {hotel.latitude && (
        <a
          href={`https://www.google.com/maps?q=${hotel.latitude},${hotel.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-foreground"
        >
          Google Maps ↗
        </a>
      )}
      {mailing && <CopyButton text={mailing} label="Copy owner address" />}
    </div>
  );

  const header = (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={variant === "panel" ? "text-lg font-semibold tracking-tight" : "text-xl font-semibold tracking-tight"}>
          {hotel.locationName}
        </h1>
        <ScoreChip score={score?.leadScore ?? null} showLabel />
        {score?.stoppedFiling && <Badge tone="red">stopped filing</Badge>}
        {isUnderperforming(idx) && <Badge tone="red">underperforming</Badge>}
        {hotel.brandClass === "independent" && <Badge tone="zinc">independent</Badge>}
        {hotel.brandFamily && <Badge tone="blue">{hotel.brandFamily}</Badge>}
      </div>
      <p className="mt-1 text-[13px] text-ink-muted">
        {hotel.address}, {hotel.city} TX {hotel.zip} · {fmtInt(hotel.rooms)} rooms · filings{" "}
        {hotel.firstPeriod}–{hotel.lastPeriod}
      </p>
      <div className="mt-3">{actionBar}</div>
    </div>
  );

  if (variant === "panel") {
    return (
      <div className="space-y-3">
        {header}
        {revparChart}
        {quarterlyTable}
        {performance}
        {ownerSection}
        {receiptsChart}
        {scoreBreakdown}
        {taxpayer}
      </div>
    );
  }

  return (
    <>
      {header}
      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {revparChart}
          {receiptsChart}
          {quarterlyTable}
          {scoreBreakdown}
        </div>
        <div className="space-y-3">
          {performance}
          {ownerSection}
          {taxpayer}
        </div>
      </div>
    </>
  );
}
