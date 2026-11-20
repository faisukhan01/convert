import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess, assertManage } from "@/lib/api";

/**
 * Organization API credentials for the ingestion API (POST /api/v1/leads).
 *
 * GET    /api/api-keys                → list keys for the current location (masked)
 * POST   /api/api-keys {name}         → create a key; the RAW key is returned ONCE
 * DELETE /api/api-keys/{id}           → revoke
 *
 * Only the SHA-256 hash is stored. Requires OWNER / OFFICE / AGENCY_ADMIN.
 */
export const GET = route(async () => {
  const ctx = await requireAccess();
  assertManage(ctx.role);
  const keys = await db.apiKey.findMany({
    where: { contractorId: ctx.contractor.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, rateLimitPerMin: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
  return json({ ok: true, keys });
});

export const POST = route(async (req) => {
  const ctx = await requireAccess();
  assertManage(ctx.role);
  const body = (await req.json().catch(() => ({}))) as { name?: string; rateLimitPerMin?: number };
  const name = (body.name ?? "").trim() || "Default key";
  const rateLimitPerMin = Math.min(Math.max(Number(body.rateLimitPerMin) || 60, 1), 600);

  const raw = `rl_live_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 16);

  const key = await db.apiKey.create({
    data: {
      contractorId: ctx.contractor.id,
      name,
      prefix,
      keyHash,
      rateLimitPerMin,
      createdById: ctx.user.id,
    },
  });

  await db.auditEvent.create({
    data: {
      contractorId: ctx.contractor.id, userId: ctx.user.id,
      action: "api_key.create", entity: "api_key", entityId: key.id,
      meta: JSON.stringify({ name, rateLimitPerMin }),
    },
  });

  return json({ ok: true, key: { id: key.id, name: key.name, prefix: key.prefix, rateLimitPerMin: key.rateLimitPerMin, createdAt: key.createdAt }, rawKey: raw }, 201);
});
