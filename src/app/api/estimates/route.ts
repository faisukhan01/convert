import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess, estimatorScope } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";
import { onEstimateSent, onEstimateStatusChanged, cancelEstimateNudges } from "@/lib/engine";
import { ESTIMATE_STATUSES } from "@/lib/constants";

/** GET /api/estimates — aging list with amount, age, status, owner, next action */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor, user, role } = await requireAccess(url.searchParams.get("contractorId"));
  const scope = estimatorScope(role, user.id);
  const estimates = await db.estimate.findMany({
    where: { contractorId: contractor.id, ...(scope ?? {}) },
    include: { inquiry: { include: { contact: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const now = await demoNow();
  return json({ estimates, now: now.toISOString() });
});

/** POST /api/estimates — create a draft (office) */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { inquiryId?: string; amount?: number; currency?: string };
  const { contractor, user } = await requireAccess(null);
  if (user.role === "ESTIMATOR") throw new ApiError(403, "Requires office or owner role");
  if (!body.inquiryId || body.amount === undefined) throw new ApiError(400, "inquiryId and amount required");
  const inquiry = await db.inquiry.findFirst({ where: { id: body.inquiryId, contractorId: contractor.id } });
  if (!inquiry) throw new ApiError(404, "Inquiry not found");
  const count = await db.estimate.count({ where: { contractorId: contractor.id } });
  const est = await db.estimate.create({
    data: {
      contractorId: contractor.id, inquiryId: inquiry.id,
      number: `E-${1047 + count}`,
      amount: body.amount.toString(), currency: body.currency ?? "USD",
      status: "DRAFT", ownerUserId: user.id,
    },
  });
  await db.activity.create({
    data: { contractorId: contractor.id, inquiryId: inquiry.id, actorType: "STAFF", actorLabel: user.name, kind: "ESTIMATE", message: `Draft estimate ${est.number} created ($${body.amount})` },
  });
  return json({ estimate: est }, 201);
});

/** PATCH /api/estimates?id= — send / status transitions / pause chase / amount */
export const PATCH = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id required");
  const body = (await req.json()) as { status?: string; amount?: number; reason?: string; pauseChase?: boolean };
  const { contractor, user, role } = await requireAccess(null);
  const est = await db.estimate.findFirst({
    where: { id, contractorId: contractor.id, ...(role === "ESTIMATOR" ? { inquiry: { ownerUserId: user.id } } : {}) },
    include: { inquiry: { include: { contact: true } } },
  });
  if (!est) throw new ApiError(404, "Estimate not found (or not visible to your role)");

  if (body.amount !== undefined) {
    await db.estimate.update({ where: { id: est.id }, data: { amount: body.amount.toString() } });
  }
  if (body.pauseChase !== undefined) {
    await db.estimate.update({
      where: { id: est.id },
      data: { followUpPausedAt: body.pauseChase ? new Date() : null },
    });
    if (body.pauseChase) await cancelEstimateNudges(est.inquiryId, "Chase paused by staff");
    await db.activity.create({
      data: { contractorId: contractor.id, inquiryId: est.inquiryId, actorType: "STAFF", actorLabel: user.name, kind: "ESTIMATE", message: body.pauseChase ? "Automated quote chase paused" : "Automated chase resumed" },
    });
  }
  if (body.status) {
    if (!ESTIMATE_STATUSES.includes(body.status as never)) throw new ApiError(400, "Invalid status");
    const now = await demoNow();
    const data: Record<string, unknown> = { status: body.status };
    if (body.status === "SENT" && !est.sentAt) {
      data.sentAt = now;
      if (!est.viewedAt && est.status === "DRAFT") data.viewedAt = null;
    }
    if (body.status === "VIEWED" && !est.viewedAt) data.viewedAt = now;
    if (body.status === "ACCEPTED") { data.acceptedAt = now; data.decidedAt = now; }
    if (body.status === "DECLINED") { data.decidedAt = now; }
    if (body.status === "INVOICED") { data.invoicedAt = now; if (!est.acceptedAt) { data.acceptedAt = now; data.decidedAt = now; } }
    await db.estimate.update({ where: { id: est.id }, data });

    if (body.status === "SENT" && !est.sentAt) {
      await db.inquiry.update({ where: { id: est.inquiryId }, data: { stage: "QUOTED", quotedValue: est.amount } });
      await onEstimateSent(est.id);
      await db.task.updateMany({ where: { inquiryId: est.inquiryId, kind: "PREPARE_QUOTE", status: "OPEN" }, data: { status: "DONE", completedAt: now } });
      await db.activity.create({
        data: { contractorId: contractor.id, inquiryId: est.inquiryId, actorType: "STAFF", actorLabel: user.name, kind: "ESTIMATE", message: `Estimate ${est.number} sent ($${est.amount})` },
      });
    } else {
      await onEstimateStatusChanged(est.id, body.status, body.reason);
    }
  }
  const fresh = await db.estimate.findUnique({ where: { id: est.id } });
  return json({ estimate: fresh });
});
