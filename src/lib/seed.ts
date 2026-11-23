import { db } from "@/lib/db";
import { wallToUtc, nextWindowStart, tzParts } from "@/lib/time";
import { randomToken } from "@/lib/crypto";
import {
  bookingLinkBody, reminderBody, missedYouBody, followUpBody,
} from "@/lib/templates";
import { DEFAULT_WORKING_HOURS } from "@/lib/constants";
import type { Contractor } from "@prisma/client";

/**
 * Deterministic demo fixtures. Dates are computed relative to seed time so "Today" is always
 * populated. The reporting fixture lands exactly on the acceptance contract:
 *   12 mature eligible inquiries, 7 bookings, 5 held inspections, 1 no-show, 1 cancellation
 *   → 58.3% booking rate, 83.3% show rate; 4 sent estimates / 2 accepted = 50%;
 *   USD receipts 1,200 + 300 − 100 refund = 1,400 collected (+450 unmatched shown separately).
 *   Experiment: 6 contacts per arm, 3 (A) vs 4 (B) booked → 50.0% vs 66.7% (+16.7 pp, inconclusive).
 *
 * Structure vs business data:
 *   structure = Agency, Users, Contractors, Memberships — sign-in and tenancy live here.
 *   business  = Contacts, Inquiries, Appointments, Estimates, Tasks, Payments, automations,
 *               connector state, experiments — the demo pipeline itself.
 * `wipeBusinessData` (the Settings "Remove demo data" action) removes business data ONLY, so
 * nobody is ever signed out; `runSeed` re-installs business fixtures onto the surviving
 * structure without touching any account. `wipe` remains the full factory reset.
 */
type DemoStructure = {
  summit: Contractor;
  northpeak: Contractor;
  users: Record<string, string>; // demo email → user id
};

/** Create the agency/users/contractors/memberships skeleton if (and only if) missing. */
async function ensureDemoStructure(): Promise<DemoStructure> {
  const now = new Date();
  const D = (days: number, hours = 0, minutes = 0) =>
    new Date(now.getTime() + days * 86400000 + hours * 3600000 + minutes * 60000);
  const TZ = "America/Chicago";
  const HOURS = JSON.stringify(DEFAULT_WORKING_HOURS);

  let agency = await db.agency.findFirst({ where: { name: "Peak Advisory Group" } });
  if (!agency) agency = await db.agency.create({ data: { name: "Peak Advisory Group" } });

  const usersData = [
    { email: "agency@ridgeline.demo", name: "Dana Whitfield", role: "AGENCY_ADMIN", agencyId: agency.id },
    { email: "owner@ridgeline.demo", name: "Priya Shah", role: "OWNER", agencyId: null },
    { email: "office@ridgeline.demo", name: "Marcus Lee", role: "OFFICE", agencyId: null },
    { email: "estimator@ridgeline.demo", name: "Alex Rivera", role: "ESTIMATOR", agencyId: null },
    { email: "owner2@ridgeline.demo", name: "Sam Ortiz", role: "OWNER", agencyId: null },
  ];
  const users: Record<string, string> = {};
  for (const u of usersData) {
    // Upsert and never clobber: an existing account may be signed in right now.
    const row = await db.user.upsert({ where: { email: u.email }, update: {}, create: u });
    users[u.email] = row.id;
  }

  const summit = await db.contractor.upsert({
    where: { slug: "summit" },
    update: {},
    create: {
      agencyId: agency.id, name: "Summit Roofing Co.", slug: "summit",
      timezone: TZ, addressLine1: "412 Cedar Park Blvd", city: "Austin", state: "TX",
      serviceZips: "78704,78745,78741,78749,78703",
      billingStatus: "active", runMode: "demo", activatedAt: D(-45),
      ghlLocationId: "loc_demo_summit",
      workingHours: HOURS,
    },
  });
  const northpeak = await db.contractor.upsert({
    where: { slug: "northpeak" },
    update: {},
    create: {
      agencyId: agency.id, name: "North Peak Exteriors", slug: "northpeak",
      timezone: "America/Denver", addressLine1: "88 Alpine Way", city: "Boulder", state: "CO",
      serviceZips: "80301,80302,80304",
      billingStatus: "trial", runMode: "demo",
      workingHours: JSON.stringify({ ...DEFAULT_WORKING_HOURS, sat: ["09:00", "13:00"] }),
    },
  });

  const memberSpecs = [
    { email: "owner@ridgeline.demo", contractorId: summit.id, role: "OWNER" },
    { email: "office@ridgeline.demo", contractorId: summit.id, role: "OFFICE" },
    { email: "estimator@ridgeline.demo", contractorId: summit.id, role: "ESTIMATOR" },
    { email: "owner2@ridgeline.demo", contractorId: northpeak.id, role: "OWNER" },
    { email: "agency@ridgeline.demo", contractorId: northpeak.id, role: "OWNER" },
  ];
  for (const m of memberSpecs) {
    await db.membership.upsert({
      where: { userId_contractorId: { userId: users[m.email], contractorId: m.contractorId } },
      update: {},
      create: { userId: users[m.email], contractorId: m.contractorId, role: m.role },
    });
  }

  return { summit, northpeak, users };
}

