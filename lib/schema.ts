import { z } from "zod";

export const PIECES = [
  { id: "pre_drinks", label: "Pre-dinner drinks", short: "Pre-drinks", emoji: "🍸" },
  { id: "dinner", label: "Dinner", short: "Dinner", emoji: "🍽️" },
  { id: "activity", label: "Activity or show", short: "Activity", emoji: "🎭" },
  { id: "events", label: "Events tonight", short: "Events", emoji: "🎟️" },
  { id: "post_drinks", label: "Post-dinner drinks", short: "Nightcap", emoji: "🥃" },
  { id: "dancing", label: "Dancing / club", short: "Dancing", emoji: "🪩" },
] as const;

export type PieceId = (typeof PIECES)[number]["id"];
export const PIECE_IDS = PIECES.map((p) => p.id) as [PieceId, ...PieceId[]];

export function pieceLabel(id: PieceId) {
  return PIECES.find((p) => p.id === id)?.label ?? id;
}

export const BUDGETS = ["$", "$$", "$$$", "$$$$"] as const;
export type Budget = (typeof BUDGETS)[number];

/** The budget levels a trip allows: one level, or every level in a range. */
export function budgetLevels(trip: { budget: Budget; budgetTo?: Budget }): Budget[] {
  const a = BUDGETS.indexOf(trip.budget);
  const b = trip.budgetTo ? BUDGETS.indexOf(trip.budgetTo) : a;
  return BUDGETS.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** "$$", or "$$–$$$" for a range. */
export function budgetLabel(trip: { budget: Budget; budgetTo?: Budget }) {
  const levels = budgetLevels(trip);
  return levels.length > 1 ? `${levels[0]}–${levels[levels.length - 1]}` : levels[0];
}

/** An option's price as a budget level index (0-3), or null if it can't be read. "Free" counts as $. */
export function priceLevel(price: string): number | null {
  const p = price.trim();
  if (/^free\b/i.test(p)) return 0;
  // Ranges like "$$-$$$" count by their top end.
  const runs = p.match(/\${1,4}/g);
  if (!runs) return null;
  return Math.max(...runs.map((r) => r.length)) - 1;
}

export const TripSchema = z.object({
  area: z.string().min(1).max(120),
  vibe: z.string().max(1000).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(30),
  // The low end of the budget; budgetTo is the high end when a range was picked.
  budget: z.enum(BUDGETS),
  budgetTo: z.enum(BUDGETS).optional(),
  cuisines: z.array(z.string().max(60)).max(20).default([]),
  barTypes: z.array(z.string().max(60)).max(20).default([]),
  activityTypes: z.array(z.string().max(60)).max(20).default([]),
  // OK with a quick cab or subway ride between stops (otherwise a walking night).
  rides: z.boolean().default(false),
});
export type Trip = z.infer<typeof TripSchema>;

export const SuggestRequestSchema = TripSchema.extend({
  piece: z.enum(PIECE_IDS),
  otherPieces: z.array(z.enum(PIECE_IDS)).max(PIECES.length).default([]),
  exclude: z.array(z.string().max(120)).max(40).default([]),
  // Cuisines or styles already showing, so a refresh brings different kinds of places.
  avoidCategories: z.array(z.string().max(80)).max(20).default([]),
  hint: z.string().max(300).optional(),
});
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const OptionSchema = z.object({
  name: z.string(),
  category: z.string(),
  neighborhood: z.string(),
  address: z.string(),
  price: z.string(),
  why: z.string(),
  tip: z.string(),
  when: z.string(),
  url: z.string(),
  // Filled in by the app in the background (not part of Claude's output).
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type Option = z.infer<typeof OptionSchema>;

export const OptionsResultSchema = z.object({
  options: z.array(OptionSchema),
});

// Claude occasionally writes its search reasoning into the name field
// ("Let me check whether..."). Drop any option whose name reads like prose.
const PROSE_OPENER = /^(let me|let's|i'll|i will|i need|i should|i'm|i am|searching|based on|looking|now,? |okay|ok,? |hmm|note:)/i;

// Or hedges between places: "I Sodi Bar / Via Carota area aperitivo - 'Bar Pisellino'".
const HEDGE = /\s\/\s|\barea\b|["“”]|\s'[^']+'/i;

export function looksLikeVenueName(name: string) {
  const n = name.trim();
  return n.length > 0 && n.length <= 60 && !/[\r\n]/.test(n) && !PROSE_OPENER.test(n) && !HEDGE.test(n);
}

export function cleanOptions(options: Option[]) {
  return options.filter((o) => {
    if (looksLikeVenueName(o.name)) return true;
    console.warn("[clean] dropped option with a non-name title:", JSON.stringify(o.name.slice(0, 120)));
    return false;
  });
}

// The first search: every selected part of the night, each searched at the same time.
export const NightRequestSchema = TripSchema.extend({
  pieces: z.array(z.enum(PIECE_IDS)).min(1).max(PIECES.length),
});

// Lines streamed back by /api/night, one JSON object per line.
export type NightEvent =
  | { type: "search"; query: string }
  // Vetted options (real, open, and close enough), with coordinates. A section
  // can arrive more than once; the latest replaces the earlier one.
  | { type: "section"; piece: PieceId; options: Option[]; note?: string }
  // Too few good options survived vetting; more are being found for this part.
  | { type: "topup"; piece: PieceId }
  | { type: "done"; costUsd: number }
  | { type: "error"; error: string };

export const ItineraryStopSchema = z.object({
  time: z.string(),
  piece: z.string(),
  name: z.string(),
  category: z.string(),
  address: z.string(),
  url: z.string(),
  notes: z.string(),
  getting_there: z.string(),
  // Added by the server after geocoding; not part of Claude's output.
  lat: z.number().optional(),
  lng: z.number().optional(),
  // Real walk from the previous stop (lib/walk.ts).
  walk: z.object({ minutes: z.number(), miles: z.number(), estimated: z.boolean().optional() }).optional(),
});
export type ItineraryStop = z.infer<typeof ItineraryStopSchema>;

export const ItinerarySchema = z.object({
  title: z.string(),
  // Optional so plans saved before these fields existed still load.
  tagline: z.string().optional(),
  summary: z.string(),
  stops: z.array(ItineraryStopSchema),
  tips: z.array(z.string()),
  // Which version of the map lookup placed the pins (see lib/geocode.ts).
  geoVersion: z.number().optional(),
});
export type Itinerary = z.infer<typeof ItinerarySchema>;

// Coordinates are looked up in the background as soon as an option is picked.
export const PickSchema = OptionSchema.extend({ piece: z.enum(PIECE_IDS) });
export type Pick = z.infer<typeof PickSchema>;

export const ItineraryRequestSchema = TripSchema.extend({
  picks: z.array(PickSchema).min(1).max(PIECES.length),
});

export const LocateRequestSchema = z.object({
  name: z.string().max(120),
  address: z.string().max(200),
  area: z.string().max(120),
});

export const SavePlanSchema = z.object({
  trip: TripSchema,
  itinerary: ItinerarySchema,
});

export type SavedPlan = {
  id: string;
  createdAt: string;
  trip: Trip;
  itinerary: Itinerary;
};

// JSON schemas handed to Claude as strict tool inputs. Kept in sync with the
// zod schemas above, which re-validate whatever comes back.
const str = { type: "string" } as const;
const ADDRESS = {
  type: "string",
  description:
    "Full street address with house number, street, borough and ZIP, e.g. '2020 Broadway, New York, NY 10023'. Never a neighborhood name. Empty string if unsure.",
} as const;

const OPTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category", "neighborhood", "address", "price", "why", "tip", "when", "url"],
  properties: {
    name: { type: "string", description: "Only the venue's name, e.g. 'I Sodi'. No commentary or notes." },
    category: {
      type: "string",
      description:
        "Specific type, e.g. 'Sichuan', 'Oaxacan', 'Natural wine bar', 'Jazz club', 'Stand-up comedy'. Never a broad bucket like 'Asian'.",
    },
    neighborhood: str,
    address: ADDRESS,
    price: {
      type: "string",
      description:
        "One of $, $$, $$$, $$$$, or 'Free': what it really costs per person in NYC today, using the dollar ranges in the request.",
    },
    why: { type: "string", description: "Why it fits this night: one sentence, under 20 words" },
    tip: { type: "string", description: "Practical tip (reservations, what to order, arrive-by, cover), under 25 words" },
    when: {
      type: "string",
      description: "For events/shows: date and time. For venues: hours relevant to tonight. Empty string if unknown.",
    },
    url: { type: "string", description: "Official site or a source page found in search" },
  },
} as const;

export const OPTIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["options"],
  properties: { options: { type: "array", items: OPTION_JSON_SCHEMA } },
} as const;

// Claude's choices from a list of real places (lib/places.ts), by number.
export const PicksResultSchema = z.object({
  options: z.array(
    z.object({
      number: z.number().int(),
      category: z.string(),
      price: z.string(),
      why: z.string(),
      tip: z.string(),
      when: z.string(),
    }),
  ),
});

export const PICKS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["options"],
  properties: {
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "category", "price", "why", "tip", "when"],
        properties: {
          number: { type: "integer", description: "The place's number in the list" },
          category: OPTION_JSON_SCHEMA.properties.category,
          price: {
            type: "string",
            description:
              "Your own read of what it costs per person in NYC today, using the dollar ranges in the request: $, $, $$ or $$.",
          },
          why: OPTION_JSON_SCHEMA.properties.why,
          tip: OPTION_JSON_SCHEMA.properties.tip,
          when: { type: "string", description: "Hours that matter tonight, from the list. Empty string if unknown." },
        },
      },
    },
  },
} as const;

export const ITINERARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "tagline", "summary", "stops", "tips"],
  properties: {
    title: {
      type: "string",
      description:
        "Required, never empty. A playful 2-6 word name for the night that riffs on the vibe, the weather or the neighborhood, e.g. 'Rain Check? Never.', 'Uptown Low & Slow', 'Negronis Before Noodles'.",
    },
    tagline: {
      type: "string",
      description: "One short line under the title, e.g. 'A rainy-night date with wine, injera and paint'.",
    },
    summary: { type: "string", description: "Two sentences on the shape of the night" },
    stops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["time", "piece", "name", "category", "address", "url", "notes", "getting_there"],
        properties: {
          time: { type: "string", description: "Suggested arrival time, e.g. '7:00 PM'" },
          piece: { type: "string", description: "Which part of the night, e.g. 'Dinner'" },
          name: str,
          category: str,
          address: ADDRESS,
          url: str,
          notes: { type: "string", description: "What to do/order there, how long to stay" },
          getting_there: {
            type: "string",
            description:
              "How to get here from the previous stop (walk minutes, subway line, or cab). Empty for the first stop.",
          },
        },
      },
    },
    tips: { type: "array", items: str, description: "2-4 practical tips for the night" },
  },
} as const;
