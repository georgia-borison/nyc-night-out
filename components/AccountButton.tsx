"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signInHref, signOut, useAccount } from "./useAccount";

/** Header sign-in: "Sign in" when signed out; the Google avatar with a small menu when signed in. */
export function AccountButton() {
  const { loading, enabled, user } = useAccount();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (loading || !enabled) return null;

  if (!user) {
    return (
      <a
        href={signInHref(pathname)}
        className="rounded-xl px-3 py-2 font-medium text-fg/85 transition hover:text-fg"
      >
        Sign in
      </a>
    );
  }

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.email}`}
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center overflow-hidden rounded-full border border-line bg-surface-2 font-semibold text-fg transition hover:border-accent"
      >
        {user.picture ? (
          // Google's avatar URL; a plain img avoids configuring next/image for its host.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-60 rounded-2xl border border-line bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
        >
          <p className="truncate text-sm font-medium text-fg">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-left text-sm text-fg transition hover:border-accent hover:bg-accent-soft"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
