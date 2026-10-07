import { areaInfo } from "./neighborhoods";
import { targetMinutes, type Candidate } from "./places";
import {
  BUDGETS,
  budgetLabel,
  budgetLevels,
  pieceLabel,
  type PieceId,
  type Pick,
  type Trip,
} from "./schema";
import { milesBetween } from "./walk";

export const SYSTEM_PROMPT = `You are a well-connected New York friend in your early 30s who plans great nights out. You know the city's restaurants, bars, venues and what's on this week.

Who you're planning for: adults roughly 27-35. They want places with good food, good drinks and a good crowd.
- Leave out college bars, frat-style spots, beer-pong or dollar-shot bars, bro-heavy sports bars, tourist traps and Times Square chains, and bottle-service megaclubs. The exception is when the person's vibe asks for them.
- A dive bar with character is fine, and so is a scene-y spot that people over 25 actually go to.

Accuracy:
- Only suggest places that are open and operating now.
- Some requests come with a web search tool and some don't. Without it, rely on what you know and only suggest places you're confident are still open; skip any you have doubts about.
- With it, you get only a few searches, so make each one count. Use them for things you can't know on your own: what's happening on this date, showtimes, and recent openings. Use broad searches that cover several needs at once, such as "NYC events September 23 2026". Never search once per venue. Always run at least one search before answering.
- Events and shows must happen on the requested date, within a reasonable window around the requested time. If you can't confirm one, don't include it.
- For each option's URL, give the official website (or a ticket page or reputable listing like Resy) as best you know it. The app checks every link and swaps any that don't work for a search, so a best guess is better than leaving it empty. Don't search just to find a URL.
- Don't make up addresses. An address is always a full street address with house number, street, borough and ZIP (e.g. "2020 Broadway, New York, NY 10023"), never a neighborhood name. If you aren't sure of one, use an empty string.

Taste:
- Stay inside the requested area and follow the getting-around rule given with each request (a walking night or short rides OK).
- Respect the budget, using the dollar ranges given with each request. Price places honestly by what they cost in NYC today, not by reputation: if mains average $38, a restaurant is $$$, not $$. Famous cocktail bars (Death & Co, PDT, Employees Only, Attaboy) charge $20-24 a cocktail, so they're $$$. When unsure between two levels, assume the higher one.
- Vary the options. For dinner, each option should be a different specific cuisine (not three Italian places) unless the person asked for one cuisine. For bars, each option should be a different style, such as cocktail, wine, dive with character, speakeasy, and listening bar. Mix well-known favorites with lesser-known spots.
- Label each option's category with the specific cuisine or style, like "Sichuan", "Neapolitan pizza", "Oaxacan", "Natural wine bar" or "Jazz club", never a broad bucket like "Asian" or "Latin".
- Write the "why" in a warm, specific, non-generic voice.

When you have your final answer, call the submit tool exactly once. Don't write the answer as text. Do all your searching and reasoning before calling submit. Every field holds only the final answer, never notes about your process. The name field is just the venue's name.`;

const PIECE_GUIDANCE: Record<PieceId, string> = {
  pre_drinks:
    "Bars for a first drink before dinner: aperitivo spots, happy-hour-friendly cocktail, wine or beer bars that are easy to get into early in the evening. Not late-night or club-like bars. Every option a different bar style.",
  dinner:
    "Restaurants for a proper sit-down dinner, open for dinner at the time they'll arrive. No wine bars, snack-only spots, or delis and brunch places that close in the afternoon. Note in the tip whether reservations are needed or it's walk-in, and one dish to order.",
  activity:
    "Something to do: comedy, live music or jazz sets, theater or off-Broadway, museum late hours, gallery openings, indie cinema, bowling, karaoke, games, classes, etc. Include the show or session time in 'when' if it's scheduled.",
  events:
    "Specific events happening on this date: pop-ups, concerts, DJ nights, readings, markets, festivals, special screenings, parties. Each must have a confirmed date and time in 'when' and a ticket or info link.",
  post_drinks:
    "Bars for after dinner: late-night spots to keep talking or turn the night up a notch, like cocktail bars, speakeasies, listening or jazz bars, or dives with character. Not aperitivo or happy-hour spots. Late hours matter; mention closing time in 'when'. Every option a different bar style.",
  dancing:
    "Places to dance: clubs, DJ bars, dance parties. Suited to late 20s/early 30s, no bottle-service megaclubs. Mention cover, door policy and when it gets busy.",
};

