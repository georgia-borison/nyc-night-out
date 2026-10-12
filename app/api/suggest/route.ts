import { errorResponse } from "@/lib/claude";
import { findSection } from "@/lib/findOptions";
import { BUDGETS, SuggestRequestSchema, budgetLevels } from "@/lib/schema";
import { choose } from "@/lib/vetOptions";

export const maxDuration = 300;

// Refreshes one part of the night ("Show different options" / "More like this").
// Options come from the same source and checks as the first search.
export async function POST(request: Request) {
  const parsed = SuggestRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { vetted, costUsd, source, candidates } = await findSection(parsed.data);
    const levels = budgetLevels(parsed.data).map((l) => BUDGETS.indexOf(l));
    const { options, note } = choose([vetted], new Set(), levels);
    const dropped = vetted.dropped.map((d) => `${d.name} (${d.reason})`).join(", ");
    console.log(
      `[suggest] ${parsed.data.piece}: ${candidates} candidates from ${source}, ${options.length} kept${dropped ? `; dropped ${dropped}` : ""}`,
    );
    return Response.json({ options, note, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
