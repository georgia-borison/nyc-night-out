import { SavePlanSchema } from "@/lib/schema";
import { listPlans, savePlan } from "@/lib/store";

export async function GET() {
  return Response.json(await listPlans());
}

export async function POST(request: Request) {
  const parsed = SavePlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid plan." }, { status: 400 });
  }
  const plan = await savePlan(parsed.data.trip, parsed.data.itinerary);
  return Response.json(plan, { status: 201 });
}
