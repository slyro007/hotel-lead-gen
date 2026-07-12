import { GLOSSARY } from "../../lib/glossary";
import { requireApproved } from "../../lib/auth";
import { NotApproved } from "../_components/not-approved";

export const dynamic = "force-dynamic";

const SCORE_PARTS = [
  {
    title: "Earns below the local average (up to 40 pts)",
    body: "How far the hotel's estimated revenue per room falls short of comparable hotels nearby. The further below, the more points.",
  },
  {
    title: "Revenue is declining (up to 25 pts)",
    body: "Whether revenue is down versus a year ago and still sliding over the last two years.",
  },
  {
    title: "Distress signals (up to 20 pts)",
    body: "Red flags like the hotel going quiet (missing tax filings), one quarter collapsing, or never recovering to its pre-2020 level.",
  },
  {
    title: "Fits the target profile (up to 15 pts)",
    body: "Whether it's the kind of property that's realistic to buy or convert: independent (no chain), a smaller size, older building.",
  },
];

export default async function HelpPage() {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const entries = Object.values(GLOSSARY);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">How to read this</h1>
      <p className="mt-1 text-[14px] text-ink-muted">
        A plain-English guide to what everything on this dashboard means. No hotel experience needed.
      </p>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">The one thing to know</h2>
        <p className="mt-2 text-[14px] leading-relaxed">
          Hotels report their room revenue to the state every quarter for tax purposes. We use those
          filings to estimate how much each Dallas County hotel earns, compare it to similar hotels,
          and flag the ones that look like they&apos;re struggling — because a struggling hotel is
          often one an investor can buy. Every hotel gets a <strong>lead score from 0 to 100</strong>
          ; higher means more opportunity.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">How the lead score works</h2>
        <p className="mt-2 text-[13px] text-ink-muted">Four parts add up to the 0–100 score:</p>
        <ul className="mt-3 space-y-3">
          {SCORE_PARTS.map((p) => (
            <li key={p.title} className="rounded-lg bg-surface p-3">
              <div className="text-[14px] font-medium">{p.title}</div>
              <div className="mt-0.5 text-[13px] text-ink-muted">{p.body}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">Every term, explained</h2>
        <dl className="mt-3 divide-y divide-border">
          {entries.map((e) => (
            <div key={e.term} className="py-3">
              <dt className="text-[14px] font-medium">{e.term}</dt>
              <dd className="mt-0.5 text-[13px] text-ink-muted">{e.plain}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-8 text-[12px] text-ink-muted">
        A reminder on honesty: we don&apos;t have hotels&apos; internal booking systems, so revenue
        figures are <em>estimated</em> from tax filings, not exact. The dashboard always labels these
        as estimates and shows you the underlying numbers.
      </p>
    </div>
  );
}
