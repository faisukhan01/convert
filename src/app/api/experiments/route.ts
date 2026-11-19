import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";

/**
 * GET  /api/experiments — arms, sample sizes, results (small samples flagged inconclusive)
 * PATCH /api/experiments?id= — staff action: route future contacts to one arm, stop splitting
 */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const experiments = await db.experiment.findMany({
    where: { contractorId: contractor.id },
    include: { assignments: { include: { contact: true } } },
    orderBy: { startedAt: "desc" },
  });
  return json({
    experiments: experiments.map((e) => ({
      id: e.id, name: e.name, status: e.status, messageA: e.messageA, messageB: e.messageB,
      windowDays: e.windowDays, minSample: e.minSample, routeToArm: e.routeToArm, startedAt: e.startedAt,
      assignmentCount: e.assignments.length,
    })),
  });
});

export const PATCH = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ApiError(400, "id required");
  const body = (await req.json()) as { routeToArm?: "A" | "B"; status?: string };
  const { contractor, user } = await requireAccess(null);
  if (user.role === "ESTIMATOR") throw new ApiError(403, "Requires office or owner role");
  const exp = await db.experiment.findFirst({ where: { id, contractorId: contractor.id } });
  if (!exp) throw new ApiError(404, "Experiment not found");
  await db.experiment.update({
    where: { id: exp.id },
    data: {
      routeToArm: body.routeToArm ?? exp.routeToArm,
      status: body.status ?? (body.routeToArm ? "ROUTED" : exp.status),
    },
  });
  return json({ ok: true });
});
