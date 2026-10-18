import type { Metadata } from "next";
import Link from "next/link";
import { Boldonse, Geist, Syne } from "next/font/google";
import { AccountButton } from "@/components/AccountButton";
import { HomeLink } from "@/components/HomeLink";
import { Logo } from "@/components/Logo";
import { CITY } from "@/lib/city";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The logo's face: bold, wide, poster-like capitals.
const boldonse = Boldonse({
  variable: "--font-boldonse",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  // Next has no size-matched fallback for this face; skip it rather than warn.
  adjustFontFallback: false,
});

// Headings and venue names: wide, artsy and a little offbeat, next to the poster-like logo.
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  // A variable font: one file covers every weight (listing weights trips Turbopack).
});

export const metadata: Metadata = {
  title: `Night Out · ${CITY.short}`,
  description: `Plan a night out in ${CITY.name}: drinks, dinner, shows and what's on tonight.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${syne.variable} ${boldonse.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <HomeLink label={`Night Out ${CITY.short}, home`}>
            <Logo />
          </HomeLink>
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link
              href="/plans"
              className="rounded-xl border border-line px-4 py-2 font-medium text-fg transition hover:border-accent hover:bg-accent-soft"
            >
              My plans
            </Link>
            <AccountButton />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
