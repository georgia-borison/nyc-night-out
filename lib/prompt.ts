import { areaInfo } from "./neighborhoods";
import { type PieceId, type SuggestRequest, type Trip, type Pick, PIECES, pieceLabel } from "./schema";
import { milesBetween } from "./walk";

export const SYSTEM_PROMPT = `You are a well-connected New York friend in your early 30s who plans great nights out. You know the city's restaurants, bars, venues and what's on this week.

Who you're planning for: adults roughly 27-35. They want places with good food, good drinks and a good crowd.
- Leave out college bars, frat-style spots, beer-pong or dollar-shot bars, bro-heavy sports bars, tourist traps and Times Square chains, and bottle-service megaclubs. The exception is when the person's vibe asks for them.
- A dive bar with character is fine, and so is a scene-y spot that people over 25 actually go to.

Accuracy:
- Only suggest places that are open and operating now.
- You get only a few web searches, so make each one count. For well-established places, rely on what you already know. Save searches for things you can't know on your own: what's happening on this date, recent openings, and whether a place you're unsure about has closed. Use broad searches that cover several needs at once, such as "West Village new restaurants and bars 2026" or "NYC events September 23 2026". Never search once per venue. Always run at least one search before answering, to catch recent closures and openings in the area, or what's on this date.
- Events and shows must happen on the requested date, within a reasonable window around the requested time. If you can't confirm one, don't include it.
- For each option's URL, give the official website (or a ticket page or reputable listing like Resy) as best you know it. The app checks every link and swaps any that don't work for a search, so a best guess is better than leaving it empty. Don't search just to find a URL.
- Don't make up addresses. An address is always a full street address with house number, street, borough and ZIP (e.g. "2020 Broadway, New York, NY 10023"), never a neighborhood name. If you aren't sure of one, use an empty string.

Taste:
- Stay inside the requested area and follow the getting-around rule given with each request (a walking night or short rides OK).
- Respect the budget. $ means cheap, $$ moderate, $$$ pricey, $$$$ splurge.
- Vary the options. For dinner, each option should be a different specific cuisine (not three Italian places) unless the person asked for one cuisine. For bars, mix styles such as cocktail, wine, dive with character, speakeasy, and listening bar. Mix well-known favorites with lesser-known spots.
- Label each option's category with the specific cuisine or style, like "Sichuan", "Neapolitan pizza", "Oaxacan", "Natural wine bar" or "Jazz club", never a broad bucket like "Asian" or "Latin".
- Write the "why" in a warm, specific, non-generic voice.

When you have your final answer, call the submit tool exactly once. Don't write the answer as text. Do all your searching and reasoning before calling submit. Every field holds only the final answer, never notes about your process. The name field is just the venue's name.`;

