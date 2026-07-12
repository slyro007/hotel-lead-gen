"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSidebar } from "./sidebar-context";

const NAV = [
  {
    href: "/market",
    label: "Market",
    match: (p: string) => p === "/market" || p.startsWith("/market/"),
    icon: (
      <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />
    ),
  },
  {
    href: "/hotels",
    label: "Hotels",
    match: (p: string) => p === "/hotels" || p.startsWith("/hotels/"),
    icon: (
      <>
        <path d="M3 21h18M5 21V7l7-4 7 4v14" />
        <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" />
      </>
    ),
  },
  {
    href: "/admin/ingestion",
    label: "Ingestion",
    match: (p: string) => p.startsWith("/admin"),
    icon: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M4 21h16" />
      </>
    ),
  },
];

const itemBase =
  "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-all duration-200";
const activeCls = "bg-zinc-100 font-medium text-black dark:bg-zinc-800 dark:text-zinc-50";
const inactiveCls =
  "text-zinc-600 hover:translate-x-0.5 hover:bg-zinc-50 hover:text-black dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100";

function NavIcon({ children }: { children: React.ReactNode }) {
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
      className="shrink-0 text-zinc-400 group-hover:text-current"
    >
      {children}
    </svg>
  );
}

function SidebarBody() {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-1 px-3 py-4">
      <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Dallas County
      </p>
      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${itemBase} ${active ? activeCls : inactiveCls}`}
          >
            <NavIcon>{item.icon}</NavIcon>
            <span>{item.label}</span>
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </Link>
        );
      })}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/market" className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50">
      LHH <span className="font-normal text-zinc-500">Hotels</span>
    </Link>
  );
}

export function AppSidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();

  // Navigating closes the mobile drawer.
  useEffect(() => {
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Desktop rail — width animates to 0 when collapsed; inner column keeps
          its width so text doesn't reflow mid-transition. */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r border-border bg-surface-raised transition-[width] duration-300 ease-out md:block ${
          collapsed ? "w-0 border-r-0" : "w-60"
        }`}
        aria-hidden={collapsed}
      >
        <div className="flex h-full w-60 flex-col">
          <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
            <Brand />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarBody />
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${mobileOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 w-64 max-w-[85vw] overflow-y-auto border-r border-border bg-surface-raised shadow-xl transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <Brand />
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-black dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <SidebarBody />
        </div>
      </div>
    </>
  );
}
