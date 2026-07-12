"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

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

export function FiltersBar({ cities }: { cities: string[] }) {
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

  const selectClass =
    "rounded-md border border-zinc-200 bg-background px-2 py-1.5 text-[13px] dark:border-zinc-800";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        placeholder="Search name or address…"
        defaultValue={params.get("q") ?? ""}
        className={`${selectClass} w-56`}
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim());
        }}
      />
      {SELECTS.map((s) => (
        <select
          key={s.name}
          aria-label={s.label}
          value={params.get(s.name) ?? ""}
          onChange={(e) => setParam(s.name, e.target.value)}
          className={selectClass}
        >
          {s.options.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      ))}
      <select
        aria-label="City"
        value={params.get("city") ?? ""}
        onChange={(e) => setParam("city", e.target.value)}
        className={selectClass}
      >
        <option value="">All cities</option>
        {cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={params.get("stopped") === "1"}
          onChange={(e) => setParam("stopped", e.target.checked ? "1" : "")}
        />
        Stopped filing
      </label>
      <span className="flex-1" />
      <a
        href={`/api/export/hotels?${params.toString()}`}
        className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background"
      >
        Export CSV
      </a>
    </div>
  );
}
