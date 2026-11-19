import { cookies } from "next/headers";
import crypto from "node:crypto";

/**
 * Server-side sessions: HMAC-signed cookie (HttpOnly, SameSite=Lax). Staff auth here is the
 * local demo path with seeded roles; a maintained OIDC provider replaces the login step when
 * OIDC_ISSUER_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET are configured (documented in
 * docs/configuration-inventory.md). Staff authentication and per-contractor GHL authorization
 * are deliberately separate flows.
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

export async function setSessionCookie(p: Omit<SessionPayload, "exp">): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeSession({ ...p, exp: Date.now() + THIRTY_DAYS * 1000 }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
    secure: process.env.NODE_ENV === "production" && process.env.APP_BASE_URL?.startsWith("https"),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decodeSession(store.get(COOKIE_NAME)?.value);
}
