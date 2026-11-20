import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess, estimatorScope } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";

/** GET /api/inquiries/:id → full detail: contact, consent, appointment, estimate, activity, tasks */
export const GET = route(async (_req, seg) => {
  await ensureBootstrap();
  const { id } = await seg.params;
  const { contractor, user, role } = await requireAccess(null);
  const scope = estimatorScope(role, user.id);
  const inquiry = await db.inquiry.findFirst({
    where: { id, contractorId: contractor.id, ...(scope ?? {}) },
    include: {
      contact: { include: { consent: { orderBy: { recordedAt: "desc" } } } },
      appointments: { orderBy: { createdAt: "desc" } },
      estimates: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { dueAt: "asc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 80 },
      touchpoints: { orderBy: { occurredAt: "desc" } },
      outbox: { orderBy: { scheduledFor: "desc" }, take: 20 },
      payments: { orderBy: { occurredAt: "desc" } },
    },
  });
  if (!inquiry) throw new ApiError(404, "Inquiry not found (or not visible to your role)");
  return json({ inquiry });
});
