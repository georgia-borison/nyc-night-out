"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The logo's link home. The planner lives on the home page, so when you're
 * already there, clicking it starts a fresh plan instead of doing nothing.
 */
export function HomeLink({ label, children }: { label: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      href="/"
      aria-label={label}
      className="transition-opacity hover:opacity-90"
      onClick={(e) => {
        if (pathname !== "/") return;
        e.preventDefault();
        window.location.reload(); // already home: start a fresh plan
      }}
    >
      {children}
    </Link>
  );
}
