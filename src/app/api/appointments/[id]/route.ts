import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { onAppointmentRescheduled, onAppointmentStatusChanged } from "@/lib/engine";
import { APPT_STATUSES } from "@/lib/constants";

/** PATCH /api/appointments/:id — reschedule, cancel, complete, no-show */
export const PATCH = route(async (req, seg) => {
  await ensureBootstrap();
  const { id } = await seg.params;
  const body = (await req.json()) as { startAt?: string; status?: string; note?: string };
  const { contractor, user, role } = await requireAccess(null);
  const appt = await db.appointment.findFirst({
    where: { id, contractorId: contractor.id, ...(role === "ESTIMATOR" ? { estimatorId: user.id } : {}) },
    include: { inquiry: true },
  });
  if (!appt) throw new ApiError(404, "Appointment not found (or not visible to your role)");

  if (body.startAt) {
    const startAt = new Date(body.startAt);
    const conflict = await db.appointment.findFirst({
      where: { contractorId: contractor.id, startAt, status: { not: "CANCELED" }, id: { not: appt.id } },
    });
    if (conflict) throw new ApiError(409, "That slot was just taken — here are fresh times");
    await db.appointment.update({
      where: { id: appt.id },
      data: { startAt, endAt: new Date(startAt.getTime() + contractor.slotMinutes * 60000) },
    });
    await onAppointmentRescheduled(appt.id);
    await db.activity.create({
      data: { contractorId: contractor.id, inquiryId: appt.inquiryId, actorType: "STAFF", actorLabel: user.name, kind: "APPOINTMENT", message: `Rescheduled by staff to ${startAt.toISOString()}` },
    });
    return json({ ok: true });
  }

  if (body.status) {
    if (!APPT_STATUSES.includes(body.status as never)) throw new ApiError(400, "Invalid status");
    await db.appointment.update({
      where: { id: appt.id },
      data: { status: body.status, outcomeNote: body.note ?? appt.outcomeNote },
    });
    await onAppointmentStatusChanged(appt.id, body.status, body.note);
    return json({ ok: true });
  }
  throw new ApiError(400, "Nothing to update");
});
