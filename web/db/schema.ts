import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Canonical physical hotel — one row per property, keyed on locationKey
// (zip5|normalized street) so it survives renames and ownership changes.
// Built by pipeline/build_hotels.py from hotel_filings; brand fields filled by
// pipeline/classify_brands.py (a null classifiedAt means it still needs a pass).
export const hotels = pgTable(
  "hotels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationKey: text("location_key").notNull().unique(),
    locationName: text("location_name"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    county: text("county"),
    // Latest filer. Prior taxpayer numbers are kept — an ownership change is
    // itself a signal (recent buyer, possible distress flip).
    currentTaxpayerNumber: text("current_taxpayer_number"),
    currentTaxpayerName: text("current_taxpayer_name"),
    priorTaxpayerNumbers: text("prior_taxpayer_numbers")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Most recent nonzero room count from filings (self-reported).
    rooms: integer("rooms"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    geocodeSource: text("geocode_source"),
    // Claude brand classification. brandClass drives the "independent" score
    // input; family/flag are display metadata.
    brandFamily: text("brand_family"),
    brandName: text("brand_name"),
    brandClass: text("brand_class"), // "branded" | "independent" | "unknown"
    classificationConfidence: numeric("classification_confidence", { precision: 4, scale: 2 }),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    // Filing activity span, "2019Q1" style. isActive = filed in the dataset's
    // latest ingested quarter (filings lag ~1 quarter behind the calendar).
    firstPeriod: text("first_period"),
    lastPeriod: text("last_period"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_hotels_city").on(t.city),
    index("idx_hotels_brand_class").on(t.brandClass),
    index("idx_hotels_is_active").on(t.isActive),
  ]
);

// One row per property per quarter, verbatim from the Comptroller SIFT file.
// The unique key is the pipeline's idempotency key; hotelId is backfilled by
// build_hotels.py after canonicalization.
export const hotelFilings = pgTable(
  "hotel_filings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id").references(() => hotels.id),
    taxpayerNumber: text("taxpayer_number").notNull(),
    taxpayerName: text("taxpayer_name"),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    locationCity: text("location_city"),
    locationState: text("location_state"),
    locationZip: text("location_zip"),
    locationCounty: text("location_county"),
    locationKey: text("location_key").notNull(),
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(),
    rooms: integer("rooms"),
    roomReceipts: numeric("room_receipts", { precision: 14, scale: 2 }),
    taxableReceipts: numeric("taxable_receipts", { precision: 14, scale: 2 }),
    sourceFile: text("source_file"),
    ingestionRunId: uuid("ingestion_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_filing_identity").on(t.taxpayerNumber, t.locationKey, t.year, t.quarter),
    index("idx_filings_period").on(t.year, t.quarter),
    index("idx_filings_hotel").on(t.hotelId),
  ]
);

// Comp-set stats per quarter x segment, recomputed wholesale by
// pipeline/score.py. Geography is "dallas_county" or "city:<Name>"; room bands
// 1-49/50-99/100-199/200+/any; brandClass branded/independent/unknown/any.
export const marketBenchmarks = pgTable(
  "market_benchmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(),
    geography: text("geography").notNull(),
    roomBand: text("room_band").notNull(),
    brandClass: text("brand_class").notNull(),
    propertyCount: integer("property_count"),
    totalRooms: integer("total_rooms"),
    totalReceipts: numeric("total_receipts", { precision: 16, scale: 2 }),
    revparP25: numeric("revpar_p25", { precision: 10, scale: 2 }),
    revparMedian: numeric("revpar_median", { precision: 10, scale: 2 }),
    revparP75: numeric("revpar_p75", { precision: 10, scale: 2 }),
    revparMean: numeric("revpar_mean", { precision: 10, scale: 2 }),
    computedAt: timestamp("computed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_benchmark_segment").on(t.year, t.quarter, t.geography, t.roomBand, t.brandClass),
  ]
);

