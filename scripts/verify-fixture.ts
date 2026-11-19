/** Fixture contract check: 58.3% booking, 83.3% show, 50% acceptance, $1,400 collected. */
import { db } from "@/lib/db";

async function main() {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400000);
  const summit = await db.contractor.findFirst({ where: { slug: "summit" } });
  if (!summit) throw new Error("no summit");

  const inquiries = await db.inquiry.findMany({
    where: { contractorId: summit.id, isTest: false, isDuplicate: false, createdAt: { gte: start } },
    include: { appointments: true, estimates: true },
  });
  const mature = inquiries.filter((i) => i.createdAt.getTime() <= now.getTime() - 14 * 86400000);
  const booked = mature.filter((i) => i.appointments.some((a) => a.createdAt.getTime() <= i.createdAt.getTime() + 14 * 86400000));
  const immature = inquiries.filter((i) => i.createdAt.getTime() > now.getTime() - 14 * 86400000);

  const appts = await db.appointment.findMany({ where: { contractorId: summit.id, startAt: { gte: start } } });
  const held = appts.filter((a) => a.status === "COMPLETED");
  const noShow = appts.filter((a) => a.status === "NO_SHOW");
  const canceled = appts.filter((a) => a.status === "CANCELED");

  const estimates = await db.estimate.findMany({ where: { contractorId: summit.id, sentAt: { gte: start, not: null } } });
  const accepted = estimates.filter((e) => ["ACCEPTED", "INVOICED"].includes(e.status) || e.acceptedAt);

  const pays = await db.payment.findMany({ where: { contractorId: summit.id, status: "SETTLED", occurredAt: { gte: start } } });
  const receipts = pays.filter((p) => p.kind === "PAYMENT" && !p.inquiryId === false);
  const matchedReceipts = pays.filter((p) => p.kind === "PAYMENT" && p.inquiryId);
  const refunds = pays.filter((p) => p.kind === "REFUND");
  const unmatched = await db.payment.findMany({ where: { contractorId: summit.id, status: "UNMATCHED" } });

  const sum = (arr: typeof pays) => arr.reduce((a, p) => a + parseFloat(p.amount.toString()), 0);
  const net = sum(matchedReceipts) - sum(refunds);

  console.log("mature:", mature.length, "immature:", immature.length);
  console.log("booked:", booked.length, "→", ((booked.length / mature.length) * 100).toFixed(1) + "%");
  console.log("held:", held.length, "noShow:", noShow.length, "canceled:", canceled.length, "→", ((held.length / (held.length + noShow.length)) * 100).toFixed(1) + "%");
  console.log("sent:", estimates.length, "accepted:", accepted.length, "→", ((accepted.length / estimates.length) * 100).toFixed(1) + "%");
  console.log("matched receipts:", sum(matchedReceipts), "refunds:", sum(refunds), "net:", net);
  console.log("unmatched:", unmatched.map((u) => u.amount).join(","));

  const assigns = await db.experimentAssignment.findMany({ where: { experiment: { contractorId: summit.id } } });
  const armBooked = async (arm: string) => {
    const rows = assigns.filter((a) => a.arm === arm);
    let b = 0;
    for (const r of rows) {
      if (!r.inquiryId) continue;
      const appt = await db.appointment.findFirst({ where: { inquiryId: r.inquiryId } });
      if (appt) b++;
    }
    return { n: rows.length, booked: b };
  };
  const A = await armBooked("A");
  const B = await armBooked("B");
  console.log("experiment A:", A, ((A.booked / A.n) * 100).toFixed(1) + "%", "B:", B, ((B.booked / B.n) * 100).toFixed(1) + "%", "diff:", (((B.booked / B.n) - (A.booked / A.n)) * 100).toFixed(1) + "pp");
  process.exit(0);
}
main();