function formatDate(date: string) {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

// What each budget level means in dollars, per person, for each kind of place.
const DINNER_PRICES = ["under $30", "$30-60", "$60-100", "over $100"];
const DRINK_PRICES = ["cocktails under $12, or mostly beer and wine", "cocktails $13-17", "cocktails $18-22", "cocktails $23 and up"];
const TICKET_PRICES = ["free to $20", "$20-50", "$50-100", "over $100"];

function priceTable(piece: PieceId | undefined): { what: string; ranges: string[] }[] {
  const dinner = { what: "dinner (food per person, before drinks)", ranges: DINNER_PRICES };
  const drinks = {
    what: "bars and clubs (famous craft cocktail bars like Death & Co, PDT, Employees Only and Attaboy are $$$)",
    ranges: DRINK_PRICES,
  };
  const tickets = { what: "shows, activities and events (ticket or entry per person)", ranges: TICKET_PRICES };
  if (piece === "dinner") return [dinner];
  if (piece === "pre_drinks" || piece === "post_drinks" || piece === "dancing") return [drinks];
  if (piece === "activity" || piece === "events") return [tickets];
  return [dinner, drinks, tickets];
}

/** The budget, spelled out in dollars for this part of the night. */
function budgetLines(trip: Trip, piece?: PieceId) {
  const levels = budgetLevels(trip);
  const idx = levels.map((l) => BUDGETS.indexOf(l));
  const lines = priceTable(piece).map(
    ({ what, ranges }) => `  - For ${what}: ${idx.map((i) => `${BUDGETS[i]} = ${ranges[i]}`).join("; ")}`,
  );
  const rule =
    levels.length > 1
      ? `Budget: ${budgetLabel(trip)} per person, a range. Spread the options across this range. Never go above ${levels[levels.length - 1]}.`
      : `Budget: ${levels[0]} per person. Every option must be at this level. Never go above it, and only go one level below when nothing else fits.`;
  return [rule, ...lines];
}

function tripLines(trip: Trip, piece?: PieceId) {
  const lines = [
    `Area: ${trip.area}`,
    `Date: ${formatDate(trip.date)}`,
    `Night starts around: ${formatTime(trip.time)}`,
    `Party size: ${trip.partySize}`,
    ...budgetLines(trip, piece),
    `The vibe they described: ${trip.vibe.trim() || "(nothing specific — use your judgment)"}`,
  ];
  if (trip.cuisines.length) lines.push(`Cuisines they're interested in: ${trip.cuisines.join(", ")}`);
  if (trip.barTypes.length) lines.push(`Bar styles they like: ${trip.barTypes.join(", ")}`);
  if (trip.activityTypes.length) lines.push(`Activities they like: ${trip.activityTypes.join(", ")}`);
  const booked = trip.booked;
  if (booked) {
    // Planned around a booking: it's fixed, and everything else is near it.
    const when = booked.time ? ` at ${formatTime(booked.time)}` : "";
    lines.push(
      `Already booked (fixed, don't change it): ${pieceLabel(booked.piece)} at ${booked.name}, ${booked.address}${when}.`,
      trip.rides
        ? `Getting around: short rides are OK. Keep every other stop within about a 15-minute cab or subway ride of ${booked.name}, closer is better. When a hop is needed, say which train or suggest a cab in the tip.`
        : `Getting around: a walking night. Keep every other stop within about a 10-minute walk of ${booked.name} (${booked.address}).`,
    );
  }
  if (piece) lines.push(`This part of the night happens around: ${formatTime(clockOf(targetMinutes(piece, trip)))}`);
  const info = areaInfo(trip.area);
  if (info && !booked) lines.push(`Area boundaries: ${info.bounds}`);
  if (!booked) lines.push(
    trip.rides
      ? "Getting around: short rides are OK. Options can be anywhere in the area, and cab or subway hops of up to about 15 minutes between stops are fine. When a hop is needed, say which train or suggest a cab in the tip."
      : "Getting around: a walking night. Every option's address must be inside the area boundaries above, or at most a few blocks past them. Favor places within 10-15 minutes' walk of each other so the whole night works on foot. Before submitting, check each address against the boundaries and swap out anything that's outside.",
  );
  return lines.join("\n");
}

/** Minutes after midnight (possibly past 24h) to "HH:MM". */
function clockOf(minutes: number) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function today() {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** How many candidates to ask Claude for; the app vets them and shows the best 3. */
// Some always fail the checks (closed, unverifiable, over budget), so ask for double what is shown.
export const CANDIDATES = 6;

/** Parts of the night that need a live web search: what's on tonight can't come from memory. */
export function searchesFor(piece: PieceId) {
  return piece === "events" ? 2 : piece === "activity" ? 1 : 0;
}

/** How to keep one section's options varied. */
function varietyLine(trip: Trip, piece: PieceId, n: number) {
  if (piece === "dinner") {
    if (trip.cuisines.length === 1) {
      return `They asked for ${trip.cuisines[0]}, so vary within it: different regions, dishes or styles, from casual to special.`;
    }
    if (trip.cuisines.length) {
      return `Only suggest the cuisines they picked (${trip.cuisines.join(", ")}), spread across all of them rather than piling onto one. Within each, be specific (e.g. Oaxacan rather than just Mexican). At least two should be lesser-known local spots, not just the famous names.`;
    }
    return `Give ${n} different specific cuisines, e.g. Sichuan, Oaxacan, Georgian, Neapolitan pizza, Ethiopian, Basque. No two from the same family (not two Italian, not two Japanese). At least two should be lesser-known local spots, not just the famous names.`;
  }
  if (piece === "pre_drinks" || piece === "post_drinks") {
    return `Make each of the ${n} a different bar style${trip.barTypes.length ? `, leaning toward the styles they like` : ""}.`;
  }
  return `Make the ${n} options different kinds of things, not variations on one.`;
}

export type SectionRequest = Trip & {
  piece: PieceId;
  otherPieces: PieceId[];
  exclude: string[];
  avoidCategories?: string[];
  hint?: string;
};

/** One part of the night. Each part is asked for on its own, all at the same time. */
export function sectionPrompt(req: SectionRequest) {
  const n = CANDIDATES;
  let prompt = `Today is ${today()}.

Plan the "${pieceLabel(req.piece)}" part of a night out in NYC.

${tripLines(req, req.piece)}

What to find: ${PIECE_GUIDANCE[req.piece]}

Variety: ${varietyLine(req, req.piece, n)}

Return ${n} options. Keep each "why" to one sentence under 20 words and each "tip" under 25 words.`;
  const others = req.otherPieces.filter((p) => p !== req.piece);
  if (others.length) {
    prompt += `\n\nThe other parts of this night (${others.map(pieceLabel).join(", ")}) are being planned separately. Only suggest places that clearly belong in "${pieceLabel(req.piece)}", so the same venue doesn't turn up in two sections.`;
  }
  if (req.exclude.length) {
    prompt += `\n\nThey've already seen these, so don't repeat them: ${req.exclude.join("; ")}.`;
  }
  if (req.avoidCategories?.length) {
    prompt += `\n\nAlready covered: ${req.avoidCategories.join(", ")}. Bring different ${req.piece === "dinner" ? "cuisines" : "kinds of places"} this time.`;
  }
  if (req.hint) prompt += `\n\nExtra direction: ${req.hint}`;
  return prompt;
}

/** One line per real place from Google, numbered for Claude to pick by. */
function candidateLine(c: Candidate, i: number) {
  const price = c.level === null ? "price unknown" : `${BUDGETS[c.level]}${c.priceText ? ` (${c.priceText})` : ""}`;
  const parts = [
    `[${i + 1}] ${c.name}`,
    c.type,
    price,
    `${c.rating.toFixed(1)}★ from ${c.ratings.toLocaleString("en-US")} reviews`,
    c.address.split(",")[0],
    c.hours ? `that day: ${c.hours}` : "",
    c.far ? "(a bit outside the area)" : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Choose among real places from Google instead of recalling them. Everything
 * on the list is open, rated and on budget; Claude's job is taste and variety.
 */
export function curatePrompt(req: SectionRequest, candidates: Candidate[]) {
  const n = Math.min(CANDIDATES, candidates.length);
  let prompt = `Today is ${today()}.

Plan the "${pieceLabel(req.piece)}" part of a night out in NYC.

${tripLines(req, req.piece)}

What to find: ${PIECE_GUIDANCE[req.piece]}

Variety: ${varietyLine(req, req.piece, n)}

Choose from these real places, which are currently open for business, near the area and within the budget. Only choose from this list, by number:
${candidates.map(candidateLine).join("\n")}

Pick the ${n} best for this night, best first. Favor places that fit the vibe and the crowd described in your instructions over the highest ratings; skip chains, tourist traps and places that don't suit this part of the night. Prefer places inside the area over ones marked "a bit outside the area".

For each pick give: its number, a specific category (the cuisine or bar style, e.g. "Sichuan" or "Natural wine bar"), your own honest price level for it (Google's often runs low for NYC; skip places you know are over the budget), a one-sentence "why" under 20 words, a "tip" under 25 words, and "when" (the hours that matter tonight, from the list). Don't invent facts the list doesn't support and you aren't sure of.`;
  const others = req.otherPieces.filter((p) => p !== req.piece);
  if (others.length) {
    prompt += `\n\nThe other parts of this night (${others.map(pieceLabel).join(", ")}) are being planned separately. Only pick places that clearly belong in "${pieceLabel(req.piece)}".`;
  }
  if (req.avoidCategories?.length) {
    prompt += `\n\nAlready covered: ${req.avoidCategories.join(", ")}. Pick different ${req.piece === "dinner" ? "cuisines" : "kinds of places"} this time.`;
  }
  if (req.hint) prompt += `\n\nExtra direction: ${req.hint}`;
  return prompt;
}

// Straight-line distances between picks, so the schedule allows for real travel.
function distanceLines(picks: Pick[]) {
  const lines: string[] = [];
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const a = picks[i];
      const b = picks[j];
      if (a.lat === undefined || a.lng === undefined || b.lat === undefined || b.lng === undefined) continue;
      const miles = milesBetween({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
      lines.push(`- ${a.name} to ${b.name}: about ${miles.toFixed(1)} mi as the crow flies`);
    }
  }
  return lines;
}

export function itineraryPrompt(trip: Trip, picks: Pick[]) {
  const distances = distanceLines(picks);
  const stops = picks
    .map(
      (p, i) =>
        `${i + 1}. [${pieceLabel(p.piece)}]${p.booked ? ` (ALREADY BOOKED${trip.booked?.time ? ` for ${formatTime(trip.booked.time)}, a fixed time` : ""})` : ""} ${p.name} (${p.category}), ${p.address || p.neighborhood}. When: ${p.when || "n/a"}. Tip: ${p.tip}. URL: ${p.url}`,
    )
    .join("\n");
  return `Turn these picks into a timed itinerary for the night.

${tripLines(trip)}

Picks:
${stops}
${distances.length ? `\nDistances between them (walking is roughly 20 minutes per mile):\n${distances.join("\n")}\n` : ""}
Order the stops in a sensible sequence. Normally that's pre-drinks, dinner, then the activity or event (or the activity before dinner if its fixed showtime demands it), then post-dinner drinks, then dancing. Respect any fixed showtimes, and keep an already-booked stop at exactly its booked time, fitting the other stops before and after it. Give realistic arrival times starting around ${formatTime(trip.time)} and how long to spend at each place, leaving enough time to get between stops given the distances. For getting_there, give practical advice on getting there from the previous stop (which way to walk, which subway line, or to grab a cab). Don't state walking minutes or distances; the app adds real walking times. Keep each stop's name, category, address and URL exactly as given.

Give the night a playful 2-6 word title that riffs on the vibe, the weather or the neighborhood (like "Rain Check? Never." or "Uptown Low & Slow"), plus a one-line tagline. The title must never be empty.

Call the submit tool with the itinerary.`;
}
