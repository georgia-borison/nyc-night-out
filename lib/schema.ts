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

export const TripSchema = z.object({
  area: z.string().min(1).max(120),
  vibe: z.string().max(1000).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(30),
  budget: z.enum(BUDGETS),
  cuisines: z.array(z.string().max(60)).max(20).default([]),
  barTypes: z.array(z.string().max(60)).max(20).default([]),
  activityTypes: z.array(z.string().max(60)).max(20).default([]),
});
export type Trip = z.infer<typeof TripSchema>;

export const SuggestRequestSchema = TripSchema.extend({
  piece: z.enum(PIECE_IDS),
  otherPieces: z.array(z.enum(PIECE_IDS)).max(PIECES.length).default([]),
  exclude: z.array(z.string().max(120)).max(40).default([]),
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
});
export type Option = z.infer<typeof OptionSchema>;

export const OptionsResultSchema = z.object({
  options: z.array(OptionSchema),
});

// Claude occasionally writes its search reasoning into the name field
// ("Let me check whether..."). Drop any option whose name reads like prose.
const PROSE_OPENER = /^(let me|let's|i'll|i will|i need|i should|i'm|i am|searching|based on|looking|now,? |okay|ok,? |hmm|note:)/i;

export function looksLikeVenueName(name: string) {
  const n = name.trim();
  return n.length > 0 && n.length <= 60 && !/[\r\n]/.test(n) && !PROSE_OPENER.test(n);
}

export function cleanOptions(options: Option[]) {
  return options.filter((o) => {
    if (looksLikeVenueName(o.name)) return true;
    console.warn("[clean] dropped option with a non-name title:", JSON.stringify(o.name.slice(0, 120)));
    return false;
  });
}

// The first search: every selected part of the night in one call.
export const NightRequestSchema = TripSchema.extend({
  pieces: z.array(z.enum(PIECE_IDS)).min(1).max(PIECES.length),
});

export const SectionSchema = z.object({ piece: z.enum(PIECE_IDS), options: z.array(OptionSchema) });

export const NightResultSchema = z.object({
  sections: z.array(SectionSchema),
});

// Lines streamed back by /api/night, one JSON object per line.
export type NightEvent =
  | { type: "search"; query: string }
  | { type: "section"; piece: PieceId; options: Option[] }
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

export const PickSchema = OptionSchema.extend({ piece: z.enum(PIECE_IDS) });
export type Pick = z.infer<typeof PickSchema>;

export const ItineraryRequestSchema = TripSchema.extend({
  picks: z.array(PickSchema).min(1).max(PIECES.length),
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
    price: { type: "string", description: "One of $, $$, $$$, $$$$, or 'Free'" },
    why: { type: "string", description: "One sentence on why it fits this night" },
    tip: { type: "string", description: "Practical tip: reservations, what to order, arrive-by, cover" },
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

export const NIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["piece", "options"],
        properties: {
          piece: { type: "string", enum: PIECE_IDS },
          options: { type: "array", items: OPTION_JSON_SCHEMA },
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
