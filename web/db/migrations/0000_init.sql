CREATE TABLE "hotel_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid,
	"taxpayer_number" text NOT NULL,
	"taxpayer_name" text,
	"location_name" text,
	"location_address" text,
	"location_city" text,
	"location_state" text,
	"location_zip" text,
	"location_county" text,
	"location_key" text NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer NOT NULL,
	"rooms" integer,
	"room_receipts" numeric(14, 2),
	"taxable_receipts" numeric(14, 2),
	"source_file" text,
	"ingestion_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_filing_identity" UNIQUE("taxpayer_number","location_key","year","quarter")
);
--> statement-breakpoint
CREATE TABLE "hotel_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"as_of_year" integer NOT NULL,
	"as_of_quarter" integer NOT NULL,
	"trailing_revenue_4q" numeric(16, 2),
	"latest_revpar" numeric(10, 2),
	"trailing_revpar_4q" numeric(10, 2),
	"revpar_index" numeric(6, 1),
	"comp_set_key" text,
	"comp_set_count" integer,
	"yoy_revenue_change_pct" numeric(6, 1),
	"slope_8q" numeric(8, 3),
	"recovery_ratio" numeric(6, 2),
	"stopped_filing" boolean,
	"quarters_since_last_filing" integer,
	"score_underperformance" integer,
	"score_trend" integer,
	"score_distress" integer,
	"score_profile" integer,
	"lead_score" integer,
	"score_breakdown" jsonb,
	"computed_at" timestamp with time zone,
	CONSTRAINT "uq_score_period" UNIQUE("hotel_id","as_of_year","as_of_quarter")
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_key" text NOT NULL,
	"location_name" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"county" text,
	"current_taxpayer_number" text,
	"current_taxpayer_name" text,
	"prior_taxpayer_numbers" text[] DEFAULT '{}'::text[] NOT NULL,
	"rooms" integer,
	"latitude" double precision,
	"longitude" double precision,
	"geocode_source" text,
	"brand_family" text,
	"brand_name" text,
	"brand_class" text,
	"classification_confidence" numeric(4, 2),
	"classified_at" timestamp with time zone,
	"first_period" text,
	"last_period" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotels_location_key_unique" UNIQUE("location_key")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"source_file" text,
	"params" jsonb,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"rows_inserted" integer DEFAULT 0 NOT NULL,
	"rows_updated" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer NOT NULL,
	"geography" text NOT NULL,
	"room_band" text NOT NULL,
	"brand_class" text NOT NULL,
	"property_count" integer,
	"total_rooms" integer,
	"total_receipts" numeric(16, 2),
	"revpar_p25" numeric(10, 2),
	"revpar_median" numeric(10, 2),
	"revpar_p75" numeric(10, 2),
	"revpar_mean" numeric(10, 2),
	"computed_at" timestamp with time zone,
	CONSTRAINT "uq_benchmark_segment" UNIQUE("year","quarter","geography","room_band","brand_class")
);
--> statement-breakpoint
CREATE TABLE "market_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geography" text NOT NULL,
	"year" integer NOT NULL,
	"quarter" integer NOT NULL,
	"reported_receipts" numeric(16, 2),
	"tax_collected" numeric(14, 2),
	"source_dataset" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_market_stat" UNIQUE("geography","year","quarter","source_dataset")
);
--> statement-breakpoint
CREATE TABLE "owner_enrichment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"dcad_account_number" text,
	"sptb_code" text,
	"division_cd" text,
	"owner_name" text,
	"owner_address" text,
	"owner_city" text,
	"owner_state" text,
	"owner_zip" text,
	"market_value" numeric(14, 2),
	"appraised_value" numeric(14, 2),
	"improvement_value" numeric(14, 2),
	"land_value" numeric(14, 2),
	"year_built" integer,
	"building_sqft" integer,
	"tax_year" integer,
	"match_method" text,
	"match_confidence" numeric(4, 2),
	"registered_agent" jsonb,
	"officers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_enrichment_hotel_id_unique" UNIQUE("hotel_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "hotel_filings" ADD CONSTRAINT "hotel_filings_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_scores" ADD CONSTRAINT "hotel_scores_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_enrichment" ADD CONSTRAINT "owner_enrichment_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_filings_period" ON "hotel_filings" USING btree ("year","quarter");--> statement-breakpoint
CREATE INDEX "idx_filings_hotel" ON "hotel_filings" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "idx_scores_lead_score" ON "hotel_scores" USING btree ("lead_score");--> statement-breakpoint
CREATE INDEX "idx_hotels_city" ON "hotels" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_hotels_brand_class" ON "hotels" USING btree ("brand_class");--> statement-breakpoint
CREATE INDEX "idx_hotels_is_active" ON "hotels" USING btree ("is_active");