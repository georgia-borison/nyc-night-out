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
