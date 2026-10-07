import { askClaude } from "./claude";
import { lookupPlace, placesEnabled, placesFor, type Candidate } from "./places";
import { daysUntil } from "./timing";
import { checkListedSite, cleanUrl, inspectListedSite, linkKindOf, type BookingLink } from "./verifyUrl";
import { CANDIDATES, curatePrompt, searchesFor, sectionPrompt, type SectionRequest } from "./prompt";
import {
  BUDGETS,
  OPTIONS_JSON_SCHEMA,
  OptionsResultSchema,
  PICKS_JSON_SCHEMA,
  PicksResultSchema,
  budgetLevels,
  cleanOptions,
  priceLevel,
  type Option,
  type Reservations,
} from "./schema";
import { SHOW, vetOptions, type Vetted } from "./vetOptions";

/**
 * Ask Claude for one part of the night from memory. Shows and events get a
 * live web search (what's on tonight can't come from memory). Thinking stays
 * on (briefly): without it, Claude mixed up addresses and suggested closed
 * places far more often.
 */
export async function findOptions(
  req: SectionRequest,
  opts: { search?: boolean; onSearch?: (query: string) => void } = {},
): Promise<{ options: Option[]; costUsd: number }> {
  const searches = opts.search === false ? 0 : searchesFor(req.piece);
  const want = CANDIDATES;
  const { data, costUsd } = await askClaude({
    prompt: sectionPrompt(req),
    schema: OptionsResultSchema,
    jsonSchema: OPTIONS_JSON_SCHEMA,
    submitDescription: "Submit the final list of options for this part of the night.",
    webSearch: searches > 0,
    maxSearches: searches,
    // A stuck call shouldn't hold up the whole night.
    timeoutMs: searches > 0 ? 60_000 : 40_000,
    onSearch: opts.onSearch,
    // Events must be confirmed for tonight, so a short list is better than padding it.
    check: (d) =>
      req.piece !== "events" && cleanOptions(d.options).length < SHOW
        ? `Only ${d.options.length} options. Submit again with ${want} real venues, each with just its name in the name field.`
        : null,
  });
  return { options: cleanOptions(data.options), costUsd };
}

/** Claude picks the best of Google's real places for this night and writes them up. */
async function curate(req: SectionRequest, candidates: Candidate[]): Promise<{ vetted: Vetted; costUsd: number }> {
  const need = Math.min(SHOW, candidates.length);
  const { data, costUsd } = await askClaude({
    prompt: curatePrompt(req, candidates),
    schema: PicksResultSchema,
    jsonSchema: PICKS_JSON_SCHEMA,
    submitDescription: "Submit your picks from the list, best first.",
    webSearch: false,
    timeoutMs: 40_000,
    check: (d) => {
      const valid = d.options.filter((o) => candidates[o.number - 1]);
      return valid.length < need
        ? `Pick at least ${need} places, using only numbers from the list (1-${candidates.length}).`
        : null;
    },
  });

  const levels = budgetLevels(req).map((l) => BUDGETS.indexOf(l));
  const [low, high] = [Math.min(...levels), Math.max(...levels)];
  const vetted: Vetted = { near: [], cheaper: [], unplaced: [], far: [], dropped: [] };
  const used = new Set<string>();
  const soon = daysUntil(req.date) <= 1;
  // Check the picked places' websites all at once (cached, so refreshes are instant).
  const sites = new Map(
    data.options.flatMap((p) => {
      const c = candidates[p.number - 1];
      return c ? [[c.id, limited(() => inspectListedSite(c.url, c.name))] as const] : [];
    }),
  );
  for (const pick of data.options) {
    const c = candidates[pick.number - 1];
    if (!c || used.has(c.id)) continue;
    used.add(c.id);
    // Google's prices run low for NYC bars (it calls Raines Law Room $), so use
    // whichever of Google's and Claude's reads is higher.
    const claudeLevel = priceLevel(pick.price);
    const level = c.level === null ? claudeLevel : claudeLevel === null ? c.level : Math.max(c.level, claudeLevel);
    if (level !== null && level > high) {
      vetted.dropped.push({ name: c.name, reason: "over budget" });
      continue;
    }
    // Tonight or tomorrow, a place that books up weeks ahead won't have a table.
    if (pick.booking === "reservations_essential" && soon) {
      vetted.dropped.push({ name: c.name, reason: "hard to book" });
      continue;
    }
    const site = await sites.get(c.id)!;
    const option: Option = {
      name: c.name,
      category: pick.category,
      neighborhood: req.area,
      address: c.address,
      price: level === null ? "" : BUDGETS[level],
      why: pick.why,
      tip: pick.tip,
      when: pick.when || c.hours,
      ...(await linkFor(c, Promise.resolve(site.ok))),
      lat: c.lat,
      lng: c.lng,
      reservations: reservationsFor(pick, c, site.booking),
    };
    if (c.far) vetted.far.push(option);
    else if (level !== null && level < low) vetted.cheaper.push(option);
    else vetted.near.push(option);
  }
  return { vetted, costUsd };
}

