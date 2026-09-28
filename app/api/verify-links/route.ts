import { VerifyLinksRequestSchema } from "@/lib/schema";
import { locateAll } from "@/lib/geocode";
import { checkLinks } from "@/lib/verifyUrl";

// Checks option websites and finds them on the map after they're already on
// screen (used for section refreshes; the first search streams these itself).
export async function POST(request: Request) {
  const parsed = VerifyLinksRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { items, area } = parsed.data;
  const [links, coords] = await Promise.all([checkLinks(items, area), locateAll(items, area)]);
  return Response.json({ ...links, coords });
}
