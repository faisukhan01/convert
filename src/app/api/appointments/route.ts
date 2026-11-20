import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess, estimatorScope } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";
import { wallToUtc, tzParts } from "@/lib/time";
import { onAppointmentBooked } from "@/lib/engine";
import { randomToken } from "@/lib/crypto";

export type Slot = { start: string; end: string; estimatorId?: string | null };

/** Shared slot computation: Mon–Fri calendar hours, lead time, window, existing bookings excluded. */
export async function computeSlots(contractorId: string, opts?: { excludeInquiryId?: string }): Promise<Slot[]> {
  const contractor = await db.contractor.findUnique({ where: { id: contractorId } });
  if (!contractor) throw new ApiError(404, "Contractor not found");
  const now = await demoNow();
  const estimators = await db.membership.findMany({
    where: { contractorId, role: "ESTIMATOR", isActive: true },
    select: { userId: true },
  });

  const booked = await db.appointment.findMany({
    where: {
      contractorId,
      status: { not: "CANCELED" },
      startAt: { gte: now, lte: new Date(now.getTime() + contractor.bookingWindowDays * 86400000) },
      ...(opts?.excludeInquiryId ? { inquiryId: { not: opts.excludeInquiryId } } : {}),
    },
    select: { startAt: true },
  });
  const takenSet = new Set(booked.map((b) => b.startAt.getTime()));
  const busy = (await import("@/lib/providers")).getAdapter(contractor.runMode, {});
  const providerBusy = await busy.busySlots(now, new Date(now.getTime() + contractor.bookingWindowDays * 86400000));
  for (const b of providerBusy) takenSet.add(new Date(b.start).getTime());

  const slots: Slot[] = [];
  const leadCutoff = new Date(now.getTime() + contractor.bookingLeadHours * 3600000);
  for (let d = 0; d <= contractor.bookingWindowDays; d++) {
    const probe = new Date(now.getTime() + d * 86400000);
    const p = tzParts(probe, contractor.timezone);
    const dow = p.dow;
    if (dow === "sat" || dow === "sun") continue;
    for (let h = contractor.calendarStartHour; h < contractor.calendarEndHour; h++) {
      const start = wallToUtc(contractor.timezone, p.year, p.month, p.day, h, 0);
      if (start < leadCutoff) continue;
      if (takenSet.has(start.getTime())) continue;
      slots.push({
        start: start.toISOString(),
        end: new Date(start.getTime() + contractor.slotMinutes * 60000).toISOString(),
        estimatorId: estimators.length ? estimators[slots.length % estimators.length].userId : null,
      });
      if (slots.length >= 40) return slots;
    }
  }
  return slots;
}

/** POST /api/appointments — office books an inspection for an inquiry */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { inquiryId?: string; startAt?: string };
  const { contractor, user } = await requireAccess(null);
  if (!body.inquiryId || !body.startAt) throw new ApiError(400, "inquiryId and startAt required");
  const inquiry = await db.inquiry.findFirst({
    where: { id: body.inquiryId, contractorId: contractor.id, ...(user.role === "ESTIMATOR" ? { ownerUserId: user.id } : {}) },
    include: { contact: true },
  });
  if (!inquiry) throw new ApiError(404, "Inquiry not found");
  const startAt = new Date(body.startAt);

  const conflict = await db.appointment.findFirst({
    where: { contractorId: contractor.id, startAt, status: { not: "CANCELED" }, inquiryId: { not: inquiry.id } },
  });
  if (conflict) {
    const freshSlots = await computeSlots(contractor.id);
    throw new ApiError(409, "That slot was just taken — here are fresh times");
  }
  // estimator: keep the slot's suggested estimator or the inquiry owner
  const slots = await computeSlots(contractor.id);
  const suggested = slots.find((s) => s.start === startAt.toISOString());
  const appt = await db.appointment.create({
    data: {
      contractorId: contractor.id, inquiryId: inquiry.id,
      startAt, endAt: new Date(startAt.getTime() + contractor.slotMinutes * 60000),
      timezone: contractor.timezone,
      estimatorId: suggested?.estimatorId ?? inquiry.ownerUserId ?? null,
      status: "BOOKED", bookedBy: "OFFICE",
      manageToken: randomToken(16), manageExpiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  await onAppointmentBooked(appt.id);
  await db.activity.create({
    data: { contractorId: contractor.id, inquiryId: inquiry.id, actorType: "STAFF", actorLabel: user.name, kind: "APPOINTMENT", message: `Inspection booked by office for ${startAt.toISOString()}` },
  });
  return json({ appointment: appt }, 201);
});

/** GET /api/appointments — calendar/agenda data */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const { contractor, user, role } = await requireAccess(url.searchParams.get("contractorId"));
  const now = await demoNow();
  const appointments = await db.appointment.findMany({
    where: {
      contractorId: contractor.id,
      ...(role === "ESTIMATOR" ? { estimatorId: user.id } : {}),
      startAt: {
        gte: from ? new Date(from) : new Date(now.getTime() - 7 * 86400000),
        lte: to ? new Date(to) : new Date(now.getTime() + 21 * 86400000),
      },
    },
    include: { inquiry: { include: { contact: true } } },
    orderBy: { startAt: "asc" },
  });
  return json({ appointments, now: now.toISOString() });
});
