import type { Metadata } from "next";
import Link from "next/link";
import { Boldonse, Bricolage_Grotesque, Geist } from "next/font/google";
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

// Headings and venue names: an expressive grotesque that sits well beside the poster-like logo.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  // A variable font: one file covers every weight (listing weights trips Turbopack).
});

export const metadata: Metadata = {
  title: `Night Out · ${CITY.short}`,
  description: `Plan a night out in ${CITY.name}: drinks, dinner, shows and what's on tonight.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${bricolage.variable} ${boldonse.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <HomeLink label={`Night Out ${CITY.short}, home`}>
            <Logo />
          </HomeLink>
          <nav className="flex shrink-0 items-center gap-1 text-sm text-muted sm:gap-2">
            <Link
              href="/plans"
              className="whitespace-nowrap rounded-xl border border-line px-3 py-2 font-medium text-fg transition hover:border-accent hover:bg-accent-soft sm:px-4"
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
