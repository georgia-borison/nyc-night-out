// Google sign-in (OAuth 2.0 with PKCE) and the one Calendar call the app makes.

/** Holds the sign-in state and PKCE verifier for the 10 minutes a sign-in takes. */
export const OAUTH_COOKIE = "no_oauth";

export const GOOGLE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar.events"];
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret && process.env.AUTH_SECRET ? { clientId, clientSecret } : null;
}

export const NOT_SET_UP = "Google sign-in isn't set up yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET.";

/** Where Google sends people back to; must match a redirect URI on the OAuth client. */
export function callbackUrl(request: Request) {
  return new URL("/api/auth/google/callback", request.url).toString();
}

/** Only paths on this site, so sign-in can't be used to bounce people elsewhere. */
export function safeReturn(path: string | null | undefined) {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

type TokenResponse = { access_token: string; refresh_token?: string; id_token?: string; scope?: string; error?: string };

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) throw new Error(data.error ?? `Google token request failed (${res.status})`);
  return data;
}

export function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const cfg = googleConfig()!;
  return tokenRequest({
    code,
    code_verifier: verifier,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function freshAccessToken(refreshToken: string) {
  const cfg = googleConfig()!;
  const data = await tokenRequest({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  return data.access_token;
}

/** The profile in the id_token. It came straight from Google's token endpoint over TLS, so it isn't re-verified. */
export function profileFromIdToken(idToken: string) {
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return payload;
}

export type CalendarEvent = {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: { email: string }[];
};

/** Adds the event to the signed-in person's calendar; Google emails each guest an invite. */
export async function insertEvent(accessToken: string, event: CalendarEvent) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...event, guestsCanSeeOtherGuests: true, reminders: { useDefault: true } }),
  });
  const data = (await res.json().catch(() => ({}))) as { htmlLink?: string; error?: { message?: string } };
  if (!res.ok) throw Object.assign(new Error(data.error?.message ?? `Calendar request failed (${res.status})`), { status: res.status });
  return { link: data.htmlLink ?? null };
}
