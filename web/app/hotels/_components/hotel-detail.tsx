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
import { explainComponent, hotelVerdict, type Tone } from "../../../lib/verdict";
import { InfoTip } from "../../_components/info";
import { Badge, ScoreChip } from "../../_components/score-chip";
import { ReceiptsBarChart, RevparVsBenchmarkChart } from "../[id]/quarterly-chart";
import { CopyButton } from "./copy-button";
import type { HotelDetail as HotelDetailData } from "./hotel-detail-data";

interface BreakdownComponent {
  points: number;
  max: number;
  rule: string;
}

function Section({
  title,
  id,
  term,
  hint,
  children,
}: {
  title: string;
  id?: string;
  term?: string; // glossary key → adds an InfoTip next to the title
  hint?: string; // plain sub-caption under the title
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-toc={id ? title : undefined} className="scroll-mt-4 rounded-lg bg-surface p-4">
      <h2 className="flex items-center gap-1 text-[13px] font-medium">
        {title}
        {term && <InfoTip term={term} label={title} />}
      </h2>
      {hint && <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value, term }: { label: string; value: React.ReactNode; term?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <span className="flex items-center gap-1 text-ink-muted">
        {label}
        {term && <InfoTip term={term} label={label} />}
      </span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

const SIGNAL_DOT: Record<Tone, string> = {
  red: "bg-hot",
  amber: "bg-warm",
  emerald: "bg-above",
  zinc: "bg-zinc-400 dark:bg-zinc-500",
};

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

  const verdict = hotelVerdict(hotel, score ?? null);
  // score.py stores revpar_index at the top level, not inside breakdown.inputs —
  // merge it in so explainComponent can read it.
  const inputs = {
    ...(((score?.scoreBreakdown as { inputs?: Record<string, unknown> } | null)?.inputs) ?? {}),
    revpar_index: toNum(score?.revparIndex),
  };

  const registeredAgent = owner?.registeredAgent as
    | { name?: string; address?: string; status?: string }
    | null;
  const officers = (owner?.officers as { name?: string; title?: string }[] | null) ?? null;

  const summary = (
    <Section id="summary" title="What this means">
      <p className="text-[15px] font-medium leading-snug">{verdict.headline}</p>
      <p className="mt-2 text-[13px] text-ink-muted">{verdict.summary}</p>
      {verdict.signals.length > 0 && (
        <ul className="mt-3 space-y-2">
          {verdict.signals.map((s, i) => (
            <li key={i} className="flex gap-2 text-[13px]">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SIGNAL_DOT[s.tone]}`} />
              <span>
                <span className="font-medium">{s.label}</span>
                <span className="text-ink-muted"> — {s.why}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );

  const performance = (
    <Section id="performance" title="Performance" hint="All revenue is estimated from quarterly hotel-tax filings.">
      <Fact label="Lead score" value={score?.leadScore ?? "—"} term="leadScore" />
      <Fact label="RevPAR index" value={idx != null ? idx.toFixed(0) : "—"} term="revparIndex" />
      <Fact label="Revenue per room / yr (est.)" value={fmtRevpar(toNum(score?.trailingRevpar4q))} term="revpar" />
      <Fact label="Est. revenue, last 12 mo." value={fmtMoney(score?.trailingRevenue4q)} term="trailing4q" />
      <Fact label="Change vs a year ago" value={fmtPct(toNum(score?.yoyRevenueChangePct))} term="yoy" />
      <Fact label="2-year trend" value={score?.slope8q ? `${score.slope8q}%/q` : "—"} term="slope" />
      <Fact label="Recovery vs 2019" value={score?.recoveryRatio ?? "—"} term="recovery" />
    </Section>
  );

  const ownerSection = (
    <Section
      id="owner"
      title="Owner & who to contact"
      term="dcad"
      hint="Owner and property values come from Dallas County records (DCAD)."
    >
      {owner ? (
        <>
          <Fact label="Owner (on record)" value={owner.ownerName ?? "—"} />
          <Fact
            label="Mailing address"
            value={
              owner.ownerAddress
                ? `${owner.ownerAddress}, ${owner.ownerCity ?? ""} ${owner.ownerState ?? ""} ${owner.ownerZip ?? ""}`
                : "—"
            }
          />
          {registeredAgent?.name && (
            <Fact label="Registered agent" value={registeredAgent.name} term="registeredAgent" />
          )}
          {registeredAgent?.address && (
            <Fact label="Agent address" value={registeredAgent.address} />
          )}
          {officers && officers.length > 0 && (
            <Fact
              label="Officers"
              value={officers.map((o) => [o.name, o.title].filter(Boolean).join(" · ")).join("; ")}
            />
          )}
          <Fact label="County market value" value={fmtMoneyFull(owner.marketValue)} term="marketValue" />
          <Fact label="Building value" value={fmtMoneyFull(owner.improvementValue)} term="improvementValue" />
          <Fact label="Land value" value={fmtMoneyFull(owner.landValue)} term="landValue" />
          <Fact label="Year built" value={owner.yearBuilt ?? "—"} />
          <Fact label="Building sq ft" value={fmtInt(owner.buildingSqft)} />
          <Fact label="DCAD account #" value={owner.dcadAccountNumber ?? "—"} />
          {registeredAgent?.name && (
            <p className="mt-2 border-t border-border pt-2 text-[11px] text-ink-muted">
              An LLC&apos;s registered agent is a real person legally required to receive its mail —
              often the clearest human to contact behind the business.
            </p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-ink-muted">Not yet matched to county property records.</p>
      )}
    </Section>
  );

  const taxpayer = (
    <Section
      id="taxpayer"
      title="Tax filer history"
      hint="The business that files this hotel's taxes. A change here usually means the hotel changed owners."
    >
      <Fact label="Current filer" value={hotel.currentTaxpayerName ?? "—"} />
      <Fact label="State taxpayer #" value={hotel.currentTaxpayerNumber ?? "—"} term="taxpayerNumber" />
      {hotel.priorTaxpayerNumbers.length > 0 && (
        <Fact label="Previous filers" value={hotel.priorTaxpayerNumbers.join(", ")} />
      )}
    </Section>
  );

  const revparChart = (
    <Section
      id="revpar"
      title="How much it earns per room vs. similar hotels"
      term="revparIndex"
      hint="White line = this hotel's estimated revenue per room. Blue dashed line = the typical (median) similar hotel. Red shading = quarters it earned below its peers."
    >
      {points.length ? (
        <RevparVsBenchmarkChart data={points} />
      ) : (
        <p className="text-[13px] text-ink-muted">No filings ingested.</p>
      )}
      <p className="mt-2 text-[11px] text-ink-muted">
        Revenue per room is estimated from tax filings (receipts ÷ rooms ÷ days). Compared against{" "}
        {score?.compSetCount ?? "—"} similar hotels (same city, size, and brand type).
      </p>
    </Section>
  );

  const receiptsChart = (
    <Section id="receipts" title="Room revenue each quarter" hint="Total room receipts reported to the state, quarter by quarter.">
      {points.length ? (
        <ReceiptsBarChart data={points} />
      ) : (
        <p className="text-[13px] text-ink-muted">No filings ingested.</p>
      )}
    </Section>
  );

  const quarterlyTable = points.length ? (
    <Section id="quarterly" title="Quarterly figures">
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

  const COMPONENT_TITLE: Record<string, string> = {
    underperformance: "Earns below the local average",
    trend: "Revenue is declining",
    distress: "Distress signals",
    profile: "Fits the target profile",
  };

  const scoreBreakdown = (
    <Section
      id="breakdown"
      title="How the lead score was built"
      term="leadScore"
      hint="The 0–100 score is the sum of four parts. Higher = more opportunity for a buyer."
    >
      {breakdown?.components ? (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {Object.entries(breakdown.components).map(([name, c]) => (
            <li key={name} className="flex items-start justify-between gap-4 py-2 text-[13px]">
              <div>
                <div className="font-medium">{COMPONENT_TITLE[name] ?? name}</div>
                <div className="text-[12px] text-ink-muted">
                  {explainComponent(name, inputs, c.points, c.max)}
                </div>
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
        {summary}
        {revparChart}
        {quarterlyTable}
        {performance}
        {scoreBreakdown}
        {ownerSection}
        {receiptsChart}
        {taxpayer}
      </div>
    );
  }

  return (
    <>
      {header}
      <div className="mt-4">{summary}</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
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