export async function runSeed({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (force) await wipe();
  // Idempotent: business fixtures already present → do nothing (existing records are
  // never replaced or duplicated silently).
  if (!force && ((await db.inquiry.count()) > 0 || (await db.contact.count()) > 0)) return;
  const structure = await ensureDemoStructure();
  await seedBusinessData(structure);
}

async function seedBusinessData({ summit, northpeak, users: createdUsers }: DemoStructure): Promise<void> {
  const now = new Date();
  const D = (days: number, hours = 0, minutes = 0) =>
    new Date(now.getTime() + days * 86400000 + hours * 3600000 + minutes * 60000);
  const TZ = "America/Chicago";
  const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const fmtWhen = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

  // ── Summit GHL install (simulated, operator-visible mode) ──
  await db.providerInstall.create({
    data: {
      contractorId: summit.id, provider: "GHL", locationId: "loc_demo_summit",
      status: "CONNECTED", installedByUserId: createdUsers["agency@ridgeline.demo"],
      scopes: "contacts.readonly conversations.write calendars.readonly estimates.write",
      lastCheckedAt: D(-1),
      checkResult: JSON.stringify([
        { name: "OAuth token", state: "passed", detail: "Simulated install — token stored encrypted" },
        { name: "Location mapping", state: "passed", detail: "loc_demo_summit → Summit Roofing Co." },
        { name: "Calendar availability", state: "passed", detail: "Product-managed slots (simulated)" },
        { name: "Sender channels", state: "awaiting", detail: "Pick one SMS sender + one email sender in GHL when configuring" },
        { name: "Webhook delivery", state: "awaiting", detail: "Needs a public APP_BASE_URL" },
      ]),
    },
  });
  await db.providerLink.create({
    data: { contractorId: summit.id, provider: "GHL", entity: "location", localId: summit.id, externalId: "loc_demo_summit" },
  });

  // ── Reporting fixture: 12 mature eligible inquiries ──
  type Fixture = {
    first: string; last: string; phone: string; email?: string; address: string; zip: string;
    source: string; service: string; createdDaysAgo: number; smsConsent: boolean;
    bookedDaysAgo?: number; apptStartDaysAgo?: number; apptStatus?: string; apptNote?: string; estimator?: string;
    estimate?: { number: string; amount: string; status: string; sentDaysAgo?: number; decidedDaysAgo?: number; viewed?: boolean; acceptedDaysAgo?: number; invoicedDaysAgo?: number; reason?: string };
    stage: string;
  };

  const fixtures: Fixture[] = [
    { first: "Ellen", last: "Brooks", phone: "+15125550001", email: "ellen.b@demo.io", address: "901 Blunn Creek Dr", zip: "78704", source: "WEBSITE", service: "REPLACEMENT", createdDaysAgo: 24, smsConsent: true, bookedDaysAgo: 22, apptStartDaysAgo: 20, apptStatus: "COMPLETED", apptNote: "Full replacement recommended.", estimator: createdUsers["estimator@ridgeline.demo"], estimate: { number: "E-1041", amount: "8400", status: "INVOICED", sentDaysAgo: 19, decidedDaysAgo: 17, viewed: true, acceptedDaysAgo: 17, invoicedDaysAgo: 15 }, stage: "WON" },
    { first: "Omar", last: "Haddad", phone: "+15125550002", email: "omar.h@demo.io", address: "1205 S Congress Ave", zip: "78704", source: "REFERRAL", service: "REPAIR", createdDaysAgo: 22, smsConsent: true, bookedDaysAgo: 21, apptStartDaysAgo: 18, apptStatus: "COMPLETED", apptNote: "Flashing repair + shingles.", estimator: createdUsers["estimator@ridgeline.demo"], estimate: { number: "E-1042", amount: "12400", status: "ACCEPTED", sentDaysAgo: 10, decidedDaysAgo: 8, viewed: true, acceptedDaysAgo: 8 }, stage: "WON" },
    { first: "Grace", last: "Nolan", phone: "+15125550003", email: "grace.n@demo.io", address: "3305 Lovell Ave", zip: "78704", source: "WEBSITE", service: "REPLACEMENT", createdDaysAgo: 21, smsConsent: true, bookedDaysAgo: 19, apptStartDaysAgo: 15, apptStatus: "COMPLETED", apptNote: "Hail damage — replacement.", estimator: createdUsers["estimator@ridgeline.demo"], estimate: { number: "E-1043", amount: "6900", status: "VIEWED", sentDaysAgo: 5, viewed: true }, stage: "QUOTED" },
    { first: "Victor", last: "Nguyen", phone: "+15125550004", email: "victor.n@demo.io", address: "712 Kinney Ave", zip: "78704", source: "LANDING_PAGE", service: "REPAIR", createdDaysAgo: 20, smsConsent: true, bookedDaysAgo: 18, apptStartDaysAgo: 14, apptStatus: "COMPLETED", apptNote: "Pipe boot replacement.", estimator: createdUsers["estimator@ridgeline.demo"], estimate: { number: "E-1044", amount: "18200", status: "DECLINED", sentDaysAgo: 12, decidedDaysAgo: 4, viewed: true, reason: "Chose another bidder on price" }, stage: "LOST" },
    { first: "Ines", last: "Fontaine", phone: "+15125550005", email: "ines.f@demo.io", address: "2404 Gardner Rd", zip: "78741", source: "WEBSITE", service: "REPLACEMENT", createdDaysAgo: 19, smsConsent: true, bookedDaysAgo: 17, apptStartDaysAgo: 12, apptStatus: "COMPLETED", apptNote: "Storm damage confirmed — quote in preparation.", estimator: createdUsers["estimator@ridgeline.demo"], stage: "INSPECTED" },
    { first: "Noah", last: "Pierce", phone: "+15125550006", email: "noah.p@demo.io", address: "5103 Sunny Side Ln", zip: "78745", source: "WEBSITE", service: "REPLACEMENT", createdDaysAgo: 18, smsConsent: true, bookedDaysAgo: 16, apptStartDaysAgo: 10, apptStatus: "NO_SHOW", estimator: createdUsers["estimator@ridgeline.demo"], stage: "BOOKED" },
    { first: "Chloe", last: "Diaz", phone: "+15125550007", email: "chloe.d@demo.io", address: "1300 Enfield Cv", zip: "78703", source: "OFFICE", service: "REPAIR", createdDaysAgo: 26, smsConsent: true, bookedDaysAgo: 24, apptStartDaysAgo: 16, apptStatus: "CANCELED", stage: "RESPONDING" },
    { first: "Bella", last: "Krause", phone: "+15125550008", email: "bella.k@demo.io", address: "2201 Wilson St", zip: "78704", source: "WEBSITE", service: "REPLACEMENT", createdDaysAgo: 29, smsConsent: true, stage: "RESPONDING" },
    { first: "Ben", last: "Morrow", phone: "+15125550009", email: "ben.m@demo.io", address: "4512 Duval St", zip: "78751", source: "PHONE_MISSED", service: "REPAIR", createdDaysAgo: 28, smsConsent: true, stage: "RESPONDING" },
    { first: "Bao", last: "Tran", phone: "+15125550010", email: "bao.t@demo.io", address: "6300 Brodie Ln", zip: "78745", source: "WEBSITE", service: "REPLACEMENT", createdDaysAgo: 25, smsConsent: true, stage: "RESPONDING" },
    { first: "Brianna", last: "Cole", phone: "+15125550011", email: "brianna.c@demo.io", address: "900 Red River St", zip: "78701", source: "REFERRAL", service: "INSPECTION", createdDaysAgo: 22, smsConsent: true, stage: "RESPONDING" },
    { first: "Byron", last: "Silva", phone: "+15125550012", email: "byron.s@demo.io", address: "3410 Montopolis Dr", zip: "78741", source: "WEBSITE", service: "REPAIR", createdDaysAgo: 17, smsConsent: true, stage: "RESPONDING" },
  ];

  // Experiment arms: enrolled = the 12 consented fixture contacts (6 per arm).
  // A = indices [0,1,2,7,8,9] → booked in A: Brooks, Haddad, Nolan = 3 (50.0%)
  // B = indices [3,4,5,6,10,11] → booked in B: Nguyen, Fontaine, Pierce, Diaz = 4 (66.7%)
  const ARM_A = new Set([0, 1, 2, 7, 8, 9]);
  const armOf = (idx: number) => (ARM_A.has(idx) ? "A" : "B");

  const experiment = await db.experiment.create({
    data: {
      contractorId: summit.id, name: "Follow-up message A/B",
      status: "RUNNING", messageA: "Checking in on your estimate", messageB: "Questions before you decide?",
      windowDays: 14, minSample: 30, startedAt: D(-30),
    },
  });

  const e1EstimateId = { v: null as string | null };
  const e2EstimateId = { v: null as string | null };
  const e3EstimateId = { v: null as string | null };
  const e1InquiryId = { v: null as string | null };
  const e2InquiryId = { v: null as string | null };
  const e3InquiryId = { v: null as string | null };

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const contact = await db.contact.create({
      data: {
        contractorId: summit.id, firstName: f.first, lastName: f.last,
        email: f.email, phone: f.phone,
        addressLine1: f.address, city: "Austin", state: "TX", zip: f.zip,
        preferredChannel: f.smsConsent ? "sms" : "phone",
        smsConsent: f.smsConsent, emailConsent: true,
      },
    });
    await db.consentEvent.create({
      data: {
        contractorId: summit.id, contactId: contact.id, channel: "SMS", granted: true,
        basis: f.source === "OFFICE" ? "OFFICE_ENTERED" : "WEB_FORM", wordingVersion: "v1",
        sourceLabel: f.source === "OFFICE" ? "Entered by office staff" : "Website estimate form",
        recordedAt: D(-f.createdDaysAgo),
      },
    });
    const inquiry = await db.inquiry.create({
      data: {
        contractorId: summit.id, contactId: contact.id,
        serviceType: f.service, serviceZip: f.zip,
        source: f.source, firstSource: f.source,
        stage: f.stage, ownerUserId: f.estimator ?? null,
        createdAt: D(-f.createdDaysAgo),
        quotedValue: f.estimate?.amount ?? null,
        acceptedValue: f.estimate && (f.estimate.status === "ACCEPTED" || f.estimate.status === "INVOICED") ? f.estimate.amount : null,
        lostReason: f.estimate?.status === "DECLINED" ? f.estimate.reason : null,
        ghlOpportunityId: `opp_demo_${i + 1}`,
      },
    });
    if (f.first === "Ellen") e1InquiryId.v = inquiry.id;
    if (f.first === "Omar") e2InquiryId.v = inquiry.id;
    if (f.first === "Grace") e3InquiryId.v = inquiry.id;

    await db.touchpoint.create({
      data: {
        contractorId: summit.id, inquiryId: inquiry.id, kind: "SOURCE",
        label: `First known source: ${f.source === "LANDING_PAGE" ? "landing page tag (spring-promo)" : f.source.replace(/_/g, " ").toLowerCase()}`,
        occurredAt: D(-f.createdDaysAgo),
      },
    });

    if (f.bookedDaysAgo !== undefined && f.apptStartDaysAgo !== undefined) {
      const start = D(-f.apptStartDaysAgo, 10, 0);
      await db.appointment.create({
        data: {
          contractorId: summit.id, inquiryId: inquiry.id,
          startAt: start, endAt: new Date(start.getTime() + 3600000),
          timezone: TZ, estimatorId: f.estimator ?? null,
          status: f.apptStatus ?? "BOOKED",
          bookedBy: f.source === "OFFICE" ? "OFFICE" : "CUSTOMER",
          manageToken: randomToken(16), manageExpiresAt: D(30),
          outcomeNote: f.apptNote ?? null,
          createdAt: D(-f.bookedDaysAgo, 9, 15),
        },
      });
      await db.activity.create({
        data: {
          contractorId: summit.id, inquiryId: inquiry.id,
          actorType: f.source === "OFFICE" ? "STAFF" : "CUSTOMER",
          actorLabel: f.source === "OFFICE" ? "Marcus Lee" : `${f.first} (self-booking)`,
          kind: "APPOINTMENT",
          message: `Inspection booked — visit ${fmtWhen(start)}`,
          createdAt: D(-f.bookedDaysAgo, 9, 15),
        },
      });
      if (f.apptStatus === "COMPLETED" && f.apptNote) {
        await db.activity.create({
          data: {
            contractorId: summit.id, inquiryId: inquiry.id,
            actorType: "STAFF", actorLabel: "Alex Rivera", kind: "APPOINTMENT",
            message: `Visit completed — ${f.apptNote}`,
            createdAt: start,
          },
        });
      }
    }

    if (f.estimate) {
      const est = await db.estimate.create({
        data: {
          contractorId: summit.id, inquiryId: inquiry.id,
          number: f.estimate.number, amount: f.estimate.amount, currency: "USD",
          status: f.estimate.status, ownerUserId: createdUsers["office@ridgeline.demo"],
          sentAt: f.estimate.sentDaysAgo !== undefined ? D(-f.estimate.sentDaysAgo, 14, 0) : null,
          viewedAt: f.estimate.viewed && f.estimate.sentDaysAgo !== undefined ? D(-f.estimate.sentDaysAgo, 18, 0) : null,
          acceptedAt: f.estimate.acceptedDaysAgo !== undefined ? D(-f.estimate.acceptedDaysAgo, 16, 0) : null,
          decidedAt: f.estimate.decidedDaysAgo !== undefined ? D(-f.estimate.decidedDaysAgo, 16, 0) : null,
          invoicedAt: f.estimate.invoicedDaysAgo !== undefined ? D(-f.estimate.invoicedDaysAgo, 15, 0) : null,
          createdAt: f.estimate.sentDaysAgo !== undefined ? D(-f.estimate.sentDaysAgo, 13, 0) : D(-f.createdDaysAgo + 2),
        },
      });
      if (f.first === "Ellen") e1EstimateId.v = est.id;
      if (f.first === "Omar") e2EstimateId.v = est.id;
      if (f.first === "Grace") e3EstimateId.v = est.id;
      await db.activity.create({
        data: {
          contractorId: summit.id, inquiryId: inquiry.id,
          actorType: "STAFF", actorLabel: "Marcus Lee", kind: "ESTIMATE",
          message: `Estimate ${f.estimate.number} for $${parseInt(f.estimate.amount).toLocaleString()} sent`,
          createdAt: D(-(f.estimate.sentDaysAgo ?? f.createdDaysAgo), 14, 0),
        },
      });
    }

    if (f.smsConsent) {
      await db.experimentAssignment.create({
        data: { experimentId: experiment.id, contactId: contact.id, inquiryId: inquiry.id, arm: armOf(i), enrolledAt: D(-f.createdDaysAgo) },
      });
    }
  }

  // Ines Fontaine (E5): inspected 12d ago, quote not yet sent → Today action
  await db.task.create({
    data: {
      contractorId: summit.id, inquiryId: e1InquiryId.v === null ? null : (await db.inquiry.findFirst({ where: { contractorId: summit.id, contact: { firstName: "Ines" } } }))!.id,
      kind: "PREPARE_QUOTE",
      title: "Send storm-damage quote — Ines Fontaine",
      detail: "Visit completed 12 days ago; quote still in preparation. This task is overdue.",
      dueAt: D(-4, 15, 0), createdBy: "AUTOMATION",
      assignedUserId: createdUsers["office@ridgeline.demo"],
    },
  });

  // ── Payments: receipts 1,200 + 300, refund 100 → 1,400 collected; 450 unmatched ──
  if (e1InquiryId.v && e1EstimateId.v) {
    await db.payment.create({
      data: {
        contractorId: summit.id, inquiryId: e1InquiryId.v, estimateId: e1EstimateId.v,
        provider: "JOBBER", providerTxnId: "jbl_pay_1001", amount: "1200", currency: "USD",
        kind: "PAYMENT", status: "SETTLED", matchedByUserId: createdUsers["office@ridgeline.demo"],
        matchedAt: D(-14), occurredAt: D(-14),
      },
    });
    await db.payment.create({
      data: {
        contractorId: summit.id, inquiryId: e1InquiryId.v, estimateId: e1EstimateId.v,
        provider: "JOBBER", providerTxnId: "jbl_ref_1002", amount: "100", currency: "USD",
        kind: "REFUND", status: "SETTLED", matchedByUserId: createdUsers["office@ridgeline.demo"],
        matchedAt: D(-5), occurredAt: D(-5), note: "Partial refund — material credit",
      },
    });
    await db.touchpoint.create({
      data: { contractorId: summit.id, inquiryId: e1InquiryId.v, kind: "PAYMENT", label: "Payment $1,200 matched (Jobber jbl_pay_1001)", occurredAt: D(-14) },
    });
  }
  if (e2InquiryId.v) {
    await db.payment.create({
      data: {
        contractorId: summit.id, inquiryId: e2InquiryId.v,
        provider: "MANUAL", providerTxnId: "man_pay_2001", amount: "300", currency: "USD",
        kind: "PAYMENT", status: "SETTLED", matchedByUserId: createdUsers["office@ridgeline.demo"],
        matchedAt: D(-6), occurredAt: D(-6), note: "Deposit collected by phone",
      },
    });
  }
  await db.payment.create({
    data: {
      contractorId: summit.id, provider: "JOBBER", providerTxnId: "jbl_pay_unmatched",
      amount: "450", currency: "USD", kind: "PAYMENT", status: "UNMATCHED",
      occurredAt: D(-2), note: "Imported from Jobber — no inquiry match found",
    },
  });
  await db.task.create({
    data: {
      contractorId: summit.id, kind: "REVIEW_MATCH",
      title: "Review payment match — $450 from Jobber",
      detail: "No inquiry link found. Confirm which job this belongs to.",
      dueAt: D(0, 17, 0), createdBy: "AUTOMATION",
      assignedUserId: createdUsers["office@ridgeline.demo"],
    },
  });

  // ── Jordan Reyes — the busy-Monday protagonist (live this week) ──
  const jordan = await db.contact.create({
    data: {
      contractorId: summit.id, firstName: "Jordan", lastName: "Reyes",
      email: "jordan.reyes@demo.io", phone: "+15125550777",
      addressLine1: "1809 Travis Heights Blvd", city: "Austin", state: "TX", zip: "78704",
      preferredChannel: "sms", smsConsent: true, emailConsent: true,
    },
  });
  await db.consentEvent.create({
    data: {
      contractorId: summit.id, contactId: jordan.id, channel: "SMS", granted: true,
      basis: "WEB_FORM", wordingVersion: "v1", sourceLabel: "Website estimate form",
      recordedAt: D(-5, 18, 40),
    },
  });
  const jordanInq = await db.inquiry.create({
    data: {
      contractorId: summit.id, contactId: jordan.id,
      serviceType: "REPLACEMENT", serviceZip: "78704",
      source: "WEBSITE", firstSource: "WEBSITE", stage: "BOOKED",
      ownerUserId: createdUsers["estimator@ridgeline.demo"],
      createdAt: D(-5, 18, 40),
      ghlOpportunityId: "opp_demo_jordan",
    },
  });
  // Friday-evening request → booking link held until the next permitted contact window
  const linkScheduled = D(-5, 18, 42);
  const linkSent = new Date(nextWindowStart(linkScheduled, TZ, DEFAULT_WORKING_HOURS).getTime() + 60000);
  await db.outboxMessage.create({
    data: {
      contractorId: summit.id, inquiryId: jordanInq.id, contactId: jordan.id,
      channel: "SMS", templateKey: "BOOKING_LINK",
      body: bookingLinkBody(jordan, "REPLACEMENT", summit, BASE, jordanInq.publicToken),
      scheduledFor: linkScheduled, sentAt: linkSent, status: "SENT",
      dedupeKey: `booklink:${jordanInq.id}`, providerMessageId: "demo_seed_001",
    },
  });
  await db.activity.create({
    data: {
      contractorId: summit.id, inquiryId: jordanInq.id,
      actorType: "AUTOMATION", actorLabel: "SMS", kind: "MESSAGE",
      message: "Booking link sent (held until the next contact window)",
      createdAt: linkSent,
    },
  });
  await db.activity.create({
    data: {
      contractorId: summit.id, inquiryId: jordanInq.id,
      actorType: "CUSTOMER", actorLabel: "Jordan (self-booking)",
      kind: "APPOINTMENT", message: "Inspection booked — reminder scheduled for 24h before",
      createdAt: D(-3, 9, 5),
    },
  });
  await db.activity.create({
    data: {
      contractorId: summit.id, inquiryId: jordanInq.id,
      actorType: "CUSTOMER", actorLabel: "Jordan (self-serve)",
      kind: "APPOINTMENT", message: "Rescheduled — reminder recalculated for the new time, old one canceled",
      createdAt: D(-2, 12, 0),
    },
  });
  const jordanVisit = sameDayAt(now, 9, 0);
  const jordanAppt = await db.appointment.create({
    data: {
      contractorId: summit.id, inquiryId: jordanInq.id,
      startAt: jordanVisit, endAt: new Date(jordanVisit.getTime() + 3600000),
      timezone: TZ, estimatorId: createdUsers["estimator@ridgeline.demo"],
      status: "BOOKED", bookedBy: "CUSTOMER",
      manageToken: randomToken(16), manageExpiresAt: D(28),
      createdAt: D(-3, 9, 5),
    },
  });
  const jordanReminderAt = new Date(jordanVisit.getTime() - summit.reminderHoursBefore * 3600000);
  await db.outboxMessage.create({
    data: {
      contractorId: summit.id, inquiryId: jordanInq.id, contactId: jordan.id,
      channel: "SMS", templateKey: "REMINDER",
      body: reminderBody(jordan, fmtWhen(jordanVisit), summit, "1809 Travis Heights Blvd"),
      scheduledFor: jordanReminderAt,
      sentAt: new Date(jordanReminderAt.getTime() + 60000),
      status: "SENT", dedupeKey: `rem:${jordanAppt.id}`, providerMessageId: "demo_seed_002",
    },
  });

  // ── Today's other live inspections (immature cohort) ──
  const rosa = await db.contact.create({
    data: {
      contractorId: summit.id, firstName: "Rosa", lastName: "Alvarez", email: "rosa.a@demo.io",
      phone: "+15125550801", addressLine1: "705 Bouldin Creek St", city: "Austin", state: "TX", zip: "78704",
      preferredChannel: "sms", smsConsent: true, emailConsent: true,
    },
  });
  const rosaInq = await db.inquiry.create({
    data: {
      contractorId: summit.id, contactId: rosa.id,
      serviceType: "REPAIR", serviceZip: "78704", source: "WEBSITE", firstSource: "WEBSITE",
      stage: "BOOKED", ownerUserId: createdUsers["estimator@ridgeline.demo"], createdAt: D(-3, 11, 0),
    },
  });
  const rosaVisit = sameDayAt(now, 10, 0);
  await db.appointment.create({
    data: {
      contractorId: summit.id, inquiryId: rosaInq.id,
      startAt: rosaVisit, endAt: new Date(rosaVisit.getTime() + 3600000),
      timezone: TZ, estimatorId: createdUsers["estimator@ridgeline.demo"],
      status: "BOOKED", bookedBy: "CUSTOMER", manageToken: randomToken(16), manageExpiresAt: D(28),
      createdAt: D(-3, 11, 5),
    },
  });
  const devon = await db.contact.create({
    data: {
      contractorId: summit.id, firstName: "Devon", lastName: "Clarke", email: "devon.c@demo.io",
      phone: "+15125550802", addressLine1: "2255 Woodward St", city: "Austin", state: "TX", zip: "78741",
      preferredChannel: "phone", emailConsent: true, smsConsent: false,
    },
  });
  const devonInq = await db.inquiry.create({
    data: {
      contractorId: summit.id, contactId: devon.id,
      serviceType: "INSPECTION", serviceZip: "78741", source: "REFERRAL", firstSource: "REFERRAL",
      stage: "BOOKED", ownerUserId: createdUsers["estimator@ridgeline.demo"], createdAt: D(-2, 15, 0),
    },
  });
  const devonVisit = sameDayAt(now, 14, 0);
  await db.appointment.create({
    data: {
      contractorId: summit.id, inquiryId: devonInq.id,
      startAt: devonVisit, endAt: new Date(devonVisit.getTime() + 3600000),
      timezone: TZ, estimatorId: createdUsers["estimator@ridgeline.demo"],
      status: "BOOKED", bookedBy: "OFFICE", manageToken: randomToken(16), manageExpiresAt: D(28),
      createdAt: D(-2, 15, 10),
    },
  });

  // ── Immediate office work: overdue callback (no consent) + respond task ──
  const marcus = await db.contact.create({
    data: {
      contractorId: summit.id, firstName: "Marcus", lastName: "Webb", email: "marcus.webb@demo.io",
      phone: "+15125550803", addressLine1: "1502 Milton St", city: "Austin", state: "TX", zip: "78749",
      preferredChannel: "phone", emailConsent: false, smsConsent: false,
    },
  });
  const marcusInq = await db.inquiry.create({
    data: {
      contractorId: summit.id, contactId: marcus.id,
      serviceType: "REPAIR", serviceZip: "78749", source: "PHONE_MISSED", firstSource: "PHONE_MISSED",
      stage: "NEW", createdAt: D(0, -2, 0),
    },
  });
  await db.task.create({
    data: {
      contractorId: summit.id, inquiryId: marcusInq.id, kind: "CALLBACK",
      title: "Call Marcus Webb — missed call",
      detail: "Roof repair request, ZIP 78749. No SMS permission — call directly.",
      dueAt: D(0, -1, 30), createdBy: "AUTOMATION",
      assignedUserId: createdUsers["office@ridgeline.demo"], dedupeKey: `callback:${marcusInq.id}`,
    },
  });
  const parker = await db.contact.create({
    data: {
      contractorId: summit.id, firstName: "Parker", lastName: "Lind", email: "parker.l@demo.io",
      phone: "+15125550804", addressLine1: "3311 First St", city: "Austin", state: "TX", zip: "78745",
      preferredChannel: "email", emailConsent: true, smsConsent: false,
    },
  });
  const parkerInq = await db.inquiry.create({
    data: {
      contractorId: summit.id, contactId: parker.id,
      serviceType: "REPLACEMENT", serviceZip: "78745", source: "WEBSITE", firstSource: "WEBSITE",
      stage: "NEW", createdAt: D(0, -3, 0),
    },
  });
  await db.task.create({
    data: {
      contractorId: summit.id, inquiryId: parkerInq.id, kind: "RESPOND",
      title: "Respond to Parker Lind — roof replacement",
      detail: "No SMS permission on file — call the customer.",
      dueAt: D(0, 2, 0), createdBy: "AUTOMATION",
      assignedUserId: createdUsers["office@ridgeline.demo"],
    },
  });

  // Follow-up task for aging estimate E-1043 + its future scheduled nudge
  if (e3InquiryId.v && e3EstimateId.v) {
    await db.task.create({
      data: {
        contractorId: summit.id, inquiryId: e3InquiryId.v, kind: "FOLLOW_UP",
        title: "Call about estimate E-1043 — viewed, no reply",
        detail: "Sent 5d ago, viewed same day. Automated chase running; a personal call is recommended.",
        dueAt: D(0, 15, 0), createdBy: "AUTOMATION",
        assignedUserId: createdUsers["office@ridgeline.demo"],
      },
    });
    await db.outboxMessage.create({
      data: {
        contractorId: summit.id, inquiryId: e3InquiryId.v, contactId: (await db.inquiry.findUnique({ where: { id: e3InquiryId.v } }))!.contactId,
        channel: "SMS", templateKey: "FOLLOW_UP",
        body: followUpBody({ firstName: "Grace", lastName: "Nolan" }, { amount: "6900", currency: "USD", number: "E-1043" }, summit, "A"),
        scheduledFor: D(2, 9, 0), status: "SCHEDULED", dedupeKey: `estnudge:${e3EstimateId.v}:7`,
      },
    });
  }
  // Stop-rule evidence: a chase canceled by acceptance
  if (e2InquiryId.v && e2EstimateId.v) {
    await db.outboxMessage.create({
      data: {
        contractorId: summit.id, inquiryId: e2InquiryId.v, contactId: (await db.inquiry.findUnique({ where: { id: e2InquiryId.v } }))!.contactId,
        channel: "SMS", templateKey: "FOLLOW_UP",
        body: followUpBody({ firstName: "Omar", lastName: "Haddad" }, { amount: "12400", currency: "USD", number: "E-1042" }, summit),
        scheduledFor: D(-7, 10, 0), status: "CANCELED", stoppedReason: "Estimate accepted",
        dedupeKey: `estnudge:${e2EstimateId.v}:3`,
      },
    });
  }
  // Stop-rule evidence: missed-call auto-reply suppressed for a no-consent inquiry
  const benInq = await db.inquiry.findFirst({ where: { contractorId: summit.id, contact: { firstName: "Ben" } } });
  if (benInq) {
    await db.outboxMessage.create({
      data: {
        contractorId: summit.id, inquiryId: benInq.id, contactId: benInq.contactId,
        channel: "SMS", templateKey: "MISSED_YOU",
        body: missedYouBody({ firstName: "Ben", lastName: "Morrow" }, summit, BASE, benInq.publicToken),
        scheduledFor: D(-27, 10, 0), status: "CANCELED", stoppedReason: "No SMS permission — routed to office",
        dedupeKey: `missedyou:${benInq.id}`,
      },
    });
  }

  // ── Connector recovery fixtures (ProviderEvents) ──
  await db.providerEvent.createMany({
    data: [
      {
        contractorId: summit.id, provider: "GHL", eventType: "EstimateStatusUpdate",
        externalId: "ghl_evt_001", payload: JSON.stringify({ estimateId: "E-1041", status: "sent" }),
        signatureValid: true, status: "PROCESSED", receivedAt: D(-19, 14, 2), processedAt: D(-19, 14, 2),
      },
      {
        contractorId: summit.id, provider: "GHL", eventType: "EstimateStatusUpdate",
        externalId: "ghl_evt_002", payload: JSON.stringify({ estimateId: "E-1041", status: "accepted" }),
        signatureValid: true, status: "PROCESSED", receivedAt: D(-17, 16, 0), processedAt: D(-17, 16, 0),
      },
      {
        contractorId: summit.id, provider: "GHL", eventType: "EstimateStatusUpdate",
        externalId: "ghl_evt_003", payload: JSON.stringify({ estimateId: "E-1041", status: "sent" }),
        signatureValid: true, status: "SKIPPED_DUPLICATE", receivedAt: D(-17, 16, 5),
        processError: "Duplicate of ghl_evt_001 — deduped by external event id",
      },
      {
        contractorId: summit.id, provider: "GHL", eventType: "EstimateStatusUpdate",
        externalId: "ghl_evt_004", payload: JSON.stringify({ estimateId: "E-1041", status: "sent" }),
        signatureValid: true, status: "SKIPPED_OUT_OF_ORDER", receivedAt: D(-15, 10, 0),
        processError: "Late 'sent' for an already accepted estimate — not re-opening",
      },
      {
        contractorId: null, provider: "GHL", eventType: "ContactCreate",
        externalId: "ghl_evt_005", payload: JSON.stringify({ locationId: "loc_unknown_999" }),
        signatureValid: true, status: "FAILED", attempts: 3, receivedAt: D(-1, 9, 0),
        processError: "Unknown GHL location — no installed contractor matches locationId 'loc_unknown_999'",
      },
    ],
  });

  // ── North Peak Exteriors: onboarding tenant (isolation + empty states) ──
  const npC1 = await db.contact.create({
    data: {
      contractorId: northpeak.id, firstName: "Casey", lastName: "Morgan", email: "casey.m@demo.io",
      phone: "+13035550011", addressLine1: "411 Mapleton Ave", city: "Boulder", state: "CO", zip: "80302",
      preferredChannel: "sms", smsConsent: true, emailConsent: true,
    },
  });
  await db.inquiry.create({
    data: {
      contractorId: northpeak.id, contactId: npC1.id,
      serviceType: "REPLACEMENT", serviceZip: "80302", source: "WEBSITE", firstSource: "WEBSITE",
      stage: "NEW", createdAt: D(0, -4, 0),
    },
  });
  const npC2 = await db.contact.create({
    data: {
      contractorId: northpeak.id, firstName: "Terry", lastName: "Osei", phone: "+13035550012",
      addressLine1: "90 Arapahoe Ave", city: "Boulder", state: "CO", zip: "80302",
      preferredChannel: "phone", smsConsent: false, emailConsent: false,
    },
  });
  const npInq2 = await db.inquiry.create({
    data: {
      contractorId: northpeak.id, contactId: npC2.id,
      serviceType: "REPAIR", serviceZip: "80302", source: "PHONE_MISSED", firstSource: "PHONE_MISSED",
      stage: "NEW", createdAt: D(0, -3, 30),
    },
  });
  await db.task.create({
    data: {
      contractorId: northpeak.id, inquiryId: npInq2.id, kind: "CALLBACK",
      title: "Call Terry Osei — missed call",
      detail: "Roof repair, ZIP 80302. No SMS permission — call directly.",
      dueAt: D(0, -2, 0), createdBy: "AUTOMATION",
      assignedUserId: createdUsers["owner2@ridgeline.demo"], dedupeKey: `callback:${npInq2.id}`,
    },
  });

  await db.demoState.upsert({
    where: { id: "singleton" },
    update: { seededAt: now },
    create: { id: "singleton", seededAt: now },
  });
  await db.auditEvent.create({
    data: { action: "SEED", entity: "system", meta: "Deterministic demo fixtures installed" },
  });
}

