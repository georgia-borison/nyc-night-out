"use client";

import { useEffect, useState } from "react";

export type Account = { email: string; name: string; picture?: string };

/** Who's signed in with Google. `enabled` is false until the app's Google keys are set up. */
export function useAccount() {
  const [state, setState] = useState<{ loading: boolean; enabled: boolean; user: Account | null }>({
    loading: true,
    enabled: false,
    user: null,
  });
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { enabled: boolean; user: Account | null }) => live && setState({ loading: false, ...d }))
      .catch(() => live && setState({ loading: false, enabled: false, user: null }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** Sign in with Google, then come back to `returnTo` (a path on this site). */
export function signInHref(returnTo: string) {
  return `/api/auth/google?return=${encodeURIComponent(returnTo)}`;
}

export async function signOut() {
  await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
  window.location.reload();
}
