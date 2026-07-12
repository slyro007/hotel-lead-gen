import { getHotelSeries, listCities, listHotels, type HotelFilters } from "../../db/queries/hotels";
import { requireApproved } from "../../lib/auth";
import { impliedRevpar } from "../../lib/quarter";
import { NotApproved } from "../_components/not-approved";
import { ExplorerShell } from "./_components/explorer-shell";

export const dynamic = "force-dynamic";

export default async function HotelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const raw = await searchParams;
  const f: HotelFilters = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const [rows, cities] = await Promise.all([listHotels(f), listCities()]);
  const series = await getHotelSeries(rows.map((r) => r.id));

  // Precompute the 6-quarter implied-RevPAR sparkline per hotel on the server
  // so the client bundle stays light (no raw filings shipped).
  const sparklines: Record<string, (number | null)[]> = {};
  for (const r of rows) {
    const pts = series.get(r.id) ?? [];
    sparklines[r.id] = pts.map((p) => impliedRevpar(p.receipts, p.rooms, p.year, p.quarter));
  }

  const view = raw.view === "table" ? "table" : "map";

  return (
    <ExplorerShell rows={rows} sparklines={sparklines} cities={cities} initialView={view} />
  );
}