function sameDayAt(base: Date, h: number, m: number): Date {
  const p = tzParts(base, "America/Chicago");
  return wallToUtc("America/Chicago", p.year, p.month, p.day, h, m);
}

export async function wipe(): Promise<void> {
  // Deletion order respects FK constraints: children before parents. BackgroundJob
  // and AuditEvent hold relations to Contractor/User and MUST go before them (the
  // previous order left them behind and made a wipe fail partway through).
  await wipeBusinessData();
  await db.membership.deleteMany();
  await db.auditEvent.deleteMany();
  await db.user.deleteMany();
  await db.contractor.deleteMany();
  await db.agency.deleteMany();
  await db.demoState.deleteMany();
}

/**
 * Remove demo BUSINESS data only — contacts, pipeline, appointments, estimates, tasks,
 * payments, automations, connector state and experiments. Accounts (User), the agency,
 * contractor profiles, memberships, the audit trail and DemoState survive, so the
 * currently signed-in session stays valid: "Remove demo data" must never sign anyone
 * out. FK-safe order: children before parents.
 */
export async function wipeBusinessData(): Promise<void> {
  await db.experimentAssignment.deleteMany();
  await db.experiment.deleteMany();
  await db.providerLink.deleteMany();
  await db.syncCursor.deleteMany();
  await db.providerEvent.deleteMany();
  await db.providerInstall.deleteMany();
  await db.payment.deleteMany();
  await db.outboxMessage.deleteMany();
  await db.backgroundJob.deleteMany();
  await db.aIInteraction.deleteMany();
  await db.apiKey.deleteMany();
  await db.consentEvent.deleteMany();
  await db.activity.deleteMany();
  await db.touchpoint.deleteMany();
  await db.task.deleteMany();
  await db.estimate.deleteMany();
  await db.appointment.deleteMany();
  await db.inquiry.deleteMany();
  await db.contact.deleteMany();
}

export async function resetDemo(): Promise<void> {
  await wipe();
  await runSeed({ force: true });
}