// Per-hotel lead score for a scoring period (history preserved across
// quarters). scoreBreakdown holds every input + per-rule points so the UI can
// prove any number back to the filings. Formulas live in pipeline/score.py;
// UI thresholds in web/lib/score-labels.ts.
export const hotelScores = pgTable(
  "hotel_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    asOfYear: integer("as_of_year").notNull(),
    asOfQuarter: integer("as_of_quarter").notNull(),
    trailingRevenue4q: numeric("trailing_revenue_4q", { precision: 16, scale: 2 }),
    latestRevpar: numeric("latest_revpar", { precision: 10, scale: 2 }),
    trailingRevpar4q: numeric("trailing_revpar_4q", { precision: 10, scale: 2 }),
    // Trailing-4Q RevPAR vs comp-set median x 100 (100 = at market).
    revparIndex: numeric("revpar_index", { precision: 6, scale: 1 }),
    compSetKey: text("comp_set_key"),
    compSetCount: integer("comp_set_count"),
    yoyRevenueChangePct: numeric("yoy_revenue_change_pct", { precision: 6, scale: 1 }),
    slope8q: numeric("slope_8q", { precision: 8, scale: 3 }),
    recoveryRatio: numeric("recovery_ratio", { precision: 6, scale: 2 }),
    stoppedFiling: boolean("stopped_filing"),
    quartersSinceLastFiling: integer("quarters_since_last_filing"),
    scoreUnderperformance: integer("score_underperformance"),
    scoreTrend: integer("score_trend"),
    scoreDistress: integer("score_distress"),
    scoreProfile: integer("score_profile"),
    leadScore: integer("lead_score"),
    scoreBreakdown: jsonb("score_breakdown"),
    computedAt: timestamp("computed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_score_period").on(t.hotelId, t.asOfYear, t.asOfQuarter),
    index("idx_scores_lead_score").on(t.leadScore),
  ]
);

// DCAD (Dallas Central Appraisal District) enrichment — owner name + mailing
// address (the outreach payload) and appraised values. One row per hotel,
// filled by pipeline/dcad_match.py. registeredAgent/officers reserved for the
// later franchise-tax entity lookup.
export const ownerEnrichment = pgTable("owner_enrichment", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .unique()
    .references(() => hotels.id, { onDelete: "cascade" }),
  dcadAccountNumber: text("dcad_account_number"),
  sptbCode: text("sptb_code"),
  divisionCd: text("division_cd"),
  ownerName: text("owner_name"),
  ownerAddress: text("owner_address"),
  ownerCity: text("owner_city"),
  ownerState: text("owner_state"),
  ownerZip: text("owner_zip"),
  marketValue: numeric("market_value", { precision: 14, scale: 2 }),
  appraisedValue: numeric("appraised_value", { precision: 14, scale: 2 }),
  improvementValue: numeric("improvement_value", { precision: 14, scale: 2 }),
  landValue: numeric("land_value", { precision: 14, scale: 2 }),
  yearBuilt: integer("year_built"),
  buildingSqft: integer("building_sqft"),
  taxYear: integer("tax_year"),
  matchMethod: text("match_method"), // "address" | "address_fuzzy" | "manual"
  matchConfidence: numeric("match_confidence", { precision: 4, scale: 2 }),
  registeredAgent: jsonb("registered_agent"),
  officers: jsonb("officers"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// City/county-level HOT collections from data.texas.gov (Socrata) — market
// dashboard context, not property-level data.
export const marketStats = pgTable(
  "market_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    geography: text("geography").notNull(), // "city:Dallas" | "county:Dallas"
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(),
    reportedReceipts: numeric("reported_receipts", { precision: 16, scale: 2 }),
    taxCollected: numeric("tax_collected", { precision: 14, scale: 2 }),
    sourceDataset: text("source_dataset").notNull(), // Socrata 4x4 id
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_market_stat").on(t.geography, t.year, t.quarter, t.sourceDataset)]
);

// Clerk users mirrored via the svix webhook (api/webhooks/clerk). Access is a
// manual gate: approved must be flipped in the DB — this is an operator tool,
// not a self-serve signup.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  approved: boolean("approved").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only pipeline bookkeeping; every pipeline stage writes one row per
// run. Surfaced on /admin/ingestion with the data-freshness banner.
export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  stage: text("stage").notNull(),
  status: text("status").notNull(), // "running" | "success" | "failed"
  sourceFile: text("source_file"),
  params: jsonb("params"),
  rowsProcessed: integer("rows_processed").notNull().default(0),
  rowsInserted: integer("rows_inserted").notNull().default(0),
  rowsUpdated: integer("rows_updated").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
