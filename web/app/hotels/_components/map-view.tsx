"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { MapPoint } from "./map-toggle";

// Score band colors — same semantics as ScoreChip (DESIGN.md).
function markerColor(score: number | null): string {
  if (score != null && score >= 70) return "#dc2626"; // red-600
  if (score != null && score >= 50) return "#f59e0b"; // amber-500
  return "#71717a"; // zinc-500
}

export default function HotelMap({ points }: { points: MapPoint[] }) {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;

  return (
    <MapContainer center={[lat, lng]} zoom={10} className="h-96 w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={6}
          pathOptions={{
            color: "#ffffff",
            weight: 1,
            fillColor: markerColor(p.score),
            fillOpacity: 0.9,
          }}
        >
          <Popup>
            <a href={`/hotels/${p.id}`} className="text-[13px] font-medium">
              {p.name}
            </a>
            <div className="text-[12px]">Score: {p.score ?? "—"}</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
