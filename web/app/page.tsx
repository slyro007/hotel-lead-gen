import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/market");

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col items-start justify-center gap-4 px-6 py-24 animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">
        Hotel acquisition leads, from the tax data up.
      </h1>
      <p className="text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Every Texas hotel reports quarterly room receipts to the Comptroller. We benchmark each
        Dallas County property&apos;s implied RevPAR against its comp set, score it 0–100 on
        underperformance, decline, and distress — and surface the owners worth a conversation.
      </p>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Internal tool — access by approval only.
      </p>
    </div>
  );
}
