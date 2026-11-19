import { db } from "@/lib/db";
import { json, route, ApiError } from "@/lib/api";
import { setSessionCookie, clearSessionCookie, readSession, newSessionToken } from "@/lib/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { DEMO_PASSWORD } from "@/lib/constants";

/**
 * GET    /api/session → current user, memberships, contractors
 * POST   /api/session → local demo sign-in {email, password} → {ok, token}
 * PATCH  /api/session → switch current location {contractorId} → {ok, token}
 * DELETE /api/session → sign out
 *
 * `token` is the same signed payload as the cookie; the SPA persists it in localStorage and
 * echoes it as `Authorization: Bearer` so sessions survive cookie-less embedded contexts.
 */
export const GET = route(async () => {
  await ensureBootstrap();
  const session = await readSession();
  if (!session) return json({ user: null });
  const user = await db.user.findUnique({
    where: { id: session.uid },
    include: {
      memberships: { include: { contractor: { select: { id: true, name: true, slug: true, timezone: true, runMode: true, billingStatus: true } } } },
      agency: { select: { id: true, name: true } },
    },
  });
  if (!user) return json({ user: null });
  let contractors: unknown[] = user.memberships.map((m) => m.contractor);
  if (user.role === "AGENCY_ADMIN" && user.agencyId) {
    contractors = await db.contractor.findMany({
      where: { agencyId: user.agencyId! },
      select: { id: true, name: true, slug: true, timezone: true, runMode: true, billingStatus: true },
      orderBy: { name: "asc" },
    });
  }
  return json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, agency: user.agency },
    memberships: user.memberships.map((m) => ({ contractorId: m.contractorId, role: m.role })),
    contractors,
    currentContractorId: session.cid,
  });
});

export const POST = route(async (req: Request) => {
  await ensureBootstrap();
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email) throw new ApiError(400, "Email required");
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) throw new ApiError(401, "No account with that email");
  const expected = user.password || DEMO_PASSWORD;
  if (password && password !== expected) throw new ApiError(401, "Incorrect password");
  const firstMembership = await db.membership.findFirst({ where: { userId: user.id } });
  const payload = { uid: user.id, role: user.role, cid: firstMembership?.contractorId ?? null };
  await setSessionCookie(payload);
  return json({ ok: true, token: newSessionToken(payload) });
});

export const PATCH = route(async (req: Request) => {
  const session = await readSession();
  if (!session) throw new ApiError(401, "Sign in required");
  const { contractorId } = (await req.json()) as { contractorId?: string };
  if (!contractorId) throw new ApiError(400, "contractorId required");
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user) throw new ApiError(401, "Sign in required");
  if (user.role === "AGENCY_ADMIN") {
    const c = await db.contractor.findFirst({ where: { id: contractorId, agencyId: user.agencyId! } });
    if (!c) throw new ApiError(403, "Contractor not in your agency");
  } else {
    const m = await db.membership.findUnique({ where: { userId_contractorId: { userId: user.id, contractorId } } });
    if (!m) throw new ApiError(403, "Not a member of this location");
  }
  const payload = { uid: user.id, role: user.role, cid: contractorId };
  await setSessionCookie(payload);
  return json({ ok: true, token: newSessionToken(payload) });
});

export const DELETE = route(async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
