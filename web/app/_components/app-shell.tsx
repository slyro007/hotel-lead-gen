"use client";

import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSidebar } from "./sidebar-context";

function PanelIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {open && <path d="M6 9.5h1M6 12h1" strokeWidth="2.2" />}
    </svg>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/hotels?q=${encodeURIComponent(q)}` : "/hotels");
      }}
      className="hidden sm:block"
      role="search"
    >
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="text-zinc-400"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search hotels…"
          aria-label="Search hotels"
          className="w-40 bg-transparent text-[13px] outline-none placeholder:text-zinc-400 lg:w-56"
        />
      </div>
    </form>
  );
}

/**
 * Main column of the signed-in app shell: a slim sticky header (rail toggle +
 * search + freshness + user menu) above the page content. The sidebar itself is
 * rendered as a sibling by the root layout so it can span the full viewport.
 */
export function AppMain({
  children,
  freshness,
}: {
  children: React.ReactNode;
  freshness: string | null;
}) {
  const { collapsed, setCollapsed, setMobileOpen } = useSidebar();

  return (
    <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <button
            aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"}
            title={collapsed ? "Open sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-black dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 md:block"
          >
            <PanelIcon open={!collapsed} />
          </button>
          <button
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-black dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 md:hidden"
          >
            <PanelIcon open />
          </button>
          <a
            href="/market"
            className={`text-sm font-semibold tracking-tight text-black transition-opacity dark:text-zinc-50 ${
              collapsed ? "md:opacity-100" : "md:pointer-events-none md:opacity-0"
            }`}
          >
            LHH <span className="font-normal text-zinc-500">Hotels</span>
          </a>
        </div>
        <div className="flex items-center gap-3">
          <HeaderSearch />
          {freshness && (
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Data through {freshness}
            </span>
          )}
          <UserButton />
        </div>
      </header>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
