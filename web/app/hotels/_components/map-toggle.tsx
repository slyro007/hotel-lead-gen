"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  score: number | null;
}

// Leaflet touches `window` at import time — client-only, no SSR.
const HotelMap = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg bg-zinc-50 text-[13px] text-zinc-500 dark:bg-zinc-900">
      Loading map…
    </div>
  ),
});

export function MapToggle({ points }: { points: MapPoint[] }) {
  const [open, setOpen] = useState(false);
  if (points.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-[13px] dark:border-zinc-800"
      >
        {open ? "Hide map" : `Map view (${points.length})`}
      </button>
      {open && (
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <HotelMap points={points} />
        </div>
      )}
    </div>
  );
}
