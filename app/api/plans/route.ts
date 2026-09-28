import { SavePlanSchema } from "@/lib/schema";
import { canSave, savePlan } from "@/lib/store";

const MAX_BYTES = 50_000;

export async function POST(request: Request) {
  if (!canSave) {
    return Response.json(
      { error: "Saving isn't set up yet. Add an Upstash Redis database in Vercel (Storage tab)." },
      { status: 503 },
    );
  }
  const text = await request.text();
  if (text.length > MAX_BYTES) {
    return Response.json({ error: "That plan is too large to save." }, { status: 413 });
  }
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const parsed = SavePlanSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid plan." }, { status: 400 });
  }
  try {
    const plan = await savePlan(parsed.data.trip, parsed.data.itinerary);
    return Response.json({ id: plan.id }, { status: 201 });
  } catch (err) {
    console.error("[plans] save failed", err);
    return Response.json({ error: "Couldn't save the plan. Please try again." }, { status: 500 });
  }
}
