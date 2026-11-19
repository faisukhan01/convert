import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";

/** GET /api/reports/drilldown?metric=booking|attendance|acceptance|revenue|unmatched — records behind each number */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") ?? "booking";
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10)));
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const now = await demoNow();
  const start = new Date(now.getTime() - days * 86400000);
  const matureCutoff = new Date(now.getTime() - 14 * 86400000);

  if (metric === "booking") {
    const inquiries = await db.inquiry.findMany({
      where: { contractorId: contractor.id, isTest: false, isDuplicate: false, createdAt: { gte: start, lte: now } },
      include: { appointments: { orderBy: { createdAt: "asc" } }, contact: true },
      orderBy: { createdAt: "desc" },
    });
    return json({
      rows: inquiries.map((i) => ({
        id: i.id, name: `${i.contact.firstName} ${i.contact.lastName}`.trim(),
        createdAt: i.createdAt, mature: i.createdAt <= matureCutoff,
        booked: i.appointments.some((a) => a.createdAt.getTime() <= i.createdAt.getTime() + 14 * 86400000),
        firstBookingAt: i.appointments[0]?.createdAt ?? null,
        stage: i.stage,
      })),
    });
  }
  if (metric === "attendance") {
    const appts = await db.appointment.findMany({
      where: { contractorId: contractor.id, startAt: { gte: start, lte: now } },
      include: { inquiry: { include: { contact: true } } },
      orderBy: { startAt: "desc" },
    });
    return json({
      rows: appts.map((a) => ({
        id: a.id, name: `${a.inquiry.contact.firstName} ${a.inquiry.contact.lastName}`.trim(),
        startAt: a.startAt, status: a.status, outcomeNote: a.outcomeNote,
        estimatorId: a.estimatorId,
      })),
    });
  }
  if (metric === "acceptance") {
    const estimates = await db.estimate.findMany({
      where: { contractorId: contractor.id, sentAt: { not: null, gte: start, lte: now } },
      include: { inquiry: { include: { contact: true } } },
      orderBy: { sentAt: "desc" },
    });
    return json({
      rows: estimates.map((e) => ({
        id: e.id, number: e.number, name: `${e.inquiry.contact.firstName} ${e.inquiry.contact.lastName}`.trim(),
        amount: e.amount, currency: e.currency, status: e.status,
        sentAt: e.sentAt, acceptedAt: e.acceptedAt, decidedAt: e.decidedAt,
      })),
    });
  }
  if (metric === "revenue" || metric === "unmatched") {
    const payments = await db.payment.findMany({
      where: metric === "revenue"
        ? { contractorId: contractor.id, status: "SETTLED", occurredAt: { gte: start, lte: now } }
        : { contractorId: contractor.id, status: "UNMATCHED" },
      include: { inquiry: { include: { contact: true } } },
      orderBy: { occurredAt: "desc" },
    });
    return json({
      rows: payments.map((p) => ({
        id: p.id, provider: p.provider, providerTxnId: p.providerTxnId,
        kind: p.kind, amount: p.amount, currency: p.currency,
        occurredAt: p.occurredAt, status: p.status,
        inquiry: p.inquiry ? `${p.inquiry.contact.firstName} ${p.inquiry.contact.lastName}`.trim() : null,
        note: p.note,
      })),
    });
  }
  throw new ApiError(400, "Unknown metric");
});
