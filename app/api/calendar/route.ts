import { z } from "zod";
import { planToEvent } from "@/lib/calendarEvent";
import { NOT_SET_UP, freshAccessToken, googleConfig, insertEvent } from "@/lib/google";
import { repairPlan } from "@/lib/repairPlan";
import { clearSession, readSession } from "@/lib/session";
import { getPlan } from "@/lib/store";

const InviteSchema = z.object({
  planId: z.string().regex(/^[a-z0-9]{6,24}$/),
  guests: z.array(z.email().max(254)).min(1).max(20),
  note: z.string().max(500).optional(),
});

/** Puts a saved plan on the signed-in person's Google Calendar, inviting their friends. */
export async function POST(request: Request) {
  if (!googleConfig()) return Response.json({ error: NOT_SET_UP }, { status: 503 });
  const session = await readSession();
  if (!session) return Response.json({ error: "Sign in with Google to send invites.", signIn: true }, { status: 401 });

  const parsed = InviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Check the email addresses (up to 20)." }, { status: 400 });
  }
  const saved = await getPlan(parsed.data.planId);
  if (!saved) return Response.json({ error: "That plan wasn't found." }, { status: 404 });
  const plan = await repairPlan(saved);

  let accessToken: string;
  try {
    accessToken = await freshAccessToken(session.refreshToken);
  } catch {
    // Access was removed in the Google account, or it expired.
    await clearSession();
    return Response.json({ error: "Your Google sign-in expired. Sign in again to send invites.", signIn: true }, { status: 401 });
  }

  const guests = Array.from(new Set(parsed.data.guests.map((g) => g.toLowerCase()))).filter(
    (g) => g !== session.email.toLowerCase(),
  );
  const event = planToEvent(plan, {
    shareUrl: new URL(`/plan/${saved.id}`, request.url).toString(),
    guests,
    note: parsed.data.note,
  });
  try {
    const { link } = await insertEvent(accessToken, event);
    return Response.json({ link, invited: guests.length });
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error("[calendar] insert failed:", (err as Error).message);
    if (status === 401 || status === 403) {
      return Response.json(
        { error: "Google didn't allow adding to your calendar. Sign in again and allow calendar access.", signIn: true },
        { status: 401 },
      );
    }
    return Response.json({ error: "Couldn't add the event to your calendar. Please try again." }, { status: 502 });
  }
}
