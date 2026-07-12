// Quarter math shared by the detail page, lead cards, and the series query.
// Implied RevPAR = room receipts ÷ (rooms × days in quarter) — the same
// formula pipeline/score.py uses, kept in one place on the web side.

const QUARTER_MONTHS: Record<number, [number, number]> = {
  1: [0, 2], // Jan–Mar
  2: [3, 5], // Apr–Jun
  3: [6, 8], // Jul–Sep
  4: [9, 11], // Oct–Dec
};

/** Calendar days in a given year/quarter (leap-year aware). */
export function daysInQuarter(year: number, quarter: number): number {
  const [startMonth, endMonth] = QUARTER_MONTHS[quarter] ?? [0, 2];
  const start = Date.UTC(year, startMonth, 1);
  const end = Date.UTC(year, endMonth + 1, 1); // first day of the next month
  return Math.round((end - start) / 86_400_000);
}

/** Implied RevPAR for one filing; null when rooms or receipts are missing. */
export function impliedRevpar(
  receipts: number | null | undefined,
  rooms: number | null | undefined,
  year: number,
  quarter: number
): number | null {
  if (receipts == null || rooms == null || rooms <= 0) return null;
  return receipts / (rooms * daysInQuarter(year, quarter));
}

/** Sortable integer for a period, e.g. 2026 Q1 -> 20261. */
export function periodKey(year: number, quarter: number): number {
  return year * 10 + quarter;
}
