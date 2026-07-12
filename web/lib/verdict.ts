// Rule-based plain-English "verdict" for a hotel — the one-line reason PRODUCT.md
// promised. Everything here is derived from numbers already computed by
// pipeline/score.py (stored on hotel_scores + its score_breakdown jsonb); no
// LLM, no extra query. Copy stays honest: revenue is "implied/estimated", and
// every claim traces back to a stored input.

import { toNum } from "./format";
import { scoreBand, type ScoreBand } from "./score-labels";

export type Tone = "red" | "amber" | "emerald" | "zinc";

export interface Signal {
  tone: Tone;
  label: string; // short bold phrase
  why: string; // plain explanation
}

export interface Verdict {
  headline: string; // one sentence
  summary: string; // 2–3 sentences
  signals: Signal[];
  band: ScoreBand;
}

// Minimal shapes we read (the loaders already return these).
interface ScoreLike {
  leadScore: number | null;
  revparIndex: string | number | null;
  yoyRevenueChangePct: string | number | null;
  recoveryRatio: string | number | null;
  stoppedFiling: boolean | null;
  quartersSinceLastFiling: number | null;
  scoreBreakdown: unknown;
}
interface HotelLike {
  rooms: number | null;
  brandClass: string | null;
  brandFamily: string | null;
  city: string | null;
}

interface BreakdownInputs {
  single_quarter_collapse?: number | null;
  year_built?: number | null;
  comp_set_count?: number | null;
}

function inputsOf(score: ScoreLike): BreakdownInputs {
  const b = score.scoreBreakdown as { inputs?: BreakdownInputs } | null;
  return b?.inputs ?? {};
}

/** "about a third", "about half", … falling back to "about N%". */
function fractionWords(index: number): string {
  const pct = Math.round(index);
  const near: [number, string][] = [
    [20, "about a fifth"],
    [25, "about a quarter"],
    [33, "about a third"],
    [40, "about two-fifths"],
    [50, "about half"],
    [60, "about three-fifths"],
    [66, "about two-thirds"],
    [75, "about three-quarters"],
  ];
  for (const [n, words] of near) {
    if (Math.abs(pct - n) <= 3) return words;
  }
  return `about ${pct}%`;
}

const cityLabel = (city: string | null) => (city ? city.charAt(0) + city.slice(1).toLowerCase() : "nearby");

