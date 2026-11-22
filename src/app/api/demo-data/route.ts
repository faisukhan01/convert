import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { runSeed, wipe } from "@/lib/seed";

/**
 * Demo data controls — the Settings "Demo data" section.
 *
 *   GET    /api/demo-data   → public census (row counts + auto-seed flag). Powers the
 *                             "Load demo data" affordance on the sign-in screen when
 *                             the database is intentionally empty.
 *   POST   /api/demo-data   → install the deterministic demo fixtures. When the
 *                             database still holds data this refuses (remove first)
 *                             so real records can never be silently replaced.
 *                             When the database is empty it is allowed WITHOUT a
 *                             session — installing demo data on a wiped install is
 *                             a bootstrap action (there is no one to sign in yet).
 *   DELETE /api/demo-data   → remove ALL demo data (owner / agency admin only).
 *                             Sets the auto-seed flag off so bootstrap does not
 *                             immediately reinstall fixtures over an intentional wipe.
 *
 * Note on scope: demo fixtures are the whole database in demo mode. Remove is
 * destructive by design and confirmed in the UI; it never runs silently.
 */

async function census() {
  const [users, agencies, contractors, contacts, inquiries, appointments, estimates, payments, tasks] = await Promise.all([
    db.user.count(),
    db.agency.count(),
    db.contractor.count(),
    db.contact.count(),
    db.inquiry.count(),
    db.appointment.count(),
    db.estimate.count(),
    db.payment.count(),
    db.task.count(),
  ]);
  const state = await db.demoState.findUnique({ where: { id: "singleton" } });
  return {
    empty: users === 0,
    autoSeed: state?.autoSeed ?? true,
    seededAt: state?.seededAt?.toISOString() ?? null,
    counts: { users, agencies, contractors, contacts, inquiries, appointments, estimates, payments, tasks },
  };
}

export const GET = route(async () => {
  await ensureBootstrap();
  return json(await census());
});

export const POST = route(async () => {
  const before = await db.user.count();
  if (before > 0) {
    // Authenticated manage-role check: only office/owner/agency may touch data controls.
    await requireAccess();
    throw new ApiError(409, "Data already present — use Remove demo data first, then load again. Existing records are never replaced silently.");
  }
  // Empty database: bootstrap action, no session required (nobody exists to sign in).
  await db.demoState.upsert({ where: { id: "singleton" }, update: { autoSeed: true }, create: { id: "singleton", autoSeed: true } });
  await runSeed({ force: true });
  await db.demoState.update({ where: { id: "singleton" }, data: { autoSeed: true } });
  await db.auditEvent.create({ data: { action: "DEMO_DATA_LOAD", entity: "system", meta: "Demo fixtures installed from Settings" } });
  return json({ ok: true, message: "Demo data installed", ...(await census()) });
});

export const DELETE = route(async () => {
  const { role } = await requireAccess();
  if (!["OWNER", "AGENCY_ADMIN"].includes(role)) {
    throw new ApiError(403, "Removing demo data requires the owner or agency admin role");
  }
  await wipe();
  await db.demoState.upsert({
    where: { id: "singleton" },
    update: { autoSeed: false, seededAt: null, clockOffsetMs: 0 },
    create: { id: "singleton", autoSeed: false },
  });
  await db.auditEvent.create({ data: { action: "DEMO_DATA_REMOVE", entity: "system", meta: "All demo data removed from Settings" } });
  return json({ ok: true, message: "All demo data removed", ...(await census()) });
});
