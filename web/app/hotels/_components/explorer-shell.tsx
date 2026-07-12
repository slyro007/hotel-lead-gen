"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { HotelListRow } from "../../../db/queries/hotels";
import { FilterPillBar } from "./filter-pill-bar";
import { HotelsTable } from "./hotels-table";
import { LeadList } from "./lead-list";
import type { MapPoint } from "./map-view";

// Leaflet touches window — client-only, lazily loaded.
const HotelMap = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface text-[13px] text-ink-muted">
      Loading map…
    </div>
  ),
});

export function ExplorerShell({
  rows,
  sparklines,
  cities,
  initialView,
}: {
  rows: HotelListRow[];
  sparklines: Record<string, (number | null)[]>;
  cities: string[];
  initialView: "map" | "table";
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");

  const points: MapPoint[] = useMemo(
    () =>
      rows
        .filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({
          id: r.id,
          name: r.name ?? "",
          lat: r.latitude!,
          lng: r.longitude!,
          score: r.leadScore,
        })),
    [rows]
  );

  const list = (
    <LeadList
      rows={rows}
      sparklines={sparklines}
      hoveredId={hoveredId}
      selectedId={selectedId}
      onHover={setHoveredId}
      onSelect={setSelectedId}
    />
  );

  const map = (
    <HotelMap
      points={points}
      hoveredId={hoveredId}
      selectedId={selectedId}
      onHover={setHoveredId}
      onSelect={setSelectedId}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <FilterPillBar cities={cities} count={rows.length} view={initialView} />

      {/* aria-live region announcing the selected hotel for screen readers */}
      <div className="sr-only" aria-live="polite">
        {selectedId ? rows.find((r) => r.id === selectedId)?.name ?? "" : ""}
      </div>

      {initialView === "table" ? (
        <div className="min-h-0 flex-1">
          <HotelsTable
            rows={rows}
            sparklines={sparklines}
            hoveredId={hoveredId}
            selectedId={selectedId}
            onHover={setHoveredId}
            onSelect={setSelectedId}
          />
        </div>
      ) : (
        <>
          {/* Desktop: split list + map */}
          <div className="hidden min-h-0 flex-1 md:flex">
            <div className="w-[420px] shrink-0 overflow-y-auto border-r border-border lg:w-[460px]">
              {list}
            </div>
            <div className="min-w-0 flex-1">{map}</div>
          </div>

          {/* Mobile: List / Map tabs */}
          <div className="flex min-h-0 flex-1 flex-col md:hidden">
            <div className="flex border-b border-border">
              {(["list", "map"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setMobileTab(t)}
                  className={`flex-1 py-2 text-[13px] capitalize ${
                    mobileTab === t
                      ? "border-b-2 border-foreground font-medium"
                      : "text-ink-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mobileTab === "list" ? list : <div className="h-full">{map}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
