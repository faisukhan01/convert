import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess, estimatorScope } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { onInquiryCreated, onCustomerReply, setAutomationPaused } from "@/lib/engine";
import { STAGES, SOURCES, SERVICE_TYPES } from "@/lib/constants";

/** GET /api/inquiries — filterable list (owner, source, stage, q, due) with cursor pagination */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor, role, user } = await requireAccess(url.searchParams.get("contractorId"));
  const scope = estimatorScope(role, user.id);
  const q = url.searchParams.get("q")?.trim();
  const stage = url.searchParams.get("stage");
  const source = url.searchParams.get("source");
  const owner = url.searchParams.get("owner");
  const due = url.searchParams.get("due"); // overdue | today | week
  const cursor = url.searchParams.get("cursor"); // id of the last row of the previous page
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);

  const where = {
    contractorId: contractor.id,
    ...(scope ?? {}),
    ...(stage && stage !== "all" ? { stage } : {}),
    ...(source && source !== "all" ? { source } : {}),
    ...(owner && owner !== "all" ? { ownerUserId: owner } : {}),
    ...(q
      ? {
          OR: [
            { contact: { is: { firstName: { contains: q } } } },
            { contact: { is: { lastName: { contains: q } } } },
            { contact: { is: { phone: { contains: q } } } },
            { contact: { is: { email: { contains: q } } } },
            { contact: { is: { addressLine1: { contains: q } } } },
          ],
        }
      : {}),
    ...(due === "overdue"
      ? { tasks: { some: { status: "OPEN", dueAt: { lt: new Date() } } } }
      : {}),
  };

  // Stable cursor pagination: createdAt desc + id desc tiebreaker, cursor = last id.
  // One extra row is fetched to detect "has more" without a separate count query.
  const rows = await db.inquiry.findMany({
    where,
    include: {
      contact: true,
      appointments: { orderBy: { createdAt: "desc" }, take: 1 },
      estimates: { orderBy: { createdAt: "desc" }, take: 1 },
      tasks: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" }, take: 1 },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const inquiries = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? inquiries[inquiries.length - 1].id : null;
  return json({ inquiries, nextCursor, hasMore });
});

/** POST /api/inquiries — office-entered lead or missed call intake */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as {
    contractorId?: string;
    firstName?: string; lastName?: string; email?: string; phone?: string;
    addressLine1?: string; zip?: string;
    serviceType?: string; source?: string; smsConsent?: boolean;
    note?: string; isMissedCall?: boolean;
  };
  const { contractor, user, role } = await requireAccess(body.contractorId);
  if (role === "ESTIMATOR") throw new ApiError(403, "Estimators cannot create inquiries");

  if (!body.firstName || !body.phone) throw new ApiError(400, "First name and phone are required");
  const serviceType = body.serviceType && SERVICE_TYPES.includes(body.serviceType as never) ? body.serviceType : "INSPECTION";
  const source = body.isMissedCall ? "PHONE_MISSED" : body.source && SOURCES.includes(body.source as never) ? body.source : "OFFICE";

  // Contact identity: one contact per phone per contractor; a later request for another
  // property creates a separate inquiry for the same contact.
  const phone = body.phone.replace(/[^\d+]/g, "");
  let contact = await db.contact.findUnique({ where: { contractorId_phone: { contractorId: contractor.id, phone } } });
  if (!contact) {
    contact = await db.contact.create({
      data: {
        contractorId: contractor.id, firstName: body.firstName, lastName: body.lastName ?? "",
        email: body.email, phone,
        addressLine1: body.addressLine1, zip: body.zip,
        smsConsent: !!body.smsConsent, emailConsent: !!body.email,
        preferredChannel: body.smsConsent ? "sms" : "phone",
      },
    });
  } else if (body.smsConsent && !contact.smsConsent) {
    contact = await db.contact.update({ where: { id: contact.id }, data: { smsConsent: true } });
  }

  // Duplicate submission guard: same contact + same service + same ZIP with an open inquiry → return it.
  const open = await db.inquiry.findFirst({
    where: {
      contractorId: contractor.id, contactId: contact.id,
      serviceType, serviceZip: body.zip ?? "",
      stage: { in: ["NEW", "RESPONDING", "BOOKED", "INSPECTED", "QUOTED"] },
    },
  });
  if (open) return json({ inquiry: open, existing: true });

  const inquiry = await db.inquiry.create({
    data: {
      contractorId: contractor.id, contactId: contact.id,
      serviceType, serviceZip: body.zip ?? "",
      source, firstSource: source,
      stage: "NEW",
      ownerUserId: role === "ESTIMATOR" ? user.id : null,
    },
  });
  if (body.note) {
    await db.activity.create({
      data: { contractorId: contractor.id, inquiryId: inquiry.id, actorType: "STAFF", actorLabel: user.name, kind: "NOTE", message: body.note },
    });
    await db.touchpoint.create({ data: { contractorId: contractor.id, inquiryId: inquiry.id, kind: "NOTE", label: `Office note: ${body.note.slice(0, 120)}` } });
  }
  await onInquiryCreated(inquiry.id);
  return json({ inquiry, existing: false }, 201);
});

