import { NextResponse, type NextRequest } from "next/server";
import { NOT_SET_UP, OAUTH_COOKIE, callbackUrl, exchangeCode, googleConfig, profileFromIdToken, safeReturn } from "@/lib/google";
import { SESSION_COOKIE, cookieOptions, seal, unseal } from "@/lib/session";

const SESSION_MAX_AGE = 60 * 60 * 24 * 180;

/** Google sends people back here: check the state, swap the code for tokens, and sign them in. */
export async function GET(request: NextRequest) {
  if (!googleConfig()) return Response.json({ error: NOT_SET_UP }, { status: 503 });

  const params = request.nextUrl.searchParams;
  const saved = unseal<{ state: string; verifier: string; ret: string }>(request.cookies.get(OAUTH_COOKIE)?.value);
  const ret = safeReturn(saved?.ret);
  const back = (failed: boolean) => {
    const url = new URL(ret, request.url);
    if (failed) url.searchParams.set("signin", "failed");
    const res = NextResponse.redirect(url);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) return back(true);

  try {
    const tokens = await exchangeCode(code, saved.verifier, callbackUrl(request));
    const profile = tokens.id_token ? profileFromIdToken(tokens.id_token) : {};
    if (!tokens.refresh_token || !profile.email) return back(true);
    const sealed = seal({
      email: profile.email,
      name: profile.name ?? profile.email,
      picture: profile.picture,
      refreshToken: tokens.refresh_token,
    });
    const res = back(false);
    if (sealed) res.cookies.set(SESSION_COOKIE, sealed, cookieOptions(SESSION_MAX_AGE));
    return res;
  } catch (err) {
    console.error("[auth] Google sign-in failed:", (err as Error).message);
    return back(true);
  }
}
