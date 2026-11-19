import { db } from "@/lib/db";
import { hmacSha256Hex, timingSafeEqualStr } from "@/lib/crypto";
import { demoNow } from "@/lib/democlock";
import { ESTIMATE_STATUSES } from "@/lib/constants";

/**
 * Inbound provider webhook processing: verify the signature over the required raw bytes →
 * durably record the event → process with idempotency + ordering guards → ack. Duplicate,
 * out-of-order, unknown-location and rate-limited events end in explicit states with a safe
 * replay path. Signature scheme: HMAC-SHA256 hex over the raw body with GHL_WEBHOOK_SECRET —
 * re-verify against the current provider docs at configuration time (awaiting credentials).
 */
export const DEMO_WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET || "ridgeline-demo-webhook-secret";

export function signPayload(raw: string): string {
  return hmacSha256Hex(DEMO_WEBHOOK_SECRET, raw);
}

export function verifySignature(raw: string, header: string | null): boolean {
  if (!header) return false;
  const provided = header.replace(/^sha256=/, "").trim().toLowerCase();
  return timingSafeEqualStr(provided, hmacSha256Hex(DEMO_WEBHOOK_SECRET, raw).toLowerCase());
}

// per-location in-memory rate limiter (token bucket), bounded retries handled by replay
const g = globalThis as unknown as { __rl_rate?: Map<string, { count: number; resetAt: number }> };
function rateLimited(locationId: string): boolean {
  if (!g.__rl_rate) g.__rl_rate = new Map();
  const now = Date.now();
  const bucket = g.__rl_rate.get(locationId);
  if (!bucket || bucket.resetAt < now) {
    g.__rl_rate.set(locationId, { count: 1, resetAt: now + 60000 });
    return false;
  }
  bucket.count++;
  return bucket.count > 5; // 5 events/minute/location in demo
}

export type ProcessResult = { status: string; detail: string };

export async function processProviderEvent(eventId: string): Promise<ProcessResult> {
  const event = await db.providerEvent.findUnique({ where: { id: eventId } });
  if (!event) return { status: "FAILED", detail: "Event not found" };
  if (event.status === "PROCESSED") return { status: event.status, detail: "Already processed" };

  const now = await demoNow();
  const payload = JSON.parse(event.payload || "{}") as { locationId?: string; estimateNumber?: string; status?: string; contactId?: string };

  // 1. Resolve the verified installation for this provider location.
  if (!payload.locationId) {
    await db.providerEvent.update({ where: { id: eventId }, data: { status: "FAILED", processError: "Missing locationId", attempts: { increment: 1 } } });
    return { status: "FAILED", detail: "Missing locationId" };
  }
  const install = await db.providerInstall.findFirst({ where: { provider: event.provider, locationId: payload.locationId, status: { in: ["CONNECTED"] } } });
  if (!install) {
    await db.providerEvent.update({
      where: { id: eventId },
      data: { status: "FAILED", processError: `Unknown GHL location — no installed contractor matches locationId '${payload.locationId}'`, attempts: { increment: 1 } },
    });
    return { status: "FAILED", detail: "Unknown location" };
  }
  if (rateLimited(install.contractorId)) {
    await db.providerEvent.update({
      where: { id: eventId },
      data: { status: "PENDING", processError: "Rate limited — queued for retry (bounded)", attempts: { increment: 1 } },
    });
    return { status: "PENDING", detail: "Rate limited" };
  }

  // 2. Idempotency: same external id already processed → skip.
  if (event.externalId) {
    const dupe = await db.providerEvent.findFirst({
      where: { provider: event.provider, externalId: event.externalId, status: { in: ["PROCESSED", "SKIPPED_DUPLICATE"] }, id: { not: eventId } },
    });
    if (dupe) {
      await db.providerEvent.update({
        where: { id: eventId },
        data: { status: "SKIPPED_DUPLICATE", processError: `Duplicate of ${dupe.externalId} — deduped by external event id`, processedAt: now, attempts: { increment: 1 } },
      });
      return { status: "SKIPPED_DUPLICATE", detail: "Duplicate" };
    }
  }

  // 3. Type-specific handling with ordering guards.
  try {
    if (event.eventType === "EstimateStatusUpdate" && payload.estimateNumber) {
      const est = await db.estimate.findFirst({ where: { contractorId: install.contractorId, number: payload.estimateNumber } });
      if (!est) {
        await db.providerEvent.update({ where: { id: eventId }, data: { status: "FAILED", processError: `Estimate ${payload.estimateNumber} not found`, attempts: { increment: 1 } } });
        return { status: "FAILED", detail: "Estimate not found" };
      }
      const incomingIdx = ESTIMATE_STATUSES.indexOf((payload.status ?? "") as never);
      const currentIdx = ESTIMATE_STATUSES.indexOf(est.status as never);
      // A late "sent" event must not reopen an accepted estimate.
      if (incomingIdx >= 0 && currentIdx >= 0 && incomingIdx < currentIdx) {
        await db.providerEvent.update({
          where: { id: eventId },
          data: { status: "SKIPPED_OUT_OF_ORDER", processError: `Late '${payload.status}' for an already ${est.status.toLowerCase()} estimate — not re-opening`, processedAt: now, attempts: { increment: 1 } },
        });
        return { status: "SKIPPED_OUT_OF_ORDER", detail: "Out of order" };
      }
      const nowTs = now;
      const data: Record<string, unknown> = { status: payload.status };
      if (payload.status === "SENT" && !est.sentAt) data.sentAt = nowTs;
      if (payload.status === "VIEWED" && !est.viewedAt) data.viewedAt = nowTs;
      if (payload.status === "ACCEPTED") { data.acceptedAt = nowTs; data.decidedAt = nowTs; }
      if (payload.status === "DECLINED") data.decidedAt = nowTs;
      if (payload.status === "INVOICED") data.invoicedAt = nowTs;
      await db.estimate.update({ where: { id: est.id }, data });
      const { onEstimateStatusChanged } = await import("@/lib/engine");
      await onEstimateStatusChanged(est.id, payload.status ?? "");
    } else if (event.eventType === "ContactCreate" && payload.contactId) {
      await db.providerLink.upsert({
        where: { provider_entity_localId: { provider: event.provider, entity: "contact", localId: payload.contactId } },
        update: { externalId: payload.contactId, lastSyncedAt: now, contractorId: install.contractorId },
        create: { contractorId: install.contractorId, provider: event.provider, entity: "contact", localId: payload.contactId, externalId: payload.contactId, lastSyncedAt: now },
      });
    } else if (event.eventType === "AmbiguousTimeout") {
      // A timed-out write whose outcome is uncertain: reconcile before retrying.
      await db.providerEvent.update({
        where: { id: eventId },
        data: { status: "PENDING", processError: "Outbound write timed out — outcome uncertain; reconcile state before retry", attempts: { increment: 1 } },
      });
      return { status: "PENDING", detail: "Ambiguous timeout — needs reconciliation" };
    }
    await db.providerEvent.update({ where: { id: eventId }, data: { status: "PROCESSED", processError: null, processedAt: now, attempts: { increment: 1 }, contractorId: install.contractorId } });
    return { status: "PROCESSED", detail: "Processed" };
  } catch (e) {
    await db.providerEvent.update({
      where: { id: eventId },
      data: { status: "FAILED", processError: (e as Error).message.slice(0, 300), attempts: { increment: 1 } },
    });
    return { status: "FAILED", detail: (e as Error).message };
  }
}
