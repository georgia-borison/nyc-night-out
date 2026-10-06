import { askClaude } from "./claude";
import { placesEnabled, placesFor, type Candidate } from "./places";
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
    const option: Option = {
      name: c.name,
      category: pick.category,
      neighborhood: req.area,
      address: c.address,
      price: level === null ? "" : BUDGETS[level],
      why: pick.why,
      tip: pick.tip,
      when: pick.when || c.hours,
      url: c.url,
      lat: c.lat,
      lng: c.lng,
    };
    if (c.far) vetted.far.push(option);
    else if (level !== null && level < low) vetted.cheaper.push(option);
    else vetted.near.push(option);
  }
  return { vetted, costUsd };
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
  const vetted = await vetOptions(found.options, req);
  return { vetted, costUsd: found.costUsd, source: "claude", candidates: found.options.length };
}
