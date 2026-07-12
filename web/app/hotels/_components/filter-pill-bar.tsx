"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const SELECTS: { name: string; label: string; options: [string, string][] }[] = [
  {
    name: "band",
    label: "Score",
    options: [
      ["", "All scores"],
      ["hot", "Hot (70+)"],
      ["warm", "Warm (50–69)"],
      ["watch", "Watch (<50)"],
    ],
  },
  {
    name: "brand",
    label: "Brand",
    options: [
      ["", "All brands"],
      ["independent", "Independent"],
      ["branded", "Branded"],
      ["unknown", "Unknown"],
    ],
  },
  {
    name: "rooms",
    label: "Rooms",
    options: [
      ["", "All sizes"],
      ["1-49", "1–49"],
      ["50-99", "50–99"],
      ["100-199", "100–199"],
      ["200+", "200+"],
    ],
  },
];

const SORTS: [string, string][] = [
  ["score", "Lead score"],
  ["index", "RevPAR index"],
  ["yoy", "YoY change"],
  ["revenue", "Trailing revenue"],
  ["rooms", "Rooms"],
  ["name", "Name"],
  ["city", "City"],
];

// Human labels for active-filter chips.
function chipLabel(name: string, value: string): string {
  for (const s of SELECTS) {
    if (s.name === name) {
      const opt = s.options.find(([v]) => v === value);
      if (opt) return `${s.label}: ${opt[1]}`;
    }
  }
  if (name === "city") return value;
  if (name === "stopped") return "Stopped filing";
  if (name === "q") return `“${value}”`;
  return value;
}

const control =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus-visible:border-foreground/40";

export function FilterPillBar({
  cities,
  count,
  view,
}: {
  cities: string[];
  count: number;
  view: "map" | "table";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(name, value);
      else next.delete(name);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  // Debounced live search (still writes the same `q` param).
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);
  const onSearch = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setParam("q", value.trim()), 350);
  };

  const sort = params.get("sort") ?? "score";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  // Active filter chips (search + selects + stopped), for the "clear" row.
  const activeChips: { name: string; value: string }[] = [];
  for (const s of SELECTS) {
    const v = params.get(s.name);
    if (v) activeChips.push({ name: s.name, value: v });
  }
  if (params.get("city")) activeChips.push({ name: "city", value: params.get("city")! });
  if (params.get("stopped") === "1") activeChips.push({ name: "stopped", value: "1" });
  if (params.get("q")) activeChips.push({ name: "q", value: params.get("q")! });

  const clearAll = () => {
    const next = new URLSearchParams();
    if (view === "table") next.set("view", "table");
    if (sort !== "score") next.set("sort", sort);
    if (dir !== "desc") next.set("dir", dir);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const setView = (v: "map" | "table") => setParam("view", v === "map" ? "" : "table");

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex items-center gap-2 ${control} !py-1`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-zinc-400"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            type="search"
            placeholder="Search name or address…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search hotels"
            className="w-44 bg-transparent outline-none placeholder:text-zinc-400"
          />
        </div>
        {SELECTS.map((s) => (
          <select
            key={s.name}
            aria-label={s.label}
            value={params.get(s.name) ?? ""}
            onChange={(e) => setParam(s.name, e.target.value)}
            className={control}
          >
            {s.options.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        ))}
        <select
          aria-label="City"
          value={params.get("city") ?? ""}
          onChange={(e) => setParam("city", e.target.value)}
          className={control}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
          <input
            type="checkbox"
            checked={params.get("stopped") === "1"}
            onChange={(e) => setParam("stopped", e.target.checked ? "1" : "")}
          />
          Stopped filing
        </label>

        <span className="flex-1" />

        {/* Sort */}
        <div className="flex items-center gap-1">
          <select
            aria-label="Sort by"
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className={control}
          >
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button
            aria-label={dir === "desc" ? "Descending" : "Ascending"}
            title={dir === "desc" ? "High → low" : "Low → high"}
            onClick={() => setParam("dir", dir === "desc" ? "asc" : "desc")}
            className={`${control} px-2`}
          >
            {dir === "desc" ? "↓" : "↑"}
          </button>
        </div>

        {/* View toggle */}
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["map", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1.5 text-[13px] capitalize transition-colors ${
                view === v ? "bg-foreground text-background" : "text-ink-muted hover:bg-surface"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <a
          href={`/api/export/hotels?${params.toString()}`}
          className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background"
        >
          Export CSV
        </a>
      </div>

      {/* Result count + active-filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-ink-muted">
          <span className="font-medium text-foreground tabular-nums">{count}</span> hotels
        </span>
        {activeChips.length > 0 && (
          <>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            {activeChips.map((c) => (
              <button
                key={c.name}
                onClick={() => setParam(c.name, "")}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-ink-muted hover:text-foreground"
              >
                {chipLabel(c.name, c.value)}
                <span aria-hidden>✕</span>
              </button>
            ))}
            <button onClick={clearAll} className="px-1 text-ink-muted underline hover:text-foreground">
              Clear all
            </button>
          </>
        )}
      </div>
    </div>
  );
}
