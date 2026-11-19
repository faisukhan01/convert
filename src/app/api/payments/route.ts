import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";

/**
 * GET  /api/payments — payment ledger: matched, unmatched (review queue), refunds.
 * POST /api/payments — match an unmatched payment to an inquiry (records who confirmed).
 */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const payments = await db.payment.findMany({
    where: { contractorId: contractor.id },
    include: { inquiry: { include: { contact: { select: { firstName: true, lastName: true } } } } },
    orderBy: { occurredAt: "desc" },
  });
  return json({ payments });
});

export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { paymentId?: string; inquiryId?: string };
  const { contractor, user } = await requireAccess(null);
  if (user.role === "ESTIMATOR") throw new ApiError(403, "Requires office or owner role");
  if (!body.paymentId || !body.inquiryId) throw new ApiError(400, "paymentId and inquiryId required");
  const payment = await db.payment.findFirst({ where: { id: body.paymentId, contractorId: contractor.id } });
  if (!payment) throw new ApiError(404, "Payment not found");
  const inquiry = await db.inquiry.findFirst({
    where: { id: body.inquiryId, contractorId: contractor.id },
  });
  if (!inquiry) throw new ApiError(404, "Inquiry not found");
  const now = await demoNow();
  await db.payment.update({
    where: { id: payment.id },
    data: { inquiryId: inquiry.id, status: "SETTLED", matchedByUserId: user.id, matchedAt: now },
  });
  const contact = await db.contact.findUnique({ where: { id: inquiry.contactId } });
  await db.activity.create({
    data: {
      contractorId: contractor.id, inquiryId: inquiry.id, actorType: "STAFF", actorLabel: user.name,
      kind: "PAYMENT",
      message: `${payment.kind === "REFUND" ? "Refund" : "Payment"} $${payment.amount} (${payment.provider} ${payment.providerTxnId}) matched by ${user.name}`,
    },
  });
  await db.touchpoint.create({
    data: {
      contractorId: contractor.id, inquiryId: inquiry.id, kind: "PAYMENT",
      label: `${payment.kind === "REFUND" ? "Refund" : "Payment"} $${payment.amount} matched (${payment.provider})`,
      occurredAt: now,
    },
  });
  void contact;
  return json({ ok: true });
});
