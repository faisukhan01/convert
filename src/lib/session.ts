import { cookies, headers } from "next/headers";
import crypto from "node:crypto";

/**
 * Server-side sessions: HMAC-signed token delivered two ways —
 *   1. HttpOnly cookie (primary), and
 *   2. `Authorization: Bearer <token>` header fallback kept in the SPA's localStorage.
 * The Bearer path is essential when the app is embedded in a cross-site iframe (preview
 * panels) or the browser blocks third-party cookies: the cookie would be dropped there and
 * sign-in would silently bounce back to the sign-in screen. Both channels carry the exact
 * same signed payload, and every server route validates whichever it receives.
 * Staff auth here is the local demo path with seeded roles; a maintained OIDC provider
 * replaces the login step when OIDC_ISSUER_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET are
 * configured (documented in docs/configuration-inventory.md). Staff authentication and
 * per-contractor GHL authorization are deliberately separate flows.
 */

export type SessionPayload = {
  uid: string;
  role: string; // global role: AGENCY_ADMIN | OWNER | OFFICE | ESTIMATOR
  cid: string | null; // current contractor (location) — switched explicitly
  exp: number; // epoch ms
};

const COOKIE_NAME = "ridge_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secret(): string {
  return process.env.SESSION_SECRET || "ridgeline-dev-session-secret";
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function encodeSession(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newSessionToken(p: Omit<SessionPayload, "exp">): string {
  return encodeSession({ ...p, exp: Date.now() + THIRTY_DAYS * 1000 });
}

/**
 * Behind the sandbox gateway the browser-facing request is https while the internal hop is
 * http, so we key off X-Forwarded-Proto: https → SameSite=None; Secure (the only mode that
 * can survive a cross-site iframe at all), plain http → SameSite=Lax (localhost dev).
 */
async function isForwardedHttps(): Promise<boolean> {
  const h = await headers();
  return (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim() === "https";
}

export async function setSessionCookie(p: Omit<SessionPayload, "exp">): Promise<void> {
  const store = await cookies();
  const https = await isForwardedHttps();
  store.set(COOKIE_NAME, newSessionToken(p), {
    httpOnly: true,
    sameSite: https ? "none" : "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
    secure: https,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const fromCookie = decodeSession(store.get(COOKIE_NAME)?.value);
  if (fromCookie) return fromCookie;
  // Bearer fallback — used when the cookie channel is unavailable (cross-site iframe,
  // third-party-cookie blocking). Same strict signature + expiry validation as the cookie.
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return decodeSession(auth.slice(7).trim());
  }
  return null;
}
