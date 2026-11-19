import { db } from "@/lib/db";
import { route, ApiError, requireAccess } from "@/lib/api";
import { NextResponse } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";

/**
 * GET /api/reports/export?metric=...&days=30 — CSV export scoped to the same filters the
 * operator sees on screen. Response is text/csv.
 */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") ?? "bookings";
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10)));
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const now = await demoNow();
  const start = new Date(now.getTime() - days * 86400000);
  const matureCutoff = new Date(now.getTime() - 14 * 86400000);

  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = (headers: string[], rows: unknown[][]) =>
    [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");

  let body = "";
  if (metric === "bookings") {
    const inquiries = await db.inquiry.findMany({
      where: { contractorId: contractor.id, isTest: false, isDuplicate: false, createdAt: { gte: start, lte: now } },
      include: { appointments: { orderBy: { createdAt: "asc" } }, contact: true },
    });
    body = csv(
      ["inquiry_id", "contact", "created_at", "mature", "booked_within_14d", "first_booking_at", "stage"],
      inquiries.map((i) => [
        i.id, `${i.contact.firstName} ${i.contact.lastName}`.trim(), i.createdAt.toISOString(),
        i.createdAt <= matureCutoff ? "yes" : "no",
        i.appointments.some((a) => a.createdAt.getTime() <= i.createdAt.getTime() + 14 * 86400000) ? "yes" : "no",
        i.appointments[0]?.createdAt.toISOString() ?? "", i.stage,
      ])
    );
  } else if (metric === "attendance") {
    const appts = await db.appointment.findMany({
      where: { contractorId: contractor.id, startAt: { gte: start, lte: now } },
      include: { inquiry: { include: { contact: true } } },
    });
    body = csv(
      ["appointment_id", "contact", "start_at", "status", "note"],
      appts.map((a) => [a.id, `${a.inquiry.contact.firstName} ${a.inquiry.contact.lastName}`.trim(), a.startAt.toISOString(), a.status, a.outcomeNote ?? ""])
    );
  } else if (metric === "estimates") {
    const estimates = await db.estimate.findMany({
      where: { contractorId: contractor.id, sentAt: { not: null, gte: start, lte: now } },
      include: { inquiry: { include: { contact: true } } },
    });
    body = csv(
      ["estimate_number", "contact", "amount", "currency", "status", "sent_at", "accepted_at"],
      estimates.map((e) => [e.number, `${e.inquiry.contact.firstName} ${e.inquiry.contact.lastName}`.trim(), e.amount.toString(), e.currency, e.status, e.sentAt?.toISOString() ?? "", e.acceptedAt?.toISOString() ?? ""])
    );
  } else if (metric === "payments") {
    const payments = await db.payment.findMany({
      where: { contractorId: contractor.id, occurredAt: { gte: start, lte: now } },
      include: { inquiry: { include: { contact: true } } },
    });
    body = csv(
      ["txn_id", "provider", "kind", "amount", "currency", "status", "occurred_at", "matched_inquiry"],
      payments.map((p) => [p.providerTxnId, p.provider, p.kind, p.amount.toString(), p.currency, p.status, p.occurredAt.toISOString(), p.inquiry ? `${p.inquiry.contact.firstName} ${p.inquiry.contact.lastName}`.trim() : ""])
    );
  } else {
    throw new ApiError(400, "Unknown metric");
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ridgeline-${metric}-${localDayKey(now, contractor.timezone)}.csv"`,
    },
  });
});

function localDayKey(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
