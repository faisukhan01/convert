import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";

/**
 * GET   /api/contractors/:id — full settings for one location
 * PATCH /api/contractors/:id — settings, playbooks, hours, billing, onboarding progress
 */
export const GET = route(async (_req, seg) => {
  await ensureBootstrap();
  const { id } = await seg.params;
  const { contractor, role } = await requireAccess(id);
  const team = await db.membership.findMany({
    where: { contractorId: contractor.id, isActive: true },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  const install = await db.providerInstall.findUnique({
    where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } },
  });
  return json({
    contractor: {
      id: contractor.id, name: contractor.name, slug: contractor.slug, timezone: contractor.timezone,
      addressLine1: contractor.addressLine1, city: contractor.city, state: contractor.state,
      serviceZips: contractor.serviceZips, preferredChannels: contractor.preferredChannels,
      billingStatus: contractor.billingStatus, runMode: contractor.runMode,
      activatedAt: contractor.activatedAt?.toISOString() ?? null,
      calendarStartHour: contractor.calendarStartHour, calendarEndHour: contractor.calendarEndHour,
      slotMinutes: contractor.slotMinutes, bookingLeadHours: contractor.bookingLeadHours,
      bookingWindowDays: contractor.bookingWindowDays, estimateFollowUpDays: contractor.estimateFollowUpDays,
      callbackDueHours: contractor.callbackDueHours, reminderHoursBefore: contractor.reminderHoursBefore,
      pbNewInquiry: contractor.pbNewInquiry, pbMissedCall: contractor.pbMissedCall,
      pbReminder: contractor.pbReminder, pbNoShow: contractor.pbNoShow,
      pbEstimateFollowUp: contractor.pbEstimateFollowUp, pbMorningDigest: contractor.pbMorningDigest,
      workingHours: contractor.workingHours,
    },
    team: team.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
    ghlInstall: install
      ? { status: install.status, locationId: install.locationId, scopes: install.scopes, lastCheckedAt: install.lastCheckedAt?.toISOString() ?? null }
      : null,
    myRole: role,
  });
});

export const PATCH = route(async (req, seg) => {
  await ensureBootstrap();
  const { id } = await seg.params;
  const body = (await req.json()) as Record<string, unknown>;
  const { contractor, role, user } = await requireAccess(id);
  if (role === "ESTIMATOR") throw new ApiError(403, "Requires office or owner role");

  const allowed: Record<string, unknown> = {};
  const strFields = ["name", "timezone", "addressLine1", "city", "state", "serviceZips", "preferredChannels", "estimateFollowUpDays", "workingHours"];
  for (const f of strFields) if (typeof body[f] === "string") allowed[f] = body[f];
  const intFields = ["calendarStartHour", "calendarEndHour", "slotMinutes", "bookingLeadHours", "bookingWindowDays", "callbackDueHours", "reminderHoursBefore"];
  for (const f of intFields) if (typeof body[f] === "number") allowed[f] = Math.round(body[f] as number);
  const boolFields = ["pbNewInquiry", "pbMissedCall", "pbReminder", "pbNoShow", "pbEstimateFollowUp", "pbMorningDigest"];
  for (const f of boolFields) if (typeof body[f] === "boolean") allowed[f] = body[f];

  const prev = contractor;
  const updated = await db.contractor.update({ where: { id: contractor.id }, data: allowed });

  const changes: string[] = [];
  for (const k of Object.keys(allowed)) {
    if (JSON.stringify((prev as Record<string, unknown>)[k]) !== JSON.stringify((updated as Record<string, unknown>)[k])) changes.push(k);
  }
  if (changes.length) {
    await db.auditEvent.create({
      data: {
        contractorId: contractor.id, userId: user.id, action: "SETTINGS_UPDATE",
        entity: "contractor", entityId: contractor.id,
        meta: JSON.stringify({ fields: changes, by: user.name, role }),
      },
    });
  }
  return json({ ok: true, changed: changes });
});
