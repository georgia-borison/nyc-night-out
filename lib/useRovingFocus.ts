"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

/**
 * Arrow-key navigation for a group of buttons (a "roving tabindex"): Tab
 * enters the group once, on the selected button (or the first), and the arrow
 * keys, Home and End move between buttons. Spread the result on the container.
 */
export function useRovingFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const buttons = () =>
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);

  // Keep exactly one button in the tab order: the pressed one, else the first.
  useEffect(() => {
    const list = buttons();
    if (!list.length) return;
    const current = list.find((b) => b.getAttribute("aria-pressed") === "true") ?? list[0];
    list.forEach((b) => (b.tabIndex = b === current ? 0 : -1));
  });

  const onKeyDown = (e: KeyboardEvent<T>) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % list.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + list.length) % list.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? list.length - 1
              : -1;
    if (next === -1) return;
    e.preventDefault();
    list.forEach((b, k) => (b.tabIndex = k === next ? 0 : -1));
    list[next].focus();
  };

  return { ref, onKeyDown };
}
