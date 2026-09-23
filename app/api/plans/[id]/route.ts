import type { NextRequest } from "next/server";
import { deletePlan, getPlan } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/plans/[id]">) {
  const { id } = await ctx.params;
  const plan = await getPlan(id);
  if (!plan) return Response.json({ error: "Plan not found." }, { status: 404 });
  return Response.json(plan);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/plans/[id]">) {
  const { id } = await ctx.params;
  if (!(await deletePlan(id))) return Response.json({ error: "Plan not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
