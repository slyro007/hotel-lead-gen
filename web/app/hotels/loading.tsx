// Streamed while the explorer's server query runs.
export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <div className="h-8 w-full max-w-3xl animate-skeleton rounded-md bg-surface" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[420px] shrink-0 space-y-2 overflow-hidden border-r border-border p-3 lg:w-[460px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[120px] animate-skeleton rounded-lg bg-surface" />
          ))}
        </div>
        <div className="flex-1 animate-skeleton bg-surface" />
      </div>
    </div>
  );
}
