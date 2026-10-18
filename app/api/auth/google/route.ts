import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { GOOGLE_SCOPES, NOT_SET_UP, OAUTH_COOKIE, callbackUrl, googleConfig, safeReturn } from "@/lib/google";
import { cookieOptions, seal } from "@/lib/session";

/** Starts "Sign in with Google": remembers a random state and PKCE verifier, then goes to Google. */
export async function GET(request: Request) {
  const cfg = googleConfig();
  // Not set up yet: go back where they came from rather than show an error page.
  if (!cfg) {
    console.warn("[auth]", NOT_SET_UP);
    return NextResponse.redirect(new URL(safeReturn(new URL(request.url).searchParams.get("return")), request.url));
  }

  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const ret = safeReturn(new URL(request.url).searchParams.get("return"));

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // A refresh token, so invites can be sent later without signing in again.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  }).toString();

  const res = NextResponse.redirect(google);
  res.cookies.set(OAUTH_COOKIE, seal({ state, verifier, ret })!, cookieOptions(10 * 60));
  return res;
}
