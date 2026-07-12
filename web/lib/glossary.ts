// Plain-language definitions for every term the dashboard uses. Written for
// someone who has never worked in hotels. Keep each to one or two sentences;
// the InfoTip and the /help page both render straight from here.

export interface GlossaryEntry {
  term: string; // display name
  plain: string; // one-sentence, non-expert definition
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  leadScore: {
    term: "Lead score",
    plain:
      "A 0–100 rating of how promising a hotel is as an acquisition target. Higher means more signs of trouble for the current owner — and more opportunity for a buyer. It adds up four things: how far below the local average it earns, whether revenue is falling, distress signals like it going dark, and its profile (small, older, independent).",
  },
  revpar: {
    term: "RevPAR",
    plain:
      "Revenue per available room per day — roughly, how much money each room brings in on an average night, whether or not it was rented. It rewards both high prices and high occupancy, so it's the standard way to compare hotels of different sizes.",
  },
  revparIndex: {
    term: "RevPAR index",
    plain:
      "How this hotel's room revenue compares to similar Dallas hotels (same city, size, and brand type). 100 means it earns right at the local average; below 100 means it earns less than its peers; 75 or under is flagged as underperforming.",
  },
  compSet: {
    term: "Comp set",
    plain:
      "The 'comparable set' — the group of nearby hotels we measure this one against: same city, similar room count, and same brand type (chain vs. independent). It's the fair yardstick, so a small motel isn't judged against a giant convention hotel.",
  },
  impliedRevpar: {
    term: "Implied RevPAR",
    plain:
      "We don't have hotels' internal booking systems, so we estimate revenue-per-room from their tax filings: room receipts ÷ (rooms × days in the quarter). It's an estimate, labeled 'implied,' not an exact figure.",
  },
  occupancyTax: {
    term: "Hotel occupancy tax (HOT)",
    plain:
      "A tax hotels collect on room stays and report to the state every quarter. Because they report their total room receipts, those filings let us estimate each hotel's revenue — that's the backbone of this whole tool.",
  },
  yoy: {
    term: "Year-over-year (YoY)",
    plain:
      "The change compared to the same period one year earlier — e.g. this year's Q1 vs. last year's Q1. Comparing the same season avoids being fooled by normal busy/slow months.",
  },
  trailing4q: {
    term: "Trailing 4 quarters",
    plain:
      "The most recent four quarters added together — a rolling full year. Using a whole year smooths out seasonal swings so one slow winter doesn't distort the picture.",
  },
  slope: {
    term: "8-quarter trend (slope)",
    plain:
      "The overall direction of revenue across the last two years — steadily rising, flat, or sliding — expressed as a percent change per quarter. A steep negative slope means a sustained decline, not just one bad quarter.",
  },
  recovery: {
    term: "Recovery vs. 2019",
    plain:
      "How this hotel's current revenue-per-room compares to its 2019 (pre-pandemic) level. Below 0.75 means it's still earning under three-quarters of what it did before 2020 — a sign it never bounced back.",
  },
  stoppedFiling: {
    term: "Stopped filing",
    plain:
      "The hotel has missed its recent tax filings. Hotels are required to file every quarter, so going quiet often means it closed, changed hands, or is in trouble — a strong distress signal.",
  },
  underperforming: {
    term: "Underperforming",
    plain:
      "Earning noticeably less per room than comparable hotels nearby — specifically a RevPAR index under 75 (below three-quarters of the local average).",
  },
  brandClass: {
    term: "Branded vs. independent",
    plain:
      "Whether the hotel flies a national flag (Marriott, Hilton, etc.) or runs on its own. Independents have no chain marketing or loyalty program behind them, so they more often struggle — and are easier to approach.",
  },
  dcad: {
    term: "DCAD",
    plain:
      "The Dallas Central Appraisal District — the county office that keeps public property records. It's where the owner name, mailing address, and appraised values come from.",
  },
  registeredAgent: {
    term: "Registered agent",
    plain:
      "Every Texas business must name a real person (or company) who is legally required to receive its official mail and legal notices. For a hotel owned by an LLC, the registered agent is often the clearest human to contact.",
  },
  marketValue: {
    term: "Market value",
    plain:
      "The county's estimate of what the whole property (land + building) is worth for tax purposes. It's an appraisal figure, not a sale price.",
  },
  improvementValue: {
    term: "Improvement value",
    plain:
      "The county's appraised value of the buildings on the land (the 'improvements'), separate from the land itself. Low building value per room can hint at an older or tired property.",
  },
  landValue: {
    term: "Land value",
    plain: "The county's appraised value of the land alone, without the buildings.",
  },
  supply: {
    term: "Room supply",
    plain:
      "The total number of hotel rooms in the market. Rising supply with flat demand pushes everyone's revenue-per-room down.",
  },
  taxpayerNumber: {
    term: "Taxpayer number",
    plain:
      "The state ID for the business that files the hotel's taxes. When it changes for the same address, the hotel likely changed owners — itself a useful signal.",
  },
};

export function glossary(key: string): GlossaryEntry | null {
  return GLOSSARY[key] ?? null;
}
