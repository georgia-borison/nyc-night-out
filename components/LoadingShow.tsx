"use client";

import { useEffect, useState } from "react";
import { MoonMark } from "./Logo";

/**
 * A playful loading card: a bobbing moon with twinkling stars, witty lines
 * that cycle every few seconds, real progress ("🔎 Searching: …", "✓ Dinner
 * sorted") that briefly takes over, and an honest elapsed timer.
 */
export function LoadingShow({
  phrases,
  flash,
  startedAt,
  expected,
}: {
  phrases: string[];
  /** Latest real progress; a new `key` shows it for a moment. */
  flash: { text: string; key: number } | null;
  startedAt: number;
  expected: string;
}) {
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const cycle = setInterval(() => setIndex((i) => i + 1), 2600);
    return () => {
      clearInterval(tick);
      clearInterval(cycle);
    };
  }, []);

  // Show each new bit of real progress for a few seconds, then go back to the phrases.
  useEffect(() => {
    if (!flash) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowFlash(true);
    const t = setTimeout(() => setShowFlash(false), 2800);
    return () => clearTimeout(t);
  }, [flash]);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const line = showFlash && flash ? flash.text : phrases[index % phrases.length];
  const lineKey = showFlash && flash ? `flash-${flash.key}` : `phrase-${index}`;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-line bg-surface px-5 py-6 sm:px-7"
      role="status"
      aria-live="polite"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--drinks), transparent 70%)" }}
      />
      <div className="relative flex items-center gap-5">
        <div className="relative size-16 shrink-0" aria-hidden>
          <MoonMark className="moon-bob size-16 drop-shadow-[0_0_18px_rgba(255,122,47,0.65)]" />
          <span className="star-twinkle absolute -right-2 top-1 text-xs text-fg" style={{ animationDelay: "0s" }}>✦</span>
          <span className="star-twinkle absolute -left-1 bottom-0 text-[10px] text-drinks" style={{ animationDelay: "0.7s" }}>✦</span>
          <span className="star-twinkle absolute right-3 -bottom-2 text-[9px] text-accent" style={{ animationDelay: "1.4s" }}>✦</span>
        </div>
        <div className="min-w-0 flex-1">
          <p key={lineKey} className="phrase-fade font-display text-xl font-semibold leading-snug sm:text-2xl">
            {line}
          </p>
          <p className="mt-2 text-xs text-muted">
            {expected} · <span className="tabular-nums">{clock}</span> so far · Keep this tab open, and feel free
            to switch tabs.
          </p>
        </div>
      </div>
    </div>
  );
}
