// Number/date formatters. All money and counts render with tabular-nums (the
// class lives on the element; these produce the strings).

export function fmtMoney(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtMoneyFull(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtRevpar(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  return `$${n.toFixed(0)}`;
}

export function fmtPct(v: number | string | null | undefined, signed = true): string {
  const n = toNum(v);
  if (n == null) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function fmtIndex(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  return n.toFixed(0);
}

export function fmtInt(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** "2026Q1" or (2026, 1) -> "Q1 '26" */
export function fmtQuarter(year: number, quarter: number): string {
  return `Q${quarter} '${String(year).slice(2)}`;
}

export function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