/**
 * How a place takes guests, from three sources: a booking link or widget on
 * its own website (most reliable), Google's "takes reservations", and what
 * Claude knows (walk-in only, or hard to get). Only the website says where to
 * book: Claude's guesses at the platform were often wrong (Fig. 19 isn't
 * findable on Resy by name).
 */
function reservationsFor(
  pick: { booking: "walk_in_only" | "reservations_recommended" | "reservations_essential" | "either" },
  c: Candidate,
  site: BookingLink | undefined,
): Reservations | undefined {
  const platform = site?.platform;
  const takesBookings = !!site || c.reservable === true || pick.booking !== "walk_in_only";
  if (!takesBookings) return { policy: "walk_in" };
  // Claude says walk-in only, but the site or Google shows bookings: both work.
  const policy = pick.booking === "either" || pick.booking === "walk_in_only" ? "both" : "reservations";
  return {
    policy,
    ...(platform ? { platform } : {}),
    ...(site?.url ? { url: site.url } : {}),
    ...(pick.booking === "reservations_essential" ? { bookAhead: true } : {}),
  };
}

// At most this many website checks at once.
const CHECKS_AT_ONCE = 8;
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= CHECKS_AT_ONCE) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** The link to show: the venue's own site if it checks out, otherwise its Google Maps page. */
async function linkFor(c: Candidate, siteOk: Promise<boolean>): Promise<Pick<Option, "url" | "linkKind">> {
  if (c.url && (await siteOk)) return { url: cleanUrl(c.url), linkKind: linkKindOf(c.url) };
  if (c.mapsUrl) return { url: cleanUrl(c.mapsUrl), linkKind: "maps" };
  return { url: "" };
}

/**
 * Claude's own suggestions (the backup path) checked against Google: a place
 * Google doesn't have as operating is dropped (Mother of Pearl has closed), and
 * one it does have gets Google's address, location and a checked link.
 */
async function confirmOnGoogle(options: Option[], req: SectionRequest): Promise<Vetted> {
  const looked = await Promise.all(options.map((o) => lookupPlace(o.name, o.address, req.piece, req.date)));
  const confirmed: Option[] = [];
  const unknown: Option[] = [];
  const dropped: Vetted["dropped"] = [];
  await Promise.all(
    options.map(async (o, i) => {
      const c = looked[i];
      if (c === null) {
        dropped.push({ name: o.name, reason: "not on Google" });
        return;
      }
      if (c === undefined) {
        unknown.push(o);
        return;
      }
      const link = await linkFor(c, limited(() => checkListedSite(c.url, c.name)));
      confirmed[i] = { ...o, name: c.name, address: c.address, lat: c.lat, lng: c.lng, ...link };
    }),
  );
  const [a, b] = await Promise.all([
    vetOptions(confirmed.filter(Boolean), req, { preVerified: true }),
    vetOptions(unknown, req),
  ]);
  return {
    near: [...a.near, ...b.near],
    cheaper: [...a.cheaper, ...b.cheaper],
    unplaced: [...a.unplaced, ...b.unplaced],
    far: [...a.far, ...b.far],
    dropped: [...dropped, ...a.dropped, ...b.dropped],
  };
}

/**
 * Options for one part of the night, checked and sorted for choose(). With a
 * Google Places key, they're real places Claude chose from; otherwise (and
 * always for events) Claude suggests them and the app vets each one.
 */
export async function findSection(
  req: SectionRequest,
  opts: { search?: boolean; onSearch?: (query: string) => void } = {},
): Promise<{ vetted: Vetted; costUsd: number; source: "places" | "claude"; candidates: number }> {
  if (placesEnabled() && req.piece !== "events") {
    const candidates = await placesFor(req.piece, req, req.exclude);
    // Prefer places inside the area; keep a few outside ones as fallbacks.
    const pool = [...candidates.filter((c) => !c.far), ...candidates.filter((c) => c.far)].slice(0, 30);
    if (pool.length) {
      const { vetted, costUsd } = await curate(req, pool);
      return { vetted, costUsd, source: "places", candidates: pool.length };
    }
    console.warn(`[places] nothing found for ${req.piece} in ${req.area}; asking Claude instead`);
  }
  const found = await findOptions(req, opts);
  // Events are one-off happenings Google doesn't list, so only venues are confirmed there.
  const vetted =
    placesEnabled() && req.piece !== "events" ? await confirmOnGoogle(found.options, req) : await vetOptions(found.options, req);
  return { vetted, costUsd: found.costUsd, source: "claude", candidates: found.options.length };
}
