import { db } from "@/lib/db";
import { json, route } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";

/** GET /api/health → liveness + persistence check */
export const GET = route(async () => {
  await ensureBootstrap();
  await db.demoState.findUnique({ where: { id: "singleton" } });
  return json({ ok: true, service: "ridgeline", time: new Date().toISOString() });
});
