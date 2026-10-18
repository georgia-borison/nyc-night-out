"use client";

import { useEffect, useId, useState } from "react";
import { GhostButton, PrimaryButton } from "./ui";
import { signInHref, useAccount } from "./useAccount";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Invite friends": adds the plan to your Google Calendar with your friends as
 * guests, and Google emails them the invite. Needs the plan saved (it has a
 * share link) and you signed in with Google.
 */
export function InviteFriends({
  planId,
  ensureSaved,
  defaultOpen = false,
}: {
  /** The saved plan's id, if it's saved already. */
  planId: string | null;
  /** Saves the plan first when it isn't yet (in the planner); returns its id. */
  ensureSaved?: () => Promise<string | null>;
  /** Open on arrival (coming back from Google sign-in). */
  defaultOpen?: boolean;
}) {
  const { loading, enabled, user } = useAccount();
  const [open, setOpen] = useState(defaultOpen);
  const [guests, setGuests] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; signIn?: boolean } | null>(null);
  const [sent, setSent] = useState<{ count: number; link: string | null } | null>(null);
  const panelId = useId();

  // Drop "?invite=1" from the address once the panel has opened, so a share link stays clean.
  useEffect(() => {
    if (!defaultOpen) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("invite")) {
      url.searchParams.delete("invite");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, [defaultOpen]);

  if (loading || !enabled) return null;

  // Add whatever's typed (or pasted, several at once) as guests.
  function addDraft(text = draft) {
    const found = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const good = found.filter((e) => EMAIL.test(e));
    const bad = found.filter((e) => !EMAIL.test(e));
    if (good.length) setGuests((g) => Array.from(new Set([...g, ...good.map((e) => e.toLowerCase())])).slice(0, 20));
    setDraft(bad.join(" "));
    setError(bad.length ? { text: `“${bad[0]}” doesn’t look like an email address.` } : null);
  }

  async function startSignIn() {
    // Sign-in leaves the page, so the plan must be saved to come back to it.
    const id = planId ?? (await ensureSaved?.()) ?? null;
    if (!id) {
      setError({ text: "Save the plan first, then invite friends." });
      return;
    }
    window.location.href = signInHref(`/plan/${id}?invite=1`);
  }

  async function send() {
    const pending = draft.trim() ? draft : "";
    if (pending) addDraft(pending);
    const all = Array.from(
      new Set([...guests, ...pending.split(/[\s,;]+/).filter((e) => EMAIL.test(e)).map((e) => e.toLowerCase())]),
    );
    if (!all.length) {
      setError({ text: "Add at least one friend’s email." });
      return;
    }
    setSending(true);
    setError(null);
    try {
      const id = planId ?? (await ensureSaved?.()) ?? null;
      if (!id) throw new Error("Save the plan first, then invite friends.");
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: id, guests: all, note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ text: data.error ?? `Something went wrong (${res.status}).`, signIn: data.signIn });
        return;
      }
      setSent({ count: data.invited ?? all.length, link: data.link ?? null });
      setGuests([]);
      setDraft("");
      setNote("");
    } catch (err) {
      setError({ text: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <GhostButton onClick={() => setOpen(true)}>
        <span aria-hidden>📅</span> Invite friends
      </GhostButton>
    );
  }

  return (
    <section
      id={panelId}
      aria-labelledby={`${panelId}-title`}
      className="glow-card w-full space-y-4 rounded-2xl p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${panelId}-title`} className="font-display text-xl font-bold">
            <span aria-hidden>📅</span> Invite friends
          </h2>
          <p className="mt-1 text-sm text-muted">
            We&rsquo;ll add tonight to your Google Calendar with your friends as guests, and Google emails them the invite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close invite friends"
          className="rounded-full px-2 text-lg text-muted hover:text-fg"
        >
          ×
        </button>
      </div>

      {sent && (
        <p role="status" className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          ✓ Invites sent to {sent.count} {sent.count === 1 ? "friend" : "friends"}.{" "}
          {sent.link && (
            <a href={sent.link} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-4">
              Open in Google Calendar ↗
            </a>
          )}
        </p>
      )}

      {!user ? (
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={startSignIn}>Sign in with Google to send invites</PrimaryButton>
          <p className="text-xs text-muted">We only ask to add events to your calendar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted">Friends&rsquo; emails</span>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 focus-within:border-accent">
              {guests.map((g) => (
                <span key={g} className="flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-sm text-fg">
                  {g}
                  <button
                    type="button"
                    aria-label={`Remove ${g}`}
                    onClick={() => setGuests((all) => all.filter((x) => x !== g))}
                    className="text-muted hover:text-fg"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="email"
                multiple
                value={draft}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/[,;\s]$/.test(v)) addDraft(v);
                  else setDraft(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDraft();
                  } else if (e.key === "Backspace" && !draft && guests.length) {
                    setGuests((all) => all.slice(0, -1));
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (/[,;\s]/.test(text.trim())) {
                    e.preventDefault();
                    addDraft(draft + " " + text);
                  }
                }}
                onBlur={() => draft.trim() && addDraft()}
                placeholder={guests.length ? "Add another…" : "friend@example.com"}
                className="min-w-40 flex-1 bg-transparent py-1 text-fg outline-none placeholder:text-muted/70"
              />
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Who's in? Dress code: sparkly."
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-fg outline-none placeholder:text-muted/70 focus:border-accent"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={send} disabled={sending}>
              {sending ? "Sending…" : "Send invites"}
            </PrimaryButton>
            <span className="text-xs text-muted">From {user.email}</span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.text}{" "}
          {error.signIn && (
            <button type="button" onClick={startSignIn} className="font-medium underline underline-offset-4">
              Sign in again
            </button>
          )}
        </p>
      )}
    </section>
  );
}
