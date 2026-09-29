import { askClaude, errorResponse } from "@/lib/claude";
import { suggestPrompt } from "@/lib/prompt";
import { OPTIONS_JSON_SCHEMA, OptionsResultSchema, SuggestRequestSchema, cleanOptions } from "@/lib/schema";
import { choose, vetOptions } from "@/lib/vetOptions";

export const maxDuration = 300;

// Refreshes one part of the night ("Show different options" / "More like this").
// Options are vetted the same way as the first search before they're returned.
export async function POST(request: Request) {
  const parsed = SuggestRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { data, costUsd } = await askClaude({
      prompt: suggestPrompt(parsed.data),
      schema: OptionsResultSchema,
      jsonSchema: OPTIONS_JSON_SCHEMA,
      submitDescription: "Submit the final list of options for this part of the night.",
      webSearch: true,
      // Refreshes lean on what Claude knows; one search to catch anything new.
      maxSearches: 1,
    });
    const vetted = await vetOptions(cleanOptions(data.options), parsed.data.area, parsed.data.rides);
    const { options, note } = choose([vetted]);
    return Response.json({ options, note, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
