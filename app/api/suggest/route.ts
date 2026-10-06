import { errorResponse } from "@/lib/claude";
import { findOptions } from "@/lib/findOptions";
import { SuggestRequestSchema } from "@/lib/schema";
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
    const { options: candidates, costUsd } = await findOptions(parsed.data);
    const vetted = await vetOptions(candidates, parsed.data);
    const { options, note } = choose([vetted]);
    return Response.json({ options, note, costUsd });
  } catch (err) {
    return errorResponse(err);
  }
}
