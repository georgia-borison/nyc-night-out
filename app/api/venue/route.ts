import { z } from "zod";
import { areaForPoint } from "@/lib/areaShape";
import { findVenues, placesEnabled } from "@/lib/places";
import { checkListedSite, cleanUrl, linkKindOf } from "@/lib/verifyUrl";

const RequestSchema = z.object({ query: z.string().trim().min(2).max(120) });

// Finds the place someone already has booked, so the rest of the night can be
// planned around it. Returns a few matches to choose from (chains have several
// branches), each with the neighborhood it's in.
export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Type at least two letters." }, { status: 400 });
  if (!placesEnabled()) return Response.json({ error: "Looking up places isn't set up yet." }, { status: 503 });

  const matches = await findVenues(parsed.data.query);
  // Same link rule as the options: the venue's own site if it checks out, else its Google Maps page.
  const sitesOk = await Promise.all(matches.map((v) => checkListedSite(v.url, v.name)));
  return Response.json({
    venues: matches.map((v, i) => {
      const site = sitesOk[i];
      return {
        ...v,
        url: site ? cleanUrl(v.url) : v.mapsUrl ? cleanUrl(v.mapsUrl) : "",
        linkKind: site ? linkKindOf(v.url) : "maps",
        areas: { walk: areaForPoint(v, false), ride: areaForPoint(v, true) },
      };
    }),
  });
}
