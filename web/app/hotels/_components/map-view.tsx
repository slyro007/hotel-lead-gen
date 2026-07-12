"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  score: number | null;
}

// Score-band colors — same semantics as ScoreChip (DESIGN.md tokens don't apply
// to leaflet's canvas, so the hex values live here).
function markerColor(score: number | null): string {
  if (score != null && score >= 70) return "#dc2626"; // hot
  if (score != null && score >= 50) return "#f59e0b"; // warm
  return "#a1a1aa"; // watch
}

/** Reframe the map whenever the visible point set changes (e.g. filters). */
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.map((p) => p.id).join(",");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function HotelMap({
  points,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: {
  points: MapPoint[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const center: [number, number] = points.length
    ? [
        points.reduce((s, p) => s + p.lat, 0) / points.length,
        points.reduce((s, p) => s + p.lng, 0) / points.length,
      ]
    : [32.78, -96.8]; // downtown Dallas fallback

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={10}
        preferCanvas
        className="h-full w-full"
        aria-label="Map of Dallas County hotels colored by lead score"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((p) => {
          const emphasized = p.id === hoveredId || p.id === selectedId;
          const selected = p.id === selectedId;
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={emphasized ? 9 : 5.5}
              pane={emphasized ? "markerPane" : undefined}
              pathOptions={{
                color: selected ? "#0a0a0a" : "#ffffff",
                weight: selected ? 2 : 1,
                fillColor: markerColor(p.score),
                fillOpacity: emphasized ? 1 : 0.85,
              }}
              eventHandlers={{
                mouseover: () => onHover(p.id),
                mouseout: () => onHover(null),
                click: () => onSelect(p.id),
              }}
            />
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-md border border-border bg-background/90 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur">
        <div className="mb-1 font-medium text-ink-muted">Lead score</div>
        {[
          ["#dc2626", "Hot (70+)"],
          ["#f59e0b", "Warm (50–69)"],
          ["#a1a1aa", "Watch (<50)"],
        ].map(([c, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            <span className="text-ink-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
