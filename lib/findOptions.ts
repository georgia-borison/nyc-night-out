import { askClaude } from "./claude";
import { CANDIDATES, searchesFor, sectionPrompt, type SectionRequest } from "./prompt";
import { OPTIONS_JSON_SCHEMA, OptionsResultSchema, cleanOptions, type Option } from "./schema";
import { SHOW } from "./vetOptions";

/**
 * Ask Claude for one part of the night. Shows and events get a live web
 * search (what's on tonight can't come from memory); restaurants and bars
 * come from what Claude knows, without thinking, which is much faster. The
 * vetting that follows catches closed or made-up places either way.
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
    think: searches > 0,
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
