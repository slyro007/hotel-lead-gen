"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Right-hand slide-over that overlays the explorer for the intercepted detail
 * route. Closes via backdrop, the × button, or ESC — all through
 * `router.back()` so the URL returns to /hotels and the panel slot unmounts.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Hotel detail">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40"
        onClick={() => router.back()}
      />
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-xl animate-slide-in-right flex-col border-l border-border bg-background shadow-[var(--shadow-overlay)]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
          <span className="text-[13px] text-ink-muted">Hotel detail</span>
          <button
            aria-label="Close"
            onClick={() => router.back()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-black dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
