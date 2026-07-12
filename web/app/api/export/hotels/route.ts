import { NextRequest } from "next/server";
import { listHotels, type HotelFilters } from "../../../../db/queries/hotels";
import { requireApproved } from "../../../../lib/auth";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The outreach payload: scored hotels with owner mailing addresses.
export async function GET(req: NextRequest) {
  const user = await requireApproved();
  if (!user) return new Response("Forbidden", { status: 403 });

  const f: HotelFilters = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rows = await listHotels({ ...f, limit: 2000 });

  const header = [
    "name", "address", "city", "zip", "rooms", "brand_class", "brand_family",
    "lead_score", "revpar_index", "trailing_revenue_4q", "yoy_pct",
    "stopped_filing", "owner_name",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name, r.address, r.city, r.zip, r.rooms, r.brandClass, r.brandFamily,
        r.leadScore, r.revparIndex, r.trailingRevenue, r.yoy,
        r.stoppedFiling ? "yes" : "", r.ownerName,
      ]
        .map(csvCell)
        .join(",")
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hotel-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
