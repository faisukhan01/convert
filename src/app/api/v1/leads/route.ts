import { z } from "zod";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { json, route, ApiError } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { rateLimit } from "@/lib/ratelimit";
import { classifyInquiry, enqueueJob } from "@/lib/ai";
import { onInquiryCreated } from "@/lib/engine";
import { demoNow } from "@/lib/democlock";

/**
 * POST /api/v1/leads — secure, org-scoped lead ingestion for external websites,
 * WordPress/Elementor/Contact-Form-7/Shopify/custom forms, partner systems and
 * future channel connectors (Gmail, Facebook Lead Ads, WhatsApp share the same
 * ingestion contract).
 *
 * Auth: `x-api-key: rl_live_…` (organization API credential — see /api/api-keys
 * or `bun scripts/mint-api-key.ts`). Only the SHA-256 hash of the key is stored;
 * the raw key is shown exactly once at creation. Never expose the key in
 * browser JavaScript — proxy browser forms through a server.
 *
 * Pipeline: verify key → tenant scope → rate limit → validate (Zod) → dedupe
 * (content window + external id idempotency) → persist contact + inquiry →
 * enqueue AI qualification job (BackgroundJob) → best-effort inline
 * classification → native automation playbook → audit log.
 */

const SOURCE_MAP: Record<string, string> = {
  website: "WEBSITE",
  landing_page: "LANDING_PAGE",
  webhook: "WEBHOOK",
  facebook: "FACEBOOK",
  whatsapp: "WHATSAPP",
  gmail: "GMAIL",
  email: "GMAIL",
  phone: "PHONE_MISSED",
  referral: "REFERRAL",
  office: "OFFICE",
  other: "UNKNOWN",
};

const SERVICE_MAP: Record<string, string> = {
  repair: "REPAIR",
  replacement: "REPLACEMENT",
  re_roof: "REPLACEMENT",
  inspection: "INSPECTION",
};

const IngestSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().max(80).optional(),
  name: z.string().max(160).optional(), // full-name alternative to firstName
  email: z.string().max(160).optional(),
  phone: z.string().min(7).max(24),
  addressLine1: z.string().max(160).optional(),
  city: z.string().max(80).optional(),
  zip: z.string().min(3).max(12),
  service: z.string().max(40).optional(),
  message: z.string().max(4000).optional(),
  source: z.string().max(24).optional(),
  smsConsent: z.boolean().optional(),
  emailConsent: z.boolean().optional(),
  externalId: z.string().max(120).optional(), // integrator's own lead id (idempotency)
});

/** Resolve the caller from the API key header. */
async function requireApiKey(req: Request) {
  const raw = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!raw || !raw.startsWith("rl_")) throw new ApiError(401, "Missing or malformed API key (x-api-key)");
  const keyHash = createHash("sha256").update(raw.trim()).digest("hex");
  const key = await db.apiKey.findUnique({ where: { keyHash } });
  if (!key || key.revokedAt) throw new ApiError(401, "Invalid or revoked API key");
  return key;
}

