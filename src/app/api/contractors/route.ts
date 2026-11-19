import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { BILLING_STATUSES } from "@/lib/constants";

/**
 * GET  /api/contractors — agency tenant list (agency admin) or memberships
 * POST /api/contractors — provision a new contractor location (agency admin only)
 */
export const GET = route(async () => {
  await ensureBootstrap();
  const { user } = await requireAccess(null);
  if (user.role !== "AGENCY_ADMIN") throw new ApiError(403, "Agency admin only");
  const contractors = await db.contractor.findMany({
    where: { agencyId: user.agencyId! },
    include: { memberships: { include: { user: { select: { name: true, email: true } } } }, installs: true },
    orderBy: { createdAt: "asc" },
  });
  return json({
    contractors: contractors.map((c) => ({
      id: c.id, name: c.name, slug: c.slug, timezone: c.timezone,
      billingStatus: c.billingStatus, runMode: c.runMode,
      activatedAt: c.activatedAt?.toISOString() ?? null,
      ghlLocationId: c.ghlLocationId,
      members: c.memberships.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role })),
      ghlStatus: c.installs.find((i) => i.provider === "GHL")?.status ?? "DISCONNECTED",
      inquiryCount: undefined,
    })),
  });
});

export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { name?: string; slug?: string; timezone?: string; city?: string; state?: string; billingStatus?: string };
  const { user } = await requireAccess(null);
  if (user.role !== "AGENCY_ADMIN") throw new ApiError(403, "Agency admin only");
  if (!body.name) throw new ApiError(400, "Business name required");
  const slug = (body.slug ?? body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const exists = await db.contractor.findUnique({ where: { slug } });
  if (exists) throw new ApiError(409, "A location with that slug already exists");
  const contractor = await db.contractor.create({
    data: {
      agencyId: user.agencyId!, name: body.name, slug,
      timezone: body.timezone ?? "America/Chicago",
      city: body.city, state: body.state,
      billingStatus: body.billingStatus && BILLING_STATUSES.includes(body.billingStatus as never) ? body.billingStatus : "trial",
    },
  });
  return json({ contractor }, 201);
});
