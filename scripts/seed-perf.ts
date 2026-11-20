/**
 * Performance dataset: seeds 10,000 eligible inquiries (+ tasks) into a SEPARATE
 * agency/tenant so the demo fixture stays intact. Then exercise Today filters and
 * the reports endpoint manually and record timings (see docs/acceptance-report.md).
 *
 *   bun run db:seed-perf
 */
import { db } from "@/lib/db";

const TOTAL = 10000;

async function main() {
  console.time("seed-perf");
  let agency = await db.agency.findFirst({ where: { name: "Perf Load Tenant" } });
  if (!agency) agency = await db.agency.create({ data: { name: "Perf Load Tenant" } });
  let contractor = await db.contractor.findUnique({ where: { slug: "perf" } });
  if (!contractor) {
    contractor = await db.contractor.create({
      data: {
        agencyId: agency.id, name: "Perf Roofing (load test)", slug: "perf",
        timezone: "America/Chicago", serviceZips: "78701,78702,78703,78704",
      },
    });
  }
  const existing = await db.inquiry.count({ where: { contractorId: contractor.id } });
  if (existing >= TOTAL) {
    console.log(`already seeded: ${existing} inquiries`);
    process.exit(0);
  }

  const first = ["Alex", "Bailey", "Casey", "Drew", "Eli", "Frankie", "Gale", "Harper", "Ira", "Jules"];
  const last = ["Alderman", "Bishop", "Calloway", "Dunmore", "Ellison", "Farrow", "Gibbs", "Holloway", "Iverson", "Jennings"];
  const stages = ["NEW", "RESPONDING", "BOOKED", "INSPECTED", "QUOTED", "WON", "LOST"];
  const sources = ["WEBSITE", "PHONE_MISSED", "OFFICE", "REFERRAL", "LANDING_PAGE"];

  const contactsData = [] as {
    contractorId: string; firstName: string; lastName: string; phone: string; email: string;
    addressLine1: string; city: string; state: string; zip: string; smsConsent: boolean;
  }[];
  for (let i = existing; i < TOTAL; i++) {
    contactsData.push({
      contractorId: contractor.id,
      firstName: first[i % 10], lastName: last[Math.floor(i / 10) % 10],
      phone: `+1512999${String(i).padStart(5, "0")}`,
      email: `perf${i}@loadtest.io`,
      addressLine1: `${100 + (i % 900)} Load St`, city: "Austin", state: "TX",
      zip: ["78701", "78702", "78703", "78704"][i % 4],
      smsConsent: i % 3 !== 0,
    });
  }
  const t0 = Date.now();
  const contacts = await db.contact.createMany({ data: contactsData });
  console.log(`contacts: ${contacts.count} in ${Date.now() - t0}ms`);

  const createdContacts = await db.contact.findMany({
    where: { contractorId: contractor.id, email: { contains: "@loadtest.io" } },
    select: { id: true },
  });
  const inquiriesData = createdContacts.map((c, idx) => ({
    contractorId: contractor.id, contactId: c.id,
    serviceType: ["REPAIR", "REPLACEMENT", "INSPECTION"][idx % 3],
    serviceZip: ["78701", "78702", "78703", "78704"][idx % 4],
    source: sources[idx % 5], firstSource: sources[idx % 5],
    stage: stages[idx % 7],
    createdAt: new Date(Date.now() - (idx % 90) * 86400000),
  }));
  const t1 = Date.now();
  const inquiries = await db.inquiry.createMany({ data: inquiriesData });
  console.log(`inquiries: ${inquiries.count} in ${Date.now() - t1}ms`);

  const t2 = Date.now();
  await db.task.createMany({
    data: Array.from({ length: 2000 }, (_, i) => ({
      contractorId: contractor.id,
      kind: ["CALLBACK", "RESPOND", "FOLLOW_UP"][i % 3],
      title: `Load test task ${i}`,
      dueAt: new Date(Date.now() + (i % 3 - 1) * 86400000),
      status: "OPEN",
      createdBy: "AUTOMATION",
    })),
  });
  console.log(`tasks: 2000 in ${Date.now() - t2}ms`);
  console.timeEnd("seed-perf");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