export const POST = route(async (req) => {
  await ensureBootstrap();
  const key = await requireApiKey(req);

  const rl = await rateLimit(`apikey:${key.id}`, key.rateLimitPerMin);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec, limit: rl.limit },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "X-RateLimit-Limit": String(rl.limit), "X-RateLimit-Remaining": String(rl.remaining) } },
    );
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON");
  }
  const parsed = IngestSchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  const body = parsed.data;

  // tenant scope: everything below happens inside the key's organization
  const contractor = await db.contractor.findUnique({ where: { id: key.contractorId } });
  if (!contractor) throw new ApiError(410, "Organization no longer exists");

  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });

  // idempotency on externalId (safe integrator retries)
  if (body.externalId) {
    const ext = await db.providerLink.findFirst({
      where: { contractorId: contractor.id, provider: "api", entity: "lead", externalId: body.externalId },
    });
    if (ext) {
      const existing = await db.inquiry.findUnique({ where: { id: ext.localId } });
      if (existing) {
        return json({ ok: true, duplicate: true, reason: "externalId already ingested", lead: shape(existing) });
      }
    }
  }

  const phone = body.phone.replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 7) throw new ApiError(400, "Phone number looks invalid");

  const source = SOURCE_MAP[(body.source ?? "website").toLowerCase()] ?? "UNKNOWN";
  const serviceType = SERVICE_MAP[(body.service ?? "").toLowerCase()] ?? "REPLACEMENT";

  const firstName = body.firstName ?? body.name?.trim().split(/\s+/)[0] ?? "";
  const lastName = body.lastName ?? body.name?.trim().split(/\s+/).slice(1).join(" ") ?? "";
  if (!firstName) throw new ApiError(400, "firstName (or name) is required");

  // duplicate submission guard: same contact + service + ZIP inside the open window
  const existingContact = await db.contact.findUnique({ where: { contractorId_phone: { contractorId: contractor.id, phone } } });
  const openDuplicate = existingContact
    ? await db.inquiry.findFirst({
        where: {
          contractorId: contractor.id, contactId: existingContact.id,
          serviceType, serviceZip: body.zip,
          stage: { in: ["NEW", "RESPONDING", "BOOKED", "INSPECTED", "QUOTED"] },
          createdAt: { gte: new Date((await demoNow()).getTime() - 30 * 60_000) },
        },
      })
    : null;
  if (openDuplicate) {
    return json({ ok: true, duplicate: true, reason: "same contact, service and ZIP within 30 minutes", lead: shape(openDuplicate) });
  }

  const contact = existingContact
    ? await db.contact.update({
        where: { id: existingContact.id },
        data: {
          email: body.email ?? existingContact.email,
          firstName: firstName || existingContact.firstName,
          lastName: lastName || existingContact.lastName,
          addressLine1: body.addressLine1 ?? existingContact.addressLine1,
          city: body.city ?? existingContact.city,
          zip: body.zip,
          smsConsent: existingContact.smsConsent || !!body.smsConsent,
          emailConsent: existingContact.emailConsent || !!body.emailConsent,
        },
      })
    : await db.contact.create({
        data: {
          contractorId: contractor.id,
          firstName, lastName,
          email: body.email, phone,
          addressLine1: body.addressLine1, city: body.city, zip: body.zip,
          smsConsent: !!body.smsConsent, emailConsent: !!body.emailConsent,
        },
      });

  if (body.smsConsent && !existingContact?.smsConsent) {
    await db.consentEvent.create({
      data: {
        contractorId: contractor.id, contactId: contact.id, channel: "SMS", granted: true,
        basis: "WEB_FORM", wordingVersion: "v1", sourceLabel: `Ingestion API (${source})`,
      },
    });
  }

  const inquiry = await db.inquiry.create({
    data: {
      contractorId: contractor.id, contactId: contact.id,
      serviceType, serviceZip: body.zip,
      source, firstSource: source, // immutable — attribution never changes later
      stage: "NEW",
    },
  });

  // the customer's own words, journaled for AI context and the timeline
  if (body.message?.trim()) {
    await db.activity.create({
      data: {
        contractorId: contractor.id, inquiryId: inquiry.id,
        actorType: "CUSTOMER", actorLabel: `${firstName} ${lastName}`.trim() || "Customer",
        kind: "NOTE", message: body.message.trim(),
      },
    });
  }

  if (body.externalId) {
    await db.providerLink.create({
      data: {
        contractorId: contractor.id, provider: "api", entity: "lead",
        localId: inquiry.id, externalId: body.externalId,
      },
    });
  }

  // AI qualification: durable job (worker retries) + best-effort inline attempt so the
  // dashboard shows a category immediately. Inline failure never fails ingestion.
  await enqueueJob("LEAD_CLASSIFY", { inquiryId: inquiry.id }, contractor.id, `classify:${inquiry.id}`);
  void classifyInquiry(inquiry.id).catch(() => undefined);

  // native automation playbook (acknowledgment + callback task) — unchanged behavior
  await onInquiryCreated(inquiry.id);

  await db.auditEvent.create({
    data: {
      contractorId: contractor.id,
      action: "ingest.leads",
      entity: "inquiry",
      entityId: inquiry.id,
      meta: JSON.stringify({ source, apiKeyPrefix: key.prefix, externalId: body.externalId ?? null, contactId: contact.id }),
    },
  });

  return json({ ok: true, duplicate: false, lead: shape(inquiry) }, 201);
});

function shape(i: { id: string; stage: string; source: string; aiCategory: string | null; aiScore: number | null; createdAt: Date }) {
  return {
    id: i.id,
    stage: i.stage,
    source: i.source,
    aiCategory: i.aiCategory,
    aiScore: i.aiScore,
    aiStatus: i.aiCategory ? "classified" : "queued",
    createdAt: i.createdAt,
  };
}

/** GET /api/v1/leads?id=… — integrator-facing status check (scoped to the key's org). */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const key = await requireApiKey(req);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "id query parameter required");
  // tenant check lives in the where clause — cross-tenant ids return 404, not 403 (no info leak)
  const inquiry = await db.inquiry.findFirst({
    where: { id, contractorId: key.contractorId },
    select: { id: true, stage: true, source: true, serviceType: true, aiCategory: true, aiScore: true, aiUrgency: true, aiNextAction: true, aiClassifiedAt: true, createdAt: true, updatedAt: true },
  });
  if (!inquiry) throw new ApiError(404, "Lead not found");
  return json({ ok: true, lead: { ...inquiry, aiStatus: inquiry.aiCategory ? "classified" : "queued" } });
});
