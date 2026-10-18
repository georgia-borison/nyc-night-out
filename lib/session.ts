import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";

// Signed-in Google accounts live in one encrypted cookie: nothing is stored on
// the server, and the browser can't read or change what's inside.
export const SESSION_COOKIE = "no_session";
const MAX_AGE = 60 * 60 * 24 * 180;

export type Session = {
  email: string;
  name: string;
  picture?: string;
  /** Lets the server get a fresh Google access token when sending invites. */
  refreshToken: string;
};

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return createHash("sha256").update(secret).digest();
}

/** Encrypts with AES-256-GCM: iv.tag.ciphertext, base64url. */
export function seal(value: unknown): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function unseal<T>(sealed: string | undefined): T | null {
  const k = key();
  if (!k || !sealed) return null;
  try {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null; // tampered, or sealed with an old secret
  }
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function readSession(): Promise<Session | null> {
  return unseal<Session>((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function writeSession(session: Session) {
  const sealed = seal(session);
  if (sealed) (await cookies()).set(SESSION_COOKIE, sealed, cookieOptions(MAX_AGE));
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
