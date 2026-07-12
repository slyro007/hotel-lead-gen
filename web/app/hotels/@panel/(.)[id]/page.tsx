import { notFound } from "next/navigation";
import { requireApproved } from "../../../../lib/auth";
import { HotelDetail } from "../../_components/hotel-detail";
import { loadHotelDetail } from "../../_components/hotel-detail-data";
import { PanelShell } from "./panel-shell";

export const dynamic = "force-dynamic";

/**
 * Intercepted detail — renders the slide-over over the explorer on soft
 * navigation. A hard load / refresh of /hotels/[id] bypasses this and renders
 * the full page instead (@panel/default.tsx returns null for that case).
 */
export default async function InterceptedHotelDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireApproved();
  if (!user) return null;

  const { id } = await params;
  const data = await loadHotelDetail(id);
  if (!data) notFound();

  return (
    <PanelShell title={data.hotel.locationName ?? "Hotel detail"}>
      <HotelDetail data={data} variant="panel" />
    </PanelShell>
  );
}
