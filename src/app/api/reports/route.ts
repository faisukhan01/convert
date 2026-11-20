import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";
import { localDayKey, wallToUtc, tzParts } from "@/lib/time";

/**
 * GET /api/reports?days=30 — the four trust metrics in plain English, computed with the
 * same queries that drive drill-down and CSV export. Default timezone: contractor local.
 * Booking rate: eligible inquiries created in the period, not test/duplicate, with a first
 * confirmed booking within 14 days of creation, over eligible inquiries. Immature cohorts
 * (created < 14 days ago) are shown separately. Reschedules count once; later cancellation
 * does not erase the historical booking.
 */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10)));
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const now = await demoNow();
  const start = new Date(now.getTime() - days * 86400000);
  const matureCutoff = new Date(now.getTime() - 14 * 86400000);

  const inquiries = await db.inquiry.findMany({
    where: { contractorId: contractor.id, isTest: false, isDuplicate: false, createdAt: { gte: start, lte: now } },
    include: { appointments: { orderBy: { createdAt: "asc" } }, estimates: true },
  });
  const mature = inquiries.filter((i) => i.createdAt <= matureCutoff);
  const immature = inquiries.filter((i) => i.createdAt > matureCutoff);
  const booked = mature.filter((i) =>
    i.appointments.some((a) => a.createdAt.getTime() <= i.createdAt.getTime() + 14 * 86400000)
  );

  const appointments = await db.appointment.findMany({
    where: { contractorId: contractor.id, startAt: { gte: start, lte: now } },
    include: { inquiry: { include: { contact: true } } },
    orderBy: { startAt: "desc" },
  });
  const held = appointments.filter((a) => a.status === "COMPLETED");
  const noShow = appointments.filter((a) => a.status === "NO_SHOW");
  const canceled = appointments.filter((a) => a.status === "CANCELED");
  // past visits whose outcome is still unknown
  const unknownOutcome = await db.appointment.findMany({
    where: { contractorId: contractor.id, status: "BOOKED", startAt: { lt: now, gte: start } },
    include: { inquiry: { include: { contact: true } } },
    orderBy: { startAt: "asc" },
  });

  const estimates = await db.estimate.findMany({
    where: { contractorId: contractor.id, sentAt: { not: null, gte: start, lte: now } },
    include: { inquiry: { include: { contact: true } } },
  });
  const accepted = estimates.filter((e) => e.status === "ACCEPTED" || e.status === "INVOICED" || e.acceptedAt !== null);
  const stillOpen = await db.estimate.findMany({
    where: { contractorId: contractor.id, status: { in: ["SENT", "VIEWED"] } },
    include: { inquiry: { include: { contact: true } } },
  });

  const payments = await db.payment.findMany({
    where: { contractorId: contractor.id, status: "SETTLED", occurredAt: { gte: start, lte: now } },
    include: { inquiry: { include: { contact: true } } },
    orderBy: { occurredAt: "desc" },
  });
  const receipts = payments.filter((p) => p.kind === "PAYMENT" && p.inquiryId);
  const refunds = payments.filter((p) => p.kind === "REFUND");
  const unmatched = await db.payment.findMany({
    where: { contractorId: contractor.id, status: "UNMATCHED" },
    include: { inquiry: true },
  });
  const sum = (arr: { amount: { toString(): string }; currency: string }[], filter?: (p: never) => boolean) =>
    arr.reduce((a: number, p) => a + parseFloat(p.amount.toString()), 0);
  const net = sum(receipts) - sum(refunds);
  const currencies = Array.from(new Set(payments.map((p) => p.currency)));
  const bySource: Record<string, number> = {};
  for (const p of [...receipts, ...refunds]) {
    const key = `${p.provider}:${p.kind}`;
    bySource[key] = (bySource[key] ?? 0) + parseFloat(p.amount.toString());
  }

  // Experiment arms
  const experiments = await db.experiment.findMany({
    where: { contractorId: contractor.id },
    include: { assignments: true },
    orderBy: { startedAt: "desc" },
  });
  const experimentResults = [] as unknown[];
  for (const exp of experiments) {
    const arms: Record<string, { enrolled: number; booked: number }> = { A: { enrolled: 0, booked: 0 }, B: { enrolled: 0, booked: 0 } };
    for (const a of exp.assignments) {
      if (!arms[a.arm]) continue;
      arms[a.arm].enrolled++;
      if (a.inquiryId) {
        const appt = await db.appointment.findFirst({
          where: {
            inquiryId: a.inquiryId,
            createdAt: { lte: new Date(a.enrolledAt.getTime() + exp.windowDays * 86400000) },
          },
        });
        if (appt) arms[a.arm].booked++;
      }
    }
    const rateA = arms.A.enrolled ? arms.A.booked / arms.A.enrolled : null;
    const rateB = arms.B.enrolled ? arms.B.booked / arms.B.enrolled : null;
    experimentResults.push({
      id: exp.id, name: exp.name, status: exp.status, routeToArm: exp.routeToArm,
      minSample: exp.minSample, windowDays: exp.windowDays,
      arms,
      rateA: rateA !== null ? rateA * 100 : null,
      rateB: rateB !== null ? rateB * 100 : null,
      diffPp: rateA !== null && rateB !== null ? (rateB - rateA) * 100 : null,
      inconclusive: Math.min(arms.A.enrolled, arms.B.enrolled) < exp.minSample,
    });
  }

  return json({
    period: { days, start: start.toISOString(), end: now.toISOString(), timezone: contractor.timezone },
    bookingRate: {
      numerator: booked.length, denominator: mature.length,
      rate: mature.length ? (booked.length / mature.length) * 100 : null,
      immatureCount: immature.length,
    },
    attendance: {
      held: held.length, noShow: noShow.length, canceled: canceled.length,
      showRate: held.length + noShow.length ? (held.length / (held.length + noShow.length)) * 100 : null,
      unknownOutcomeCount: unknownOutcome.length,
    },
    acceptance: {
      sent: estimates.length, accepted: accepted.length,
      rate: estimates.length ? (accepted.length / estimates.length) * 100 : null,
      openCount: stillOpen.length,
    },
    revenue: {
      receipts: sum(receipts), refunds: sum(refunds), net,
      currencies, bySource,
      unmatchedCount: unmatched.length, unmatchedTotal: sum(unmatched),
      matchedCount: receipts.length,
    },
    experiments: experimentResults,
  });
});
void localDayKey; void wallToUtc; void tzParts;
