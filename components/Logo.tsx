import { CITY } from "@/lib/city";

// A thin, flat crescent (the gap between two slightly offset circles) with a
// small star inside its curve. Same shapes as the favicon (app/icon.svg).
export const CRESCENT = "M24.68 22.22A11 11 0 1 1 10.95 6.77A10.4 10.4 0 1 0 24.68 22.22Z";
export const STAR = "M22 5.6 22.8 8.2 25.4 9 22.8 9.8 22 12.4 21.2 9.8 18.6 9 21.2 8.2Z";

export function MoonMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d={CRESCENT} fill="var(--accent)" />
      <path d={STAR} fill="var(--fg)" />
    </svg>
  );
}

/**
 * "Night Out" is the brand, set in bold poster capitals; the city sits beside
 * it in its own color so the same logo works for other cities later.
 */
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className={`inline-flex items-center ${lg ? "gap-3" : "gap-2"}`}>
      <MoonMark className={`${lg ? "size-10" : "size-7"} shrink-0`} />
      <span className={`font-logo uppercase leading-none tracking-[0.04em] ${lg ? "text-3xl" : "text-[15px] sm:text-base"}`}>
        {/* A real space, so screen readers and copy-paste get "Night Out NYC". */}
        <span className="text-fg">Night Out</span> <span className="text-drinks">{CITY.short}</span>
      </span>
    </span>
  );
}
