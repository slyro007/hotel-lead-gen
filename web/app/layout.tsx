import { ClerkProvider, Show, SignInButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDataFreshness } from "../db/queries/ingestion";
import { fmtQuarter } from "../lib/format";
import { AppSidebar } from "./_components/app-sidebar";
import { AppMain } from "./_components/app-shell";
import { SidebarProvider } from "./_components/sidebar-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Longhorn Houses Hotels",
  description: "Hotel acquisition leads from Texas occupancy tax data",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, freshness] = await Promise.all([cookies(), getDataFreshness()]);
  const initialCollapsed = cookieStore.get("hh-sidebar")?.value === "collapsed";
  const freshnessLabel = freshness ? fmtQuarter(freshness.year, freshness.quarter) : null;

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ClerkProvider>
          {/* Signed-out: plain marketing chrome. */}
          <Show when="signed-out">
            <div className="flex min-h-dvh flex-col">
              <header className="flex h-16 items-center justify-between gap-4 border-b border-border px-4 sm:px-6">
                <Link
                  href="/"
                  className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
                >
                  Longhorn Houses <span className="font-normal text-zinc-500">Hotels</span>
                </Link>
                <SignInButton />
              </header>
              {children}
            </div>
          </Show>

          {/* Signed-in: sidebar rail + slim header shell. */}
          <Show when="signed-in">
            <SidebarProvider initialCollapsed={initialCollapsed}>
              <div className="flex min-h-dvh">
                <AppSidebar />
                <AppMain freshness={freshnessLabel}>{children}</AppMain>
              </div>
            </SidebarProvider>
          </Show>
        </ClerkProvider>
      </body>
    </html>
  );
}
