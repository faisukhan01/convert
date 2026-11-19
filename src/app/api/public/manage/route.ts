import { db } from "@/lib/db";
import { json, route, ApiError } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { onAppointmentRescheduled, onAppointmentStatusChanged } from "@/lib/engine";
import { demoNow } from "@/lib/democlock";

/**
 * Appointment-scoped, expiring self-serve management link.
 * GET  /api/public/manage?token=… → appointment + estimate outcome
 * POST /api/public/manage {token, action: reschedule|cancel, startAt?}
 */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) throw new ApiError(400, "token required");
  const appt = await db.appointment.findUnique({
    where: { manageToken: token },
    include: {
      inquiry: { include: { contact: true, contractor: true, estimates: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
  if (!appt) throw new ApiError(404, "Management link not found");
  if (appt.manageExpiresAt < new Date()) throw new ApiError(410, "This management link has expired — contact the office");
  const { estimates, ...inquiry } = appt.inquiry;
  void estimates;
  const { computeSlots } = await import("@/app/api/appointments/route");
  const slots = appt.status === "BOOKED" ? await computeSlots(appt.contractorId, { excludeInquiryId: appt.inquiryId }) : [];
  return json({
    appointment: { id: appt.id, startAt: appt.startAt, endAt: appt.endAt, status: appt.status, timezone: appt.timezone },
    contractor: { name: appt.inquiry.contractor.name, timezone: appt.inquiry.contractor.timezone, phone: null },
    contact: { firstName: appt.inquiry.contact.firstName },
    serviceType: appt.inquiry.serviceType,
    slots,
    estimate: appt.inquiry.estimates[0]
      ? { number: appt.inquiry.estimates[0].number, amount: appt.inquiry.estimates[0].amount, currency: appt.inquiry.estimates[0].currency, status: appt.inquiry.estimates[0].status }
      : null,
    now: (await demoNow()).toISOString(),
  });
});

export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { token?: string; action?: "reschedule" | "cancel"; startAt?: string };
  if (!body.token || !body.action) throw new ApiError(400, "token and action required");
  const appt = await db.appointment.findUnique({
    where: { manageToken: body.token },
    include: { inquiry: { include: { contact: true, contractor: true } } },
  });
  if (!appt) throw new ApiError(404, "Management link not found");
  if (appt.manageExpiresAt < new Date()) throw new ApiError(410, "This management link has expired — contact the office");
  if (!["BOOKED", "COMPLETED", "NO_SHOW"].includes(appt.status)) {
    throw new ApiError(409, "This appointment is no longer active");
  }

  if (body.action === "cancel") {
    await db.appointment.update({ where: { id: appt.id }, data: { status: "CANCELED" } });
    await onAppointmentStatusChanged(appt.id, "CANCELED");
    return json({ ok: true, canceled: true });
  }
  // reschedule
  if (!body.startAt) throw new ApiError(400, "startAt required for reschedule");
  const startAt = new Date(body.startAt);
  const conflict = await db.appointment.findFirst({
    where: { contractorId: appt.contractorId, startAt, status: { not: "CANCELED" }, id: { not: appt.id } },
  });
  if (conflict) {
    const { computeSlots } = await import("@/app/api/appointments/route");
    const slots = await computeSlots(appt.contractorId, { excludeInquiryId: appt.inquiryId });
    return json({ error: "Sorry — that time was just taken. Here are fresh choices.", slots, conflict: true }, 409);
  }
  await db.appointment.update({
    where: { id: appt.id },
    data: { startAt, endAt: new Date(startAt.getTime() + appt.inquiry.contractor.slotMinutes * 60000), status: "BOOKED" },
  });
  await onAppointmentRescheduled(appt.id);
  return json({ ok: true, rescheduled: true, startAt: startAt.toISOString() });
});
