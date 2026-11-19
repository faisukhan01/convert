import { db } from "@/lib/db";
import { json, route, ApiError } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { computeSlots } from "@/app/api/appointments/route";
import { onAppointmentBooked } from "@/lib/engine";
import { randomToken } from "@/lib/crypto";
import { demoNow } from "@/lib/democlock";

/**
 * Public booking flow (hosted booking link / form embed fallback).
 * GET  /api/public/booking?token=… → context + slots
 * POST /api/public/booking {token, startAt} → book; on a lost race returns 409 with fresh slots
 */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) throw new ApiError(400, "token required");
  const inquiry = await db.inquiry.findUnique({
    where: { publicToken: token },
    include: { contact: true, contractor: true, appointments: { orderBy: { createdAt: "desc" } } },
  });
  if (!inquiry) throw new ApiError(404, "Booking link not found or expired");
  const activeAppt = inquiry.appointments.find((a) => a.status === "BOOKED");
  if (activeAppt) {
    return json({
      contractor: { name: inquiry.contractor.name, timezone: inquiry.contractor.timezone, city: inquiry.contractor.city },
      contact: { firstName: inquiry.contact.firstName },
      serviceType: inquiry.serviceType,
      alreadyBooked: true,
      appointment: { id: activeAppt.id, startAt: activeAppt.startAt, manageToken: activeAppt.manageToken, status: activeAppt.status },
      slots: [],
    });
  }
  const slots = await computeSlots(inquiry.contractorId, { excludeInquiryId: inquiry.id });
  return json({
    contractor: { name: inquiry.contractor.name, timezone: inquiry.contractor.timezone, city: inquiry.contractor.city },
    contact: { firstName: inquiry.contact.firstName },
    serviceType: inquiry.serviceType,
    alreadyBooked: false,
    appointment: null,
    slots,
  });
});

export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { token?: string; startAt?: string };
  if (!body.token || !body.startAt) throw new ApiError(400, "token and startAt required");
  const inquiry = await db.inquiry.findUnique({
    where: { publicToken: body.token },
    include: { contact: true, contractor: true },
  });
  if (!inquiry) throw new ApiError(404, "Booking link not found or expired");
  const existing = await db.appointment.findFirst({
    where: { inquiryId: inquiry.id, status: { in: ["BOOKED", "COMPLETED"] } },
  });
  if (existing) throw new ApiError(409, "You already have an inspection booked — use your management link to change it");

  const startAt = new Date(body.startAt);
  const now = await demoNow();
  if (startAt < now) throw new ApiError(400, "That time has passed — choose a fresh time");

  // Contention: two customers contending for the same remaining slot — the second gets 409 + fresh times.
  const conflict = await db.appointment.findFirst({
    where: { contractorId: inquiry.contractorId, startAt, status: { not: "CANCELED" } },
  });
  if (conflict) {
    const slots = await computeSlots(inquiry.contractorId, { excludeInquiryId: inquiry.id });
    return json({ error: "Sorry — that time was just taken. Here are fresh choices.", slots, conflict: true }, 409);
  }

  const contractor = inquiry.contractor;
  const slots = await computeSlots(contractor.id, { excludeInquiryId: inquiry.id });
  const suggested = slots.find((s) => s.start === startAt.toISOString());
  const appt = await db.appointment.create({
    data: {
      contractorId: contractor.id, inquiryId: inquiry.id,
      startAt, endAt: new Date(startAt.getTime() + contractor.slotMinutes * 60000),
      timezone: contractor.timezone,
      estimatorId: suggested?.estimatorId ?? null,
      status: "BOOKED", bookedBy: "CUSTOMER",
      manageToken: randomToken(16), manageExpiresAt: new Date(now.getTime() + 30 * 86400000),
    },
  });
  await onAppointmentBooked(appt.id);
  await db.activity.create({
    data: {
      contractorId: contractor.id, inquiryId: inquiry.id,
      actorType: "CUSTOMER", actorLabel: `${inquiry.contact.firstName} (self-booking)`,
      kind: "APPOINTMENT", message: `Inspection booked via hosted link for ${startAt.toISOString()}`,
    },
  });
  return json({
    ok: true,
    appointment: { id: appt.id, startAt: appt.startAt, manageToken: appt.manageToken },
    contractor: { name: contractor.name, timezone: contractor.timezone, address: contractor.addressLine1 },
  }, 201);
});