/** PATCH /api/inquiries?id= — owner, stage, pause automation, note, reply simulation hook */
export const PATCH = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id required");
  const body = (await req.json()) as {
    ownerUserId?: string | null; stage?: string; paused?: boolean; note?: string; reply?: string; isDuplicate?: boolean;
  };
  const { contractor, user, role } = await requireAccess(null);
  const scope = estimatorScope(role, user.id);
  const inquiry = await db.inquiry.findFirst({ where: { id, contractorId: contractor.id, ...(scope ?? {}) } });
  if (!inquiry) throw new ApiError(404, "Inquiry not found (or not visible to your role)");

  if (body.reply) {
    await onCustomerReply(inquiry.id, body.reply);
  }
  if (body.paused !== undefined) {
    if (role === "ESTIMATOR") throw new ApiError(403, "Requires office or owner role");
    await setAutomationPaused(inquiry.id, body.paused, user.name);
  }
  if (body.ownerUserId !== undefined) {
    await db.inquiry.update({ where: { id: inquiry.id }, data: { ownerUserId: body.ownerUserId } });
    await db.activity.create({
      data: {
        contractorId: contractor.id, inquiryId: inquiry.id, actorType: "STAFF", actorLabel: user.name, kind: "STAGE",
        message: body.ownerUserId ? `Owner assigned: ${(await db.user.findUnique({ where: { id: body.ownerUserId } }))?.name ?? "staff"}` : "Owner cleared",
      },
    });
  }
  if (body.stage && role !== "ESTIMATOR") {
    if (!STAGES.includes(body.stage as never)) throw new ApiError(400, "Invalid stage");
    await db.inquiry.update({ where: { id: inquiry.id }, data: { stage: body.stage } });
    await db.activity.create({
      data: { contractorId: contractor.id, inquiryId: inquiry.id, actorType: "STAFF", actorLabel: user.name, kind: "STAGE", message: `Stage: ${inquiry.stage} → ${body.stage}` },
    });
  }
  if (body.isDuplicate !== undefined && role !== "ESTIMATOR") {
    await db.inquiry.update({ where: { id: inquiry.id }, data: { isDuplicate: body.isDuplicate } });
  }
  if (body.note) {
    await db.activity.create({
      data: { contractorId: contractor.id, inquiryId: inquiry.id, actorType: "STAFF", actorLabel: user.name, kind: "NOTE", message: body.note },
    });
    await db.touchpoint.create({ data: { contractorId: contractor.id, inquiryId: inquiry.id, kind: "NOTE", label: `Staff note: ${body.note.slice(0, 120)}` } });
  }
  const fresh = await db.inquiry.findUnique({ where: { id: inquiry.id } });
  return json({ inquiry: fresh });
});
