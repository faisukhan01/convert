import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow, shiftClock, resetClock } from "@/lib/democlock";
import { runEngineTick, onCustomerReply, onOptOut } from "@/lib/engine";
import { processProviderEvent, signPayload } from "@/lib/webhooks";
import { resetDemo } from "@/lib/seed";

/**
 * POST /api/demo — demo-mode operator controls. Available only when the contractor is in
 * demo runMode (identity + reset controls hidden otherwise).
 *   run-engine            → process due outbox + digests now
 *   advance-clock         → {hours|days}
 *   reset-clock / reset-demo
 *   simulate-reply        → {text} customer reply on an inquiry (stops chase, creates task)
 *   simulate-optout       → contact opts out (STOP)
 *   simulate-provider-event → duplicate | out-of-order | rate-limit | revocation | unknown-location | timeout
 *   replay-event          → {eventId}
 */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as {
    action: string; contractorId?: string; inquiryId?: string; contactId?: string;
    text?: string; hours?: number; days?: number; variant?: string; eventId?: string;
  };
  const { contractor } = await requireAccess(body.contractorId);
  if (contractor.runMode !== "demo") {
    throw new ApiError(403, "Demo controls are only available in local demo mode");
  }

  switch (body.action) {
    case "run-engine": {
      const result = await runEngineTick();
      return json({ ok: true, ...result });
    }
    case "advance-clock": {
      const ms = (body.hours ? body.hours * 3600000 : 0) + (body.days ? body.days * 86400000 : 0);
      if (!ms) throw new ApiError(400, "hours or days required");
      const offset = await shiftClock(ms);
      const tick = await runEngineTick();
      return json({ ok: true, offsetMs: offset, ...tick });
    }
    case "reset-clock": {
      await resetClock();
      return json({ ok: true });
    }
    case "reset-demo": {
      await resetDemo();
      return json({ ok: true });
    }
    case "simulate-reply": {
      if (!body.inquiryId || !body.text) throw new ApiError(400, "inquiryId and text required");
      await onCustomerReply(body.inquiryId, body.text);
      const tick = await runEngineTick();
      return json({ ok: true, ...tick });
    }
    case "simulate-optout": {
      if (!body.contactId) throw new ApiError(400, "contactId required");
      await onOptOut(body.contactId);
      const tick = await runEngineTick();
      return json({ ok: true, ...tick });
    }
    case "simulate-provider-event": {
      const now = await demoNow();
      const variant = body.variant ?? "duplicate";
      const payload = buildVariantPayload(variant);
      const raw = JSON.stringify(payload);
      const event = await db.providerEvent.create({
        data: {
          provider: "GHL",
          eventType: variant === "timeout" ? "AmbiguousTimeout" : variant === "unknown-location" ? "ContactCreate" : "EstimateStatusUpdate",
          externalId: payload.eventId ? String(payload.eventId) : `demo_${variant}_${now.getTime()}`,
          payload: raw,
          signatureValid: true,
          status: "PENDING",
        },
      });
      const result = await processProviderEvent(event.id);
      return json({ ok: true, eventId: event.id, status: result.status, detail: result.detail });
    }
    case "replay-event": {
      if (!body.eventId) throw new ApiError(400, "eventId required");
      const result = await processProviderEvent(body.eventId);
      return json({ ok: true, status: result.status, detail: result.detail });
    }
    default:
      throw new ApiError(400, "Unknown action");
  }
});

function buildVariantPayload(variant: string): Record<string, unknown> {
  switch (variant) {
    case "duplicate":
      // replays the same external id as the seeded processed event → must dedupe
      return { locationId: "loc_demo_summit", estimateNumber: "E-1041", status: "SENT", eventId: "ghl_evt_001" };
    case "out-of-order":
      // late 'sent' for an already accepted/invoiced estimate → must be skipped out-of-order
      return { locationId: "loc_demo_summit", estimateNumber: "E-1041", status: "SENT", eventId: `ooo_${Date.now()}` };
    case "rate-limit":
      return { locationId: "loc_demo_summit", estimateNumber: "E-1043", status: "VIEWED", eventId: `rl_${Date.now()}` };
    case "revocation":
      return { locationId: "loc_demo_summit", estimateNumber: "E-1043", status: "SENT", eventId: `rev_${Date.now()}` };
    case "unknown-location":
      return { locationId: "loc_unknown_999", contactId: `ghl_contact_${Date.now()}`, eventId: `unk_${Date.now()}` };
    case "timeout":
      return { locationId: "loc_demo_summit", estimateNumber: "E-1043", status: "VIEWED", eventId: `to_${Date.now()}` };
    default:
      return { locationId: "loc_demo_summit" };
  }
}

/** GET /api/demo — demo state (clock offset, seeded time) */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const state = await db.demoState.findUnique({ where: { id: "singleton" } });
  const now = await demoNow();
  return json({
    runMode: contractor.runMode,
    clockOffsetMs: state?.clockOffsetMs ?? 0,
    demoNow: now.toISOString(),
    seededAt: state?.seededAt?.toISOString() ?? null,
    webhookSecretPreview: signPayload("probe").slice(0, 8),
  });
});
