import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess, assertManage } from "@/lib/api";

/** DELETE /api/api-keys/{id} — revoke an organization API key. */
export const DELETE = route(async (_req, seg) => {
  const ctx = await requireAccess();
  assertManage(ctx.role);
  const { id } = await seg.params;
  // tenant check in the where clause — other orgs' keys are not reachable from here
  const key = await db.apiKey.findFirst({ where: { id, contractorId: ctx.contractor.id } });
  if (!key) throw new ApiError(404, "API key not found");
  if (key.revokedAt) return json({ ok: true, alreadyRevoked: true });
  await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await db.auditEvent.create({
    data: {
      contractorId: ctx.contractor.id, userId: ctx.user.id,
      action: "api_key.revoke", entity: "api_key", entityId: key.id,
      meta: JSON.stringify({ name: key.name }),
    },
  });
  return json({ ok: true });
});
