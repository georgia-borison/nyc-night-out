import type { Metadata } from "next";
import Link from "next/link";
import { Boldonse, Geist, Fraunces } from "next/font/google";
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
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: `Night Out · ${CITY.short}`,
  description: `Plan a night out in ${CITY.name}: drinks, dinner, shows and what's on tonight.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${fraunces.variable} ${boldonse.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <HomeLink label={`Night Out ${CITY.short}, home`}>
            <Logo />
          </HomeLink>
          <nav className="text-sm text-muted">
            <Link
              href="/plans"
              className="rounded-xl border border-line px-4 py-2 font-medium text-fg transition hover:border-accent hover:bg-accent-soft"
            >
              My plans
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
