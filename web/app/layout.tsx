import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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

const NAV = [
  { href: "/market", label: "Market" },
  { href: "/hotels", label: "Hotels" },
  { href: "/admin/ingestion", label: "Ingestion" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          {/* Signed-out: plain marketing chrome. */}
          <Show when="signed-out">
            <header className="flex h-16 items-center justify-between gap-4 border-b border-zinc-200 px-4 sm:px-6 dark:border-zinc-800">
              <Link
                href="/"
                className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
              >
                Longhorn Houses <span className="font-normal text-zinc-500">Hotels</span>
              </Link>
              <SignInButton />
            </header>
            {children}
          </Show>

          {/* Signed-in: slim header nav (full sidebar shell arrives with the dashboard). */}
          <Show when="signed-in">
            <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-zinc-200 bg-background px-4 sm:px-6 dark:border-zinc-800">
              <div className="flex items-center gap-6">
                <Link
                  href="/market"
                  className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50"
                >
                  LHH <span className="font-normal text-zinc-500">Hotels</span>
                </Link>
                <nav className="flex items-center gap-4">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="text-[13px] text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-400"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <UserButton />
            </header>
            <main className="flex-1">{children}</main>
          </Show>
        </ClerkProvider>
      </body>
    </html>
  );
}
