import { db } from "@/lib/db";
import { json, route, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { verifySignature, processProviderEvent } from "@/lib/webhooks";

/**
 * POST /api/webhooks/ghl — inbound provider events.
 * Verify signature over raw bytes → durably record → process inline → ack.
 * GET — operator view of recent events + failed-events replay status.
 */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const raw = await req.text();
  const sig = req.headers.get("x-ghl-signature") ?? req.headers.get("x-webhook-signature");
  const valid = verifySignature(raw, sig);

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const event = await db.providerEvent.create({
    data: {
      provider: "GHL",
      eventType: String(body.type ?? body.eventType ?? "Unknown"),
      externalId: body.eventId ? String(body.eventId) : null,
      payload: raw,
      signatureValid: valid,
      status: "PENDING",
    },
  });

  if (!valid) {
    await db.providerEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", processError: "Signature verification failed over raw bytes — event rejected", processedAt: new Date() },
    });
    // Acknowledge to avoid provider retry storms, but the event is rejected.
    return json({ ok: true, eventId: event.id, status: "FAILED", detail: "Invalid signature" });
  }

  const result = await processProviderEvent(event.id);
  return json({ ok: true, eventId: event.id, status: result.status, detail: result.detail });
});

export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const events = await db.providerEvent.findMany({
    where: { OR: [{ contractorId: contractor.id }, { contractorId: null }] },
    orderBy: { receivedAt: "desc" },
    take: 60,
  });
  return json({ events });
});
