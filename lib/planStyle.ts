// Visual helpers for the plan page. Stop "piece" labels are free text from
// Claude (e.g. "Pre-dinner drinks"), so match on keywords.

export type PieceKind = "drinks" | "dinner" | "show" | "dance";

export function pieceKind(piece: string): PieceKind {
  const p = piece.toLowerCase();
  // Order matters: "Pre-dinner drinks" and "Jazz club" must not match dinner.
  if (/danc/.test(p)) return "dance";
  if (/drink|cocktail|wine|bar\b|nightcap/.test(p)) return "drinks";
  if (/show|activity|event|comedy|music|jazz|museum|theater|theatre|concert/.test(p)) return "show";
  if (/club/.test(p)) return "dance";
  if (/dinner|eat|food|restaurant/.test(p)) return "dinner";
  return "drinks";
}

export const KIND_STYLE: Record<PieceKind, { emoji: string; color: string }> = {
  drinks: { emoji: "🍸", color: "var(--drinks)" },
  dinner: { emoji: "🍽️", color: "var(--dinner)" },
  show: { emoji: "🎭", color: "var(--show)" },
  dance: { emoji: "🪩", color: "var(--dance)" },
};

export function transitIcon(text: string) {
  const t = text.toLowerCase();
  if (/cab|taxi|uber|lyft|car\b|drive/.test(t)) return "🚕";
  if (/subway|train|\bline\b|metro|path\b|ferry/.test(t)) return "🚇";
  return "🚶";
}

/** Shown instead of "Website" when a venue's link didn't check out. */
export function searchUrl(name: string, address: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} ${address || ""} New York`.replace(/\s+/g, " "))}`;
}

export function mapsSearchUrl(name: string, address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`;
}

/** Walking directions through every stop, in order. No API key needed. */
export function mapsRouteUrl(stops: { name: string; address: string }[]) {
  const place = (s: { name: string; address: string }) => (s.address ? `${s.name}, ${s.address}` : `${s.name}, New York`);
  const params = new URLSearchParams({ api: "1", travelmode: "walking" });
  if (stops.length === 1) {
    params.set("destination", place(stops[0]));
  } else {
    params.set("origin", place(stops[0]));
    params.set("destination", place(stops[stops.length - 1]));
    const middle = stops.slice(1, -1).map(place);
    if (middle.length) params.set("waypoints", middle.join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** The label for a venue's link ("Website", "Instagram", "Tickets", "Google Maps"); "Search" when there's no link. */
export function linkLabel(link: { url: string; linkKind?: "website" | "instagram" | "tickets" | "maps" }) {
  if (!link.url) return "Search";
  return { website: "Website", instagram: "Instagram", tickets: "Tickets", maps: "Google Maps" }[link.linkKind ?? "website"];
}

type Reservable = {
  name: string;
  url: string;
  linkKind?: "website" | "instagram" | "tickets" | "maps";
  reservations?: {
    policy: "reservations" | "walk_in" | "both";
    platform?: "resy" | "opentable" | "tock" | "sevenrooms";
    url?: string;
    bookAhead?: boolean;
  };
};

const PLATFORM_NAMES = { resy: "Resy", opentable: "OpenTable", tock: "Tock", sevenrooms: "SevenRooms" } as const;

/** The short line about how a place takes guests, e.g. "📅 Reservations · Resy". */
export function reservationLabel(o: Reservable): string | null {
  const r = o.reservations;
  if (!r) return null;
  if (r.policy === "walk_in") return "🚶 Walk-ins only";
  const on = r.platform ? ` · ${PLATFORM_NAMES[r.platform]}` : "";
  if (r.policy === "both") return `📅 Reserve or walk in${on}`;
  return `📅 ${r.bookAhead ? "Book ahead" : "Reservations"}${on}`;
}

/** Adds query parameters to a link that may already have some. */
function withParams(url: string, params: Record<string, string>) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * A link that opens the place's booking page with the night's date, time and
 * party size filled in where the platform allows. Resy and OpenTable search
 * pages take the restaurant's name, so they work even without its exact page.
 * Null for walk-in-only places, or when there's nowhere to book.
 */
export function reserveLink(
  o: Reservable,
  when: { date: string; time: string; partySize: number },
): { href: string; label: string } | null {
  const r = o.reservations;
  if (!r || r.policy === "walk_in") return null;
  const { date, time, partySize } = when;
  const n = String(partySize);
  try {
    switch (r.platform) {
      case "resy":
        return {
          label: "Reserve on Resy",
          href: r.url
            ? withParams(r.url, { date, seats: n })
            : withParams("https://resy.com/cities/new-york-ny/search", { date, seats: n, query: o.name }),
        };
      case "opentable":
        return {
          label: "Reserve on OpenTable",
          href: withParams(r.url ?? "https://www.opentable.com/s", {
            dateTime: `${date}T${time}:00`,
            covers: n,
            ...(r.url ? {} : { term: o.name, metroId: "8" }),
          }),
        };
      case "tock":
        if (r.url) return { label: "Reserve on Tock", href: withParams(`${r.url.replace(/\/$/, "")}/search`, { date, size: n, time }) };
        break;
      case "sevenrooms":
        if (r.url) return { label: "Reserve on SevenRooms", href: withParams(r.url, { date, party_size: n }) };
        break;
    }
  } catch {
    // A malformed booking link: fall through to the venue's own site.
  }
  // No booking page we can fill in: send them to the venue's site to book.
  if (o.url && o.linkKind !== "maps") return { label: "Reserve on their site", href: o.url };
  return null;
}
