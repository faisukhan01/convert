import { db } from "@/lib/db";
import { json, route, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";

/** GET /api/provider-events — connector event log incl. failed events with replay state */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const events = await db.providerEvent.findMany({
    where: { OR: [{ contractorId: contractor.id }, { contractorId: null }] },
    orderBy: { receivedAt: "desc" },
    take: 80,
  });
  return json({ events });
});

/** POST /api/provider-events — replay a failed/pending event (safe retry path) */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { eventId: string };
  const { contractor } = await requireAccess(null);
  const event = await db.providerEvent.findFirst({
    where: { id: body.eventId, OR: [{ contractorId: contractor.id }, { contractorId: null }] },
  });
  if (!event) return json({ error: "Event not found" }, 404);
  const { processProviderEvent } = await import("@/lib/webhooks");
  const result = await processProviderEvent(event.id);
  return json({ ok: true, status: result.status, detail: result.detail });
});
