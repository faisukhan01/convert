import { db } from "@/lib/db";
import { json, route, ApiError } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { onInquiryCreated } from "@/lib/engine";
import { SERVICE_TYPES } from "@/lib/constants";

/**
 * POST /api/public/intake — homeowner estimate request (no auth; rate-limited lightly).
 * Contact identity rules: two deliveries of one form submission create one inquiry;
 * a later request for another property creates a separate inquiry for the same contact.
 */
export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as {
    contractorSlug?: string;
    firstName?: string; lastName?: string; email?: string; phone?: string;
    addressLine1?: string; city?: string; zip?: string;
    serviceType?: string; contactPreference?: string; smsConsent?: boolean;
    source?: string;
  };
  if (!body.contractorSlug || !body.firstName || !body.phone || !body.zip) {
    throw new ApiError(400, "Business, name, phone and ZIP are required");
  }
  const contractor = await db.contractor.findUnique({ where: { slug: body.contractorSlug } });
  if (!contractor) throw new ApiError(404, "Business not found");

  const phone = body.phone.replace(/[^\d+]/g, "");
  let contact = await db.contact.findUnique({ where: { contractorId_phone: { contractorId: contractor.id, phone } } });
  const consentNow = !!body.smsConsent;
  if (!contact) {
    contact = await db.contact.create({
      data: {
        contractorId: contractor.id, firstName: body.firstName, lastName: body.lastName ?? "",
        email: body.email, phone,
        addressLine1: body.addressLine1, city: body.city, state: contractor.state, zip: body.zip,
        preferredChannel: body.contactPreference === "email" ? "email" : body.contactPreference === "phone" ? "phone" : "sms",
        smsConsent: consentNow, emailConsent: !!body.email,
      },
    });
  } else {
    contact = await db.contact.update({
      where: { id: contact.id },
      data: {
        smsConsent: contact.smsConsent || consentNow,
        emailConsent: contact.emailConsent || !!body.email,
        addressLine1: body.addressLine1 ?? contact.addressLine1,
        zip: body.zip ?? contact.zip,
      },
    });
  }
  if (consentNow && !contact.smsConsent) {
    // unreachable (kept for clarity): consent upgrades recorded above
  }
  if (body.smsConsent) {
    await db.consentEvent.create({
      data: {
        contractorId: contractor.id, contactId: contact.id, channel: "SMS", granted: true,
        basis: "WEB_FORM", wordingVersion: "v1", sourceLabel: "Website estimate form",
      },
    });
  }

  const serviceType = body.serviceType && SERVICE_TYPES.includes(body.serviceType as never) ? body.serviceType : "REPLACEMENT";
  const source = body.source === "LANDING_PAGE" ? "LANDING_PAGE" : "WEBSITE";

  // Duplicate guard: same contact + same service + same ZIP with an open inquiry → return existing
  const open = await db.inquiry.findFirst({
    where: {
      contractorId: contractor.id, contactId: contact.id,
      serviceType, serviceZip: body.zip,
      stage: { in: ["NEW", "RESPONDING", "BOOKED", "INSPECTED", "QUOTED"] },
    },
  });
  if (open) {
    return json({ ok: true, inquiryId: open.id, publicToken: open.publicToken, existing: true });
  }

  const inquiry = await db.inquiry.create({
    data: {
      contractorId: contractor.id, contactId: contact.id,
      serviceType, serviceZip: body.zip,
      source, firstSource: source,
      stage: "NEW",
    },
  });
  await onInquiryCreated(inquiry.id);
  return json({ ok: true, inquiryId: inquiry.id, publicToken: inquiry.publicToken, existing: false }, 201);
});

/** GET /api/public/intake?slug= — business context for the branded form */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const contractor = await db.contractor.findUnique({
    where: { slug: slug ?? "summit" },
    select: { id: true, name: true, slug: true, city: true, state: true, serviceZips: true, timezone: true },
  });
  if (!contractor) throw new ApiError(404, "Business not found");
  return json({ contractor });
});
