import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess, estimatorScope } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";

/** GET /api/tasks?view=today|overdue|all — the office work queue */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "all";
  const { contractor, user, role } = await requireAccess(url.searchParams.get("contractorId"));
  const now = await demoNow();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const scope = estimatorScope(role, user.id);
  const baseWhere = {
    contractorId: contractor.id,
    status: "OPEN" as string,
    ...(scope ? { inquiry: scope } : {}),
  };
  const where =
    view === "overdue" ? { ...baseWhere, dueAt: { lt: now } } :
    view === "today" ? { ...baseWhere, dueAt: { lte: endOfToday } } :
    baseWhere;

  const tasks = await db.task.findMany({
    where,
    include: { inquiry: { include: { contact: true } } },
    orderBy: { dueAt: "asc" },
    take: 150,
  });
  return json({ tasks, now: now.toISOString() });
});

/** POST /api/tasks — create a manual task */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as {
    contractorId?: string; inquiryId?: string; kind?: string; title?: string; detail?: string;
    dueAt?: string; assignedUserId?: string;
  };
  const { contractor, user, role } = await requireAccess(body.contractorId);
  if (role === "ESTIMATOR") throw new ApiError(403, "Requires office or owner role");
  if (!body.title) throw new ApiError(400, "Title required");
  const task = await db.task.create({
    data: {
      contractorId: contractor.id,
      inquiryId: body.inquiryId ?? null,
      kind: body.kind ?? "OTHER",
      title: body.title,
      detail: body.detail,
      dueAt: body.dueAt ? new Date(body.dueAt) : new Date(Date.now() + 4 * 3600000),
      assignedUserId: body.assignedUserId ?? null,
      createdBy: "STAFF",
    },
  });
  if (task.inquiryId) {
    await db.activity.create({
      data: { contractorId: contractor.id, inquiryId: task.inquiryId, actorType: "STAFF", actorLabel: user.name, kind: "TASK", message: `Task created: ${task.title}` },
    });
  }
  return json({ task }, 201);
});

/** PATCH /api/tasks?id= — assign, snooze, complete, cancel */
export const PATCH = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id required");
  const body = (await req.json()) as { assignedUserId?: string | null; snoozeUntil?: string; complete?: boolean; cancel?: boolean };
  const { contractor, user, role } = await requireAccess(null);
  const scope = estimatorScope(role, user.id);
  const task = await db.task.findFirst({
    where: { id, contractorId: contractor.id, ...(scope ? { inquiry: scope } : {}) },
    include: { inquiry: { include: { contact: true } } },
  });
  if (!task) throw new ApiError(404, "Task not found (or not visible to your role)");

  if (body.assignedUserId !== undefined) {
    const assignee = body.assignedUserId ? await db.user.findUnique({ where: { id: body.assignedUserId } }) : null;
    await db.task.update({ where: { id: task.id }, data: { assignedUserId: body.assignedUserId } });
    if (task.inquiryId) {
      await db.activity.create({
        data: { contractorId: contractor.id, inquiryId: task.inquiryId, actorType: "STAFF", actorLabel: user.name, kind: "TASK", message: `Task assigned to ${assignee?.name ?? "unassigned"}` },
      });
    }
  }
  if (body.snoozeUntil) {
    await db.task.update({ where: { id: task.id }, data: { dueAt: new Date(body.snoozeUntil), snoozedUntil: new Date(body.snoozeUntil) } });
    if (task.inquiryId) {
      await db.activity.create({
        data: { contractorId: contractor.id, inquiryId: task.inquiryId, actorType: "STAFF", actorLabel: user.name, kind: "TASK", message: `Snoozed until ${new Date(body.snoozeUntil).toLocaleString()}` },
      });
    }
  }
  if (body.complete) {
    await db.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
    if (task.inquiryId) {
      await db.activity.create({
        data: { contractorId: contractor.id, inquiryId: task.inquiryId, actorType: "STAFF", actorLabel: user.name, kind: "TASK", message: `Task completed: ${task.title}` },
      });
    }
  }
  if (body.cancel) {
    await db.task.update({ where: { id: task.id }, data: { status: "CANCELED" } });
  }
  const fresh = await db.task.findUnique({ where: { id: task.id } });
  return json({ task: fresh });
});
