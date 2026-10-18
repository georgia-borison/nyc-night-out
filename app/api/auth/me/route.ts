import { googleConfig } from "@/lib/google";
import { readSession } from "@/lib/session";

/** Who's signed in (never the tokens), and whether sign-in is available at all. */
export async function GET() {
  const session = await readSession();
  return Response.json({
    enabled: Boolean(googleConfig()),
    user: session
      ? { email: session.email, name: session.name, picture: session.picture, calendar: session.calendar !== false }
      : null,
  });
}
