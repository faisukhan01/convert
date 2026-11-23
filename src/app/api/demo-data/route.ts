import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { runSeed, wipeBusinessData } from "@/lib/seed";

/**
 * Demo data controls — the Settings "Demo data" section.
 *
 *   GET    /api/demo-data   → public census (row counts + auto-seed flag). Powers the
 *                             "Load demo data" affordance on the sign-in screen when
 *                             the database is intentionally empty (`empty` = no users)
 *                             and the Load/Remove gating in Settings (`businessEmpty`
 *                             = no demo business rows).
 *   POST   /api/demo-data   → install the deterministic demo fixtures. When business
 *                             data is already present this refuses (remove first) so
 *                             real records can never be silently replaced. With no
 *                             accounts at all it is allowed WITHOUT a session —
 *                             installing demo data on a wiped install is a bootstrap
 *                             action (there is no one to sign in yet).
 *                             Accounts are never deleted or replaced: the fixtures are
 *                             installed onto the existing agency/users/contractors.
 *   DELETE /api/demo-data   → remove demo BUSINESS data only (owner / agency admin
 *                             only). Users, agency, contractor profiles, memberships
 *                             and the audit trail survive, so the signed-in session
 *                             stays valid — nobody is logged out. Sets the auto-seed
 *                             flag off so bootstrap does not reinstall fixtures over
 *                             an intentional wipe.
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
    // No accounts at all → nobody can sign in (sign-in screen bootstrap install).
    empty: users === 0,
    // No demo business rows → Settings offers "Load demo data".
    businessEmpty: contacts === 0 && inquiries === 0,
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
  const businessRows = (await db.inquiry.count()) + (await db.contact.count());
  if (businessRows > 0) {
    // Authenticated manage-role check: only office/owner/agency may touch data controls.
    await requireAccess();
    throw new ApiError(409, "Data already present — use Remove demo data first, then load again. Existing records are never replaced silently.");
  }
  // Business data is empty. When accounts exist this is a Settings action (session
  // required); on a genuinely empty install it is the sign-in bootstrap action.
  if ((await db.user.count()) > 0) await requireAccess();
  await db.demoState.upsert({ where: { id: "singleton" }, update: { autoSeed: true }, create: { id: "singleton", autoSeed: true } });
  // Non-force: fills business fixtures onto the surviving structure — never deletes accounts.
  await runSeed();
  await db.demoState.update({ where: { id: "singleton" }, data: { autoSeed: true } });
  await db.auditEvent.create({ data: { action: "DEMO_DATA_LOAD", entity: "system", meta: "Demo fixtures installed (accounts kept)" } });
  return json({ ok: true, message: "Demo data installed", ...(await census()) });
});

export const DELETE = route(async () => {
  const { role } = await requireAccess();
  if (!["OWNER", "AGENCY_ADMIN"].includes(role)) {
    throw new ApiError(403, "Removing demo data requires the owner or agency admin role");
  }
  // Business data ONLY — the acting user's account (and every other account) survives,
  // so the session stays valid and the portal keeps working with empty views.
  await wipeBusinessData();
  await db.demoState.upsert({
    where: { id: "singleton" },
    update: { autoSeed: false, seededAt: null, clockOffsetMs: 0 },
    create: { id: "singleton", autoSeed: false },
  });
  await db.auditEvent.create({ data: { action: "DEMO_DATA_REMOVE", entity: "system", meta: "Demo business data removed from Settings (accounts kept)" } });
  return json({ ok: true, message: "Demo data removed — your account, team and businesses are kept", ...(await census()) });
});