/** The full verdict for the detail view. */
export function hotelVerdict(hotel: HotelLike, score: ScoreLike | null): Verdict {
  const band = scoreBand(score?.leadScore ?? null);
  if (!score) {
    return {
      headline: "Not enough tax data yet to size this hotel up.",
      summary: "We don't have enough recent filings to estimate how this hotel is doing.",
      signals: [],
      band,
    };
  }

  const idx = toNum(score.revparIndex);
  const yoy = toNum(score.yoyRevenueChangePct);
  const recovery = toNum(score.recoveryRatio);
  const inputs = inputsOf(score);
  const collapse = !!inputs.single_quarter_collapse; // boolean flag from score.py
  const qSince = score.quartersSinceLastFiling ?? null;
  const stopped = !!score.stoppedFiling;
  const city = cityLabel(hotel.city);
  const signals: Signal[] = [];

  // 1. How it earns vs. peers.
  if (idx != null) {
    if (idx < 75) {
      signals.push({
        tone: "red",
        label: "Earns below market",
        why: `Brings in ${fractionWords(idx)} of the room revenue that comparable ${city} hotels its size make (index ${idx.toFixed(0)}, where 100 is average).`,
      });
    } else if (idx < 95) {
      signals.push({
        tone: "amber",
        label: "Slightly below market",
        why: `Earns a bit less per room than similar ${city} hotels (index ${idx.toFixed(0)}, where 100 is average).`,
      });
    } else if (idx <= 110) {
      signals.push({
        tone: "emerald",
        label: "About at market",
        why: `Earns roughly the same per room as comparable ${city} hotels (index ${idx.toFixed(0)}).`,
      });
    } else {
      signals.push({
        tone: "emerald",
        label: "Earns above market",
        why: `Out-earns comparable ${city} hotels per room (index ${idx.toFixed(0)}, where 100 is average).`,
      });
    }
  }

  // 2. Trend.
  if (yoy != null) {
    if (yoy <= -25) {
      signals.push({ tone: "red", label: "Revenue falling fast", why: `Estimated revenue is down ${Math.abs(yoy).toFixed(0)}% from a year ago.` });
    } else if (yoy <= -8) {
      signals.push({ tone: "amber", label: "Revenue slipping", why: `Estimated revenue is down ${Math.abs(yoy).toFixed(0)}% from a year ago.` });
    } else if (yoy < 8) {
      signals.push({ tone: "zinc", label: "Revenue roughly flat", why: `Estimated revenue is about the same as a year ago (${yoy >= 0 ? "+" : ""}${yoy.toFixed(0)}%).` });
    } else {
      signals.push({ tone: "emerald", label: "Revenue growing", why: `Estimated revenue is up ${yoy.toFixed(0)}% from a year ago.` });
    }
  }

  // 3. Distress: gone quiet / one-quarter collapse / weak recovery.
  if (stopped && qSince != null) {
    signals.push({
      tone: qSince >= 2 ? "red" : "amber",
      label: qSince >= 2 ? "Gone quiet" : "Missed a filing",
      why:
        qSince >= 2
          ? `Hasn't filed hotel taxes in ${qSince} quarters — hotels must file quarterly, so this often means it closed, sold, or is in trouble.`
          : "Missed its most recent quarterly tax filing.",
    });
  }
  if (collapse) {
    signals.push({ tone: "red", label: "A quarter cratered", why: "In one recent quarter, estimated revenue fell more than 40% versus the same quarter a year earlier." });
  }
  if (recovery != null && recovery < 0.75) {
    signals.push({ tone: "amber", label: "Never recovered", why: `Still earning about ${Math.round(recovery * 100)}% of its pre-2020 (2019) rate per room.` });
  }

  // 4. Profile.
  if (hotel.brandClass === "independent") {
    signals.push({ tone: "zinc", label: "Independent", why: "No national chain (Marriott, Hilton, etc.) behind it — no brand marketing or loyalty program." });
  } else if (hotel.brandFamily) {
    signals.push({ tone: "zinc", label: `${hotel.brandFamily} brand`, why: `Flies the ${hotel.brandFamily} flag.` });
  }
  if (hotel.rooms != null && hotel.rooms >= 20 && hotel.rooms <= 120) {
    signals.push({ tone: "zinc", label: "Small property", why: `${hotel.rooms} rooms — a size that's realistic to buy or convert.` });
  }
  if (inputs.year_built && inputs.year_built < 1990) {
    signals.push({ tone: "zinc", label: "Older building", why: `Built in ${inputs.year_built}.` });
  }

  // Headline — lead with the strongest 1–2 things.
  const headline = buildHeadline({ idx, yoy, stopped, qSince, band, city });

  // Summary paragraph.
  const summary = buildSummary({ score, band, signals });

  return { headline, summary, signals, band };
}