const PIECE_GUIDANCE: Record<PieceId, string> = {
  pre_drinks:
    "Bars for a first drink before dinner: aperitivo spots, happy-hour-friendly cocktail, wine or beer bars that are easy to get into early in the evening, ideally near the dinner area. At most two options of the same bar style.",
  dinner:
    "Restaurants for a proper sit-down dinner. No wine bars or snack-only spots. Note in the tip whether reservations are needed or it's walk-in, and one dish to order.",
  activity:
    "Something to do: comedy, live music or jazz sets, theater or off-Broadway, museum late hours, gallery openings, indie cinema, bowling, karaoke, games, classes, etc. Include the show or session time in 'when' if it's scheduled.",
  events:
    "Specific events happening on this date: pop-ups, concerts, DJ nights, readings, markets, festivals, special screenings, parties. Each must have a confirmed date and time in 'when' and a ticket or info link.",
  post_drinks:
    "Bars for after dinner: late-night spots to keep talking or turn the night up a notch, like cocktail bars, speakeasies, listening or jazz bars, or dives with character. Late hours matter; mention closing time in 'when'. At most two options of the same bar style.",
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

function tripLines(trip: Trip) {
  const lines = [
    `Area: ${trip.area}`,
    `Date: ${formatDate(trip.date)}`,
    `Night starts around: ${formatTime(trip.time)}`,
    `Party size: ${trip.partySize}`,
    `Budget: ${trip.budget}`,
    `The vibe they described: ${trip.vibe.trim() || "(nothing specific — use your judgment)"}`,
  ];
  if (trip.cuisines.length) lines.push(`Cuisines they're interested in: ${trip.cuisines.join(", ")}`);
  if (trip.barTypes.length) lines.push(`Bar styles they like: ${trip.barTypes.join(", ")}`);
  if (trip.activityTypes.length) lines.push(`Activities they like: ${trip.activityTypes.join(", ")}`);
  const info = areaInfo(trip.area);
  if (info) lines.push(`Area boundaries: ${info.bounds}`);
  lines.push(
    trip.rides
      ? "Getting around: short rides are OK. Options can be anywhere in the area, and cab or subway hops of up to about 15 minutes between stops are fine. When a hop is needed, say which train or suggest a cab in the tip."
      : "Getting around: a walking night. Every option's address must be inside the area boundaries above, or at most a few blocks past them. Favor places within 10-15 minutes' walk of each other so the whole night works on foot. Before submitting, check each address against the boundaries and swap out anything that's outside.",
  );
  return lines.join("\n");
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
export function candidateCount(trip: Trip) {
  return trip.rides ? 4 : 5;
}

export function nightPrompt(trip: Trip, pieces: PieceId[]) {
  const ordered = PIECES.filter((p) => pieces.includes(p.id));
  const parts = ordered.map((p) => `- ${p.id} (${p.label}): ${PIECE_GUIDANCE[p.id]}`).join("\n");
  return `Today is ${today()}.

Plan a night out in NYC.

${tripLines(trip)}

Parts of the night to fill, each with ${candidateCount(trip)} options:
${parts}

Return one section per part, using the ids above, with ${candidateCount(trip)} options in every section. Never put the same venue in two sections. Keep each "why" to one sentence under 20 words and each "tip" under 25 words.`;
}

export function suggestPrompt(req: SuggestRequest) {
  let prompt = `Today is ${today()}.

Plan the "${pieceLabel(req.piece)}" part of a night out in NYC.

${tripLines(req)}

What to find: ${PIECE_GUIDANCE[req.piece]}

Return ${candidateCount(req)} options. Keep each "why" to one sentence under 20 words and each "tip" under 25 words.`;
  const others = req.otherPieces.filter((p) => p !== req.piece);
  if (others.length) {
    prompt += `\n\nThe other parts of this night (${others.map(pieceLabel).join(", ")}) are being planned separately. Only suggest places that clearly belong in "${pieceLabel(req.piece)}", so the same venue doesn't turn up in two sections.`;
  }
  if (req.exclude.length) {
    prompt += `\n\nThey've already seen these, so don't repeat them: ${req.exclude.join("; ")}.`;
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
        `${i + 1}. [${pieceLabel(p.piece)}] ${p.name} (${p.category}), ${p.address || p.neighborhood}. When: ${p.when || "n/a"}. Tip: ${p.tip}. URL: ${p.url}`,
    )
    .join("\n");
  return `Turn these picks into a timed itinerary for the night.

${tripLines(trip)}

Picks:
${stops}
${distances.length ? `\nDistances between them (walking is roughly 20 minutes per mile):\n${distances.join("\n")}\n` : ""}
Order the stops in a sensible sequence. Normally that's pre-drinks, dinner, then the activity or event (or the activity before dinner if its fixed showtime demands it), then post-dinner drinks, then dancing. Respect any fixed showtimes. Give realistic arrival times starting around ${formatTime(trip.time)} and how long to spend at each place, leaving enough time to get between stops given the distances. For getting_there, give practical advice on getting there from the previous stop (which way to walk, which subway line, or to grab a cab). Don't state walking minutes or distances; the app adds real walking times. Keep each stop's name, category, address and URL exactly as given.

Give the night a playful 2-6 word title that riffs on the vibe, the weather or the neighborhood (like "Rain Check? Never." or "Uptown Low & Slow"), plus a one-line tagline. The title must never be empty.

Call the submit tool with the itinerary.`;
}
