"use client";

import { useEffect, useRef } from "react";
import type { HotelListRow } from "../../../db/queries/hotels";
import { EmptyState } from "../../_components/not-approved";
import { LeadCard } from "./lead-card";

export function LeadList({
  rows,
  sparklines,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: {
  rows: HotelListRow[];
  sparklines: Record<string, (number | null)[]>;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const selectedRef = useRef<HTMLAnchorElement | null>(null);
  const lastScrolled = useRef<string | null>(null);

  // When selection comes from a map click, bring the card into view.
  useEffect(() => {
    if (selectedId && selectedId !== lastScrolled.current && selectedRef.current) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
      lastScrolled.current = selectedId;
    }
  }, [selectedId]);

  if (rows.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          title="No hotels match"
          hint="Adjust the filters, or clear them to see the full Dallas County list."
        />
      </div>
    );
  }

  return (
    <div role="list" className="flex flex-col gap-2 p-3">
      {rows.map((row) => (
        <LeadCard
          key={row.id}
          ref={row.id === selectedId ? selectedRef : undefined}
          row={row}
          spark={sparklines[row.id] ?? []}
          hovered={row.id === hoveredId}
          selected={row.id === selectedId}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
