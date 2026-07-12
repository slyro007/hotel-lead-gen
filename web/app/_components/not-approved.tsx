export function NotApproved() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">Awaiting approval</h1>
      <p className="mt-3 text-[15px] text-zinc-500 dark:text-zinc-400">
        Your account exists but hasn&apos;t been approved for data access yet. This is an
        internal tool — access is granted manually.
      </p>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 p-10 text-center dark:bg-zinc-900">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-2 text-[13px] text-zinc-500 dark:text-zinc-400">{hint}</p>
    </div>
  );
}
