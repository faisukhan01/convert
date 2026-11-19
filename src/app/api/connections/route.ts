import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { demoNow } from "@/lib/democlock";
import { getAdapter } from "@/lib/providers";
import { encryptToken } from "@/lib/crypto";

/**
 * GET  /api/connections — per-provider install state, prerequisites, activation checklist.
 * POST /api/connections — simulate-install | disconnect | activate | check
 *
 * Mode semantics visible to the operator:
 *   demo       — simulated connector contracts (works with zero credentials)
 *   configured — real credentials installed, checks not all passed yet
 *   live       — verified connection + explicit per-location activation
 */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  const installs = await db.providerInstall.findMany({ where: { contractorId: contractor.id } });
  const ghl = installs.find((i) => i.provider === "GHL");
  const now = await demoNow();

  const checks = ghl?.checkResult ? (JSON.parse(ghl.checkResult) as { name: string; state: string; detail: string }[]) : [];
  const prerequisites = [
    { key: "install", label: "GHL app installed & location authorized", met: ghl?.status === "CONNECTED" },
    { key: "location", label: "Location mapped to this contractor", met: !!contractor.ghlLocationId },
    { key: "senders", label: "One SMS sender + one email sender chosen", met: checks.some((c) => c.name === "Sender channels" && c.state === "passed") },
    { key: "webhook", label: "Webhook delivery verified", met: checks.some((c) => c.name === "Webhook delivery" && c.state === "passed") },
    { key: "calendar", label: "Calendar availability synced", met: checks.some((c) => c.name === "Calendar availability" && c.state === "passed") },
    { key: "billing", label: "Subscription active (not past_due/canceled)", met: !["past_due", "canceled"].includes(contractor.billingStatus) },
  ];
  const allMet = prerequisites.every((p) => p.met);

  return json({
    runMode: contractor.runMode,
    activatedAt: contractor.activatedAt?.toISOString() ?? null,
    installs: installs.map((i) => ({
      provider: i.provider, status: i.status, locationId: i.locationId, scopes: i.scopes,
      lastCheckedAt: i.lastCheckedAt?.toISOString() ?? null,
      lastError: i.lastError,
      installedAt: i.createdAt.toISOString(),
    })),
    checks,
    prerequisites,
    allPrerequisitesMet: allMet,
    now: now.toISOString(),
  });
});

export const POST = route(async (req) => {
  await ensureBootstrap();
  const body = (await req.json()) as { action: string; provider?: string };
  const { contractor, user, role } = await requireAccess(null);
  if (role === "ESTIMATOR") throw new ApiError(403, "Requires office or owner role");

  switch (body.action) {
    case "simulate-install": {
      if (contractor.runMode !== "demo") throw new ApiError(403, "Only available in demo mode");
      await db.providerInstall.upsert({
        where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } },
        update: { status: "CONNECTED", lastError: null },
        create: {
          contractorId: contractor.id, provider: "GHL", status: "CONNECTED",
          locationId: `loc_demo_${contractor.slug}`,
          accessTokenEnc: encryptToken("demo-access-token"),
          refreshTokenEnc: encryptToken("demo-refresh-token"),
          scopes: "contacts.readonly conversations.write calendars.readonly estimates.write",
          installedByUserId: user.id,
          checkResult: JSON.stringify([
            { name: "OAuth token", state: "passed", detail: "Simulated install — token stored encrypted" },
            { name: "Location mapping", state: "passed", detail: `loc_demo_${contractor.slug} → ${contractor.name}` },
            { name: "Calendar availability", state: "passed", detail: "Product-managed slots (simulated)" },
            { name: "Sender channels", state: "awaiting", detail: "Pick one SMS sender + one email sender in GHL when configuring" },
            { name: "Webhook delivery", state: "awaiting", detail: "Needs a public APP_BASE_URL" },
          ]),
        },
      });
      await db.contractor.update({ where: { id: contractor.id }, data: { ghlLocationId: `loc_demo_${contractor.slug}` } });
      return json({ ok: true });
    }
    case "disconnect": {
      await db.providerInstall.updateMany({
        where: { contractorId: contractor.id, provider: body.provider ?? "GHL" },
        data: { status: "DISCONNECTED", accessTokenEnc: null, refreshTokenEnc: null, lastError: null },
      });
      await db.contractor.update({ where: { id: contractor.id }, data: { activatedAt: null, runMode: "demo", ghlLocationId: null } });
      return json({ ok: true, note: "New connector work stopped. Deactivate any native GHL workflows that this app owned (see docs/ghl-installation-guide.md)." });
    }
    case "revoke-simulate": {
      const install = await db.providerInstall.findUnique({ where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } } });
      if (!install) throw new ApiError(404, "No install");
      await db.providerInstall.update({ where: { id: install.id }, data: { status: "REVOKED", lastError: "Token revoked at provider (simulated) — reconnect to restore" } });
      return json({ ok: true });
    }
    case "check": {
      const install = await db.providerInstall.findUnique({ where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } } });
      const adapter = getAdapter(contractor.runMode, { accessToken: install?.accessTokenEnc, locationId: install?.locationId });
      const results = await adapter.connectionCheck();
      await db.providerInstall.upsert({
        where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } },
        update: { lastCheckedAt: new Date(), checkResult: JSON.stringify(results) },
        create: { contractorId: contractor.id, provider: "GHL", lastCheckedAt: new Date(), checkResult: JSON.stringify(results) },
      });
      return json({ ok: true, checks: results });
    }
    case "activate": {
      if (["past_due", "canceled"].includes(contractor.billingStatus)) {
        throw new ApiError(403, "Activation blocked: subscription is " + contractor.billingStatus);
      }
      const install = await db.providerInstall.findUnique({ where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } } });
      if (!install || install.status !== "CONNECTED") {
        throw new ApiError(403, "Activation blocked: no connected GHL installation for this location");
      }
      await db.contractor.update({
        where: { id: contractor.id },
        data: { activatedAt: new Date(), runMode: contractor.runMode === "demo" ? "demo" : "live" },
      });
      return json({ ok: true });
    }
    case "set-billing": {
      const { billingStatus } = body as { action: string; billingStatus?: string };
      if (!billingStatus || !["trial", "active", "past_due", "canceled"].includes(billingStatus)) throw new ApiError(400, "Invalid billing status");
      await db.contractor.update({ where: { id: contractor.id }, data: { billingStatus } });
      return json({ ok: true });
    }
    case "set-mode": {
      const { mode } = body as { action: string; mode?: string };
      if (!mode || !["demo", "configured", "live"].includes(mode)) throw new ApiError(400, "Invalid mode");
      if (mode === "live") {
        const install = await db.providerInstall.findUnique({ where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } } });
        if (!install || install.status !== "CONNECTED") throw new ApiError(403, "Live mode requires a connected install");
      }
      await db.contractor.update({ where: { id: contractor.id }, data: { runMode: mode } });
      return json({ ok: true });
    }
    default:
      throw new ApiError(400, "Unknown action");
  }
});
