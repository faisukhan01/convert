import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";

/** GET /api/outbox — the simulated provider delivery log (scheduled, sent, stopped) */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const now = await demoNow();
  const messages = await db.outboxMessage.findMany({
    where: { contractorId: contractor.id },
    include: { contact: { select: { firstName: true, lastName: true, phone: true, email: true } }, inquiry: { select: { id: true, publicToken: true } } },
    orderBy: { scheduledFor: "desc" },
    take: 120,
  });
  const [scheduled, sent, canceled, failed] = await Promise.all([
    db.outboxMessage.count({ where: { contractorId: contractor.id, status: "SCHEDULED" } }),
    db.outboxMessage.count({ where: { contractorId: contractor.id, status: "SENT" } }),
    db.outboxMessage.count({ where: { contractorId: contractor.id, status: "CANCELED" } }),
    db.outboxMessage.count({ where: { contractorId: contractor.id, status: "FAILED" } }),
  ]);
  return json({ messages, counts: { scheduled, sent, canceled, failed }, now: now.toISOString() });
});
