import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Fraunces } from "next/font/google";
import { Logo } from "@/components/Logo";
import { CITY } from "@/lib/city";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html lang="en" className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/" aria-label={`Night Out ${CITY.short}, home`} className="transition-opacity hover:opacity-90">
            <Logo />
          </Link>
          <nav className="text-sm text-muted">
            <Link href="/plans" className="hover:text-fg">
              My plans
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
