import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApproved } from "../../../lib/auth";
import { NotApproved } from "../../_components/not-approved";
import { HotelDetail } from "../_components/hotel-detail";
import { loadHotelDetail } from "../_components/hotel-detail-data";

export const dynamic = "force-dynamic";

export default async function HotelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireApproved();
  if (!user) return <NotApproved />;

  const { id } = await params;
  const data = await loadHotelDetail(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 animate-fade-up">
      <Link href="/hotels" className="text-[13px] text-ink-muted hover:text-foreground">
        ← Hotels
      </Link>
      <div className="mt-2">
        <HotelDetail data={data} variant="page" />
      </div>
    </div>
  );
}
