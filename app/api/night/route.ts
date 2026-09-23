import { askClaude, errorResponse } from "@/lib/claude";
import { nightPrompt } from "@/lib/prompt";
import { NIGHT_JSON_SCHEMA, NightRequestSchema, NightResultSchema } from "@/lib/schema";

export const maxDuration = 300;

// The first search: all selected parts of the night in one call, sharing a
// small search budget. Much cheaper than one call per part.
export async function POST(request: Request) {
  const parsed = NightRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { pieces, ...trip } = parsed.data;
  try {
    const { data, costUsd } = await askClaude({
      prompt: nightPrompt(trip, pieces),
      schema: NightResultSchema,
      jsonSchema: NIGHT_JSON_SCHEMA,
      submitDescription: "Submit the options for every part of the night.",
      webSearch: true,
      // Events can't come from memory, so they get one extra search.
      maxSearches: pieces.includes("events") ? 4 : 3,
    });
    return Response.json({ ...data, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