function buildHeadline(a: {
  idx: number | null;
  yoy: number | null;
  stopped: boolean;
  qSince: number | null;
  band: ScoreBand;
  city: string;
}): string {
  if (a.stopped && a.qSince != null && a.qSince >= 2) {
    return `Has gone quiet — no tax filing in ${a.qSince} quarters, a strong sign it closed or changed hands.`;
  }
  const parts: string[] = [];
  if (a.idx != null) {
    if (a.idx < 75) parts.push(`Earning ${fractionWords(a.idx)} of what comparable ${a.city} hotels make per room`);
    else if (a.idx < 95) parts.push(`Earning a bit below the local average`);
    else if (a.idx <= 110) parts.push(`Earning about the local average`);
    else parts.push(`Earning above the local average`);
  }
  if (a.yoy != null && a.yoy <= -8) parts.push(`with revenue down ${Math.abs(a.yoy).toFixed(0)}% from a year ago`);
  else if (a.yoy != null && a.yoy >= 8) parts.push(`and revenue up ${a.yoy.toFixed(0)}% from a year ago`);

  if (parts.length === 0) {
    return a.band === "watch" ? "Looks stable — not a distress signal right now." : "Shows some signals worth a look.";
  }
  const sentence = parts.join(", ") + ".";
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function buildSummary(a: { score: ScoreLike; band: ScoreBand; signals: Signal[] }): string {
  const score = a.score.leadScore ?? 0;
  const bandWord = a.band === "hot" ? "a strong lead" : a.band === "warm" ? "a moderate lead" : "a low-priority watch";
  const concerns = a.signals.filter((s) => s.tone === "red" || s.tone === "amber");
  if (concerns.length === 0) {
    return `Nothing here points to distress right now. That's why its lead score is ${score}/100 — ${bandWord}. All figures are estimated from quarterly hotel-tax filings.`;
  }
  const lead = concerns.slice(0, 2).map((s) => s.label.toLowerCase()).join(" and ");
  return `The main flags are: ${lead}. Add its profile and history, and it scores ${score}/100 — ${bandWord}. All revenue figures are estimated from quarterly hotel-tax filings, not the hotel's own books.`;
}

/** One short line for the lead card, from list-row aggregates only. */
export function cardHeadline(row: {
  leadScore: number | null;
  revparIndex: string | number | null;
  yoy: string | number | null;
  stoppedFiling: boolean | null;
}): string {
  if (row.stoppedFiling) return "Stopped filing taxes — may have closed or sold.";
  const idx = toNum(row.revparIndex);
  const yoy = toNum(row.yoy);
  const bits: string[] = [];
  if (idx != null) {
    if (idx < 75) bits.push(`earns ${fractionWords(idx)} of the local average`);
    else if (idx < 95) bits.push("earns a bit below market");
    else if (idx <= 110) bits.push("earns about the market average");
    else bits.push("earns above market");
  }
  if (yoy != null && yoy <= -8) bits.push(`down ${Math.abs(yoy).toFixed(0)}% YoY`);
  else if (yoy != null && yoy >= 8) bits.push(`up ${yoy.toFixed(0)}% YoY`);
  if (bits.length === 0) return "Stable performer — low distress signals.";
  const s = bits.join(", ") + ".";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Plain-English rewrite of a score-breakdown component (replaces the formula). */
export function explainComponent(
  name: string,
  inputs: Record<string, unknown>,
  points: number,
  max: number
): string {
  const pts = `${points} of ${max} points`;
  const idx = toNum((inputs.revpar_index as number) ?? null);
  const yoy = toNum((inputs.yoy_pct as number) ?? null);
  const slope = toNum((inputs.slope_8q_pct_per_q as number) ?? null);
  const recovery = toNum((inputs.recovery_vs_2019 as number) ?? null);
  const collapse = !!inputs.single_quarter_collapse;
  const stopped = !!inputs.stopped_filing;
  const qSince = (inputs.quarters_since_last_filing as number) ?? null;
  const rooms = (inputs.rooms as number) ?? null;
  const yearBuilt = (inputs.year_built as number) ?? null;

  switch (name) {
    case "underperformance":
      if (idx == null) return `Not enough data to compare it to peers — ${pts}.`;
      if (idx >= 100) return `Earns at or above the local average (index ${idx.toFixed(0)}) — no penalty, ${pts}.`;
      return `Earns below the local average (index ${idx.toFixed(0)}, where 100 is typical). The further below, the more points — ${pts}.`;
    case "trend": {
      const trendBits: string[] = [];
      if (yoy != null) trendBits.push(yoy <= -8 ? `revenue is down ${Math.abs(yoy).toFixed(0)}% year-over-year` : yoy >= 8 ? `revenue is up ${yoy.toFixed(0)}% year-over-year` : "revenue is roughly flat year-over-year");
      if (slope != null && slope <= -3) trendBits.push("and still sliding over the last two years");
      return `${trendBits.length ? trendBits.join(" ") : "Revenue trend is steady"} — ${pts}.`;
    }
    case "distress": {
      const d: string[] = [];
      if (stopped && qSince != null) d.push(qSince >= 2 ? `hasn't filed in ${qSince} quarters (often means closed or sold)` : "missed its latest filing");
      if (collapse) d.push("one quarter's revenue collapsed by more than 40% year-over-year");
      if (recovery != null && recovery < 0.75) d.push(`still under 75% of its 2019 level`);
      return d.length ? `Distress signals: ${d.join("; ")} — ${pts}.` : `No distress signals — ${pts}.`;
    }
    case "profile": {
      const p: string[] = [];
      if (inputs.brand_class === "independent") p.push("independent (no chain)");
      if (rooms != null && rooms >= 20 && rooms <= 120) p.push(`a buyable size (${rooms} rooms)`);
      if (yearBuilt && yearBuilt < 1990) p.push(`older building (built ${yearBuilt})`);
      return p.length ? `Profile fit: ${p.join(", ")} — ${pts}.` : `Profile is neutral — ${pts}.`;
    }
    default:
      return pts;
  }
}
