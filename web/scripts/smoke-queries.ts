// Exercises the dashboard's query layer against the live DB — the same
// functions the RSC pages call, minus the Clerk chrome. Run:
//   npx tsx --env-file=.env.local scripts/smoke-queries.ts
import { listCities, listHotels, getHotel, getHotelFilings } from "../db/queries/hotels";
import { getMarketKpis, getMarketTrend, getTopDecliners, getReportedHotRevenue } from "../db/queries/market";
import { getDataFreshness, listRuns } from "../db/queries/ingestion";

async function main() {
  const kpis = await getMarketKpis();
  console.log("KPIs:", kpis);
  console.log("trend quarters:", (await getMarketTrend()).length);
  console.log("decliners:", (await getTopDecliners(3)).map((d) => `${d.name} ${d.yoy}%`));
  console.log("HOT revenue rows:", (await getReportedHotRevenue()).length);
  console.log("freshness:", await getDataFreshness());
  console.log("runs:", (await listRuns(5)).map((r) => `${r.stage}:${r.status}`));
  console.log("cities:", (await listCities()).length);

  const top = await listHotels({ sort: "score", dir: "desc", limit: 5 });
  console.log("top hotels:", top.map((h) => `${h.name} score=${h.leadScore} idx=${h.revparIndex}`));

  const filtered = await listHotels({ band: "hot", brand: "independent", limit: 100 });
  console.log("hot+independent:", filtered.length);

  const detail = await getHotel(top[0].id);
  console.log("detail owner:", detail?.owner?.ownerName, "| compSet:", detail?.score?.compSetKey);
  console.log("detail filings:", (await getHotelFilings(top[0].id)).length);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
