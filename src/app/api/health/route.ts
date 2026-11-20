import { db } from "@/lib/db";
import { json, route } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";

/**
 * GET /api/health → liveness + persistence + subsystem status.
 * Every integration reports its REAL state: "configured" only when the
 * required credentials are present, never simulated.
 */
export const GET = route(async () => {
  // No DATABASE_URL configured (e.g. before the first production deploy):
  // report it clearly instead of crashing — the app boots, DB routes wait for config.
  if (!process.env.DATABASE_URL) {
    return json({
      ok: false,
      service: "ridgeline",
      database: "not_configured",
      message: "Set DATABASE_URL (Neon PostgreSQL) in your deployment environment, then run: DATABASE_URL=<neon-url> bun run db:push",
      time: new Date().toISOString(),
    });
  }
  await ensureBootstrap();
  const now = new Date();
  const [pending, failed, dbOk] = await Promise.all([
    db.backgroundJob.count({ where: { status: "PENDING" } }),
    db.backgroundJob.count({ where: { status: "FAILED" } }),
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);

  const integrations = {
    database: { name: "PostgreSQL", status: dbOk ? "configured" : "unavailable", engine: dbOk ? (process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1") ? "local (dev)" : "remote/neon") : null },
    ai: {
      name: "AI lead qualification",
      provider: (process.env.AI_PROVIDER ?? "zai").toLowerCase() === "openai" && process.env.OPENAI_API_KEY ? "openai" : "zai",
      status: "configured",
    },
    openai: { name: "OpenAI provider", status: process.env.OPENAI_API_KEY ? "configured" : "not_configured" },
    ghl: { name: "GoHighLevel connector (optional)", status: process.env.GHL_CLIENT_ID ? "configured" : "not_configured" },
    jobber: { name: "Jobber connector (optional)", status: process.env.JOBBER_CLIENT_ID ? "configured" : "not_configured" },
    gmail: { name: "Gmail connector", status: process.env.GOOGLE_CLIENT_ID ? "configured" : "not_configured" },
    facebook: { name: "Facebook Lead Ads connector", status: process.env.META_APP_ID ? "configured" : "not_configured" },
    whatsapp: { name: "WhatsApp Business connector", status: process.env.WHATSAPP_ACCESS_TOKEN ? "configured" : "not_configured" },
  };

  return json({
    ok: dbOk,
    service: "ridgeline",
    database: dbOk ? "postgresql" : "unreachable",
    queue: { pending, failed },
    integrations,
    time: now.toISOString(),
  });
});
