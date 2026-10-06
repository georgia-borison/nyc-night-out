import { CITY } from "@/lib/city";

/** Crescent moon with a star tucked into its curve. Also used as the favicon (app/icon.svg). */
export function MoonMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M20.5 4.2A12.5 12.5 0 1 0 27.8 21.6 10 10 0 0 1 20.5 4.2Z" fill="var(--accent)" />
      <path d="M24.5 6.5 25.4 9.1 28 10 25.4 10.9 24.5 13.5 23.6 10.9 21 10 23.6 9.1Z" fill="var(--fg)" />
    </svg>
  );
}

/**
 * "Night Out" is the brand; the city sits beside it in its own color so the
 * same logo works for other cities later.
 */
export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className={`inline-flex items-center ${lg ? "gap-3" : "gap-2"}`}>
      <MoonMark
        className={`${lg ? "size-11" : "size-7"} shrink-0 drop-shadow-[0_0_10px_rgba(255,138,91,0.55)]`}
      />
      <span className={`font-display italic leading-none tracking-tight ${lg ? "text-5xl" : "text-2xl"}`}>
        {/* A real space, so screen readers and copy-paste get "Night Out NYC". */}
        <span className="text-fg">Night Out</span> <span className="text-drinks">{CITY.short}</span>
      </span>
    </span>
  );
}
