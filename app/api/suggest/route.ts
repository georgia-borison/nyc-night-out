import { askClaude, errorResponse } from "@/lib/claude";
import { suggestPrompt } from "@/lib/prompt";
import { OPTIONS_JSON_SCHEMA, OptionsResultSchema, SuggestRequestSchema } from "@/lib/schema";

export const maxDuration = 300;

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
    return Response.json({ ...data, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
