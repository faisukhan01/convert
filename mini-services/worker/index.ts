/// <reference types="bun-types" />
/**
 * RidgeLine background worker — the TypeScript job processor.
 *
 * Replaces any long-running automation loop inside request handlers: the Next.js
 * app ENQUEUES durable jobs into the Postgres-backed BackgroundJob table and this
 * independent worker claims and executes them with retries, exponential backoff,
 * stale-claim recovery and dead-lettering. Idempotent by design — handlers skip
 * work that is already done (e.g. an inquiry that is already classified).
 *
 * Job types:
 *   LEAD_CLASSIFY  — AI lead qualification (src/lib/ai.ts, shared via relative import)
 *
 * Production: deploy this worker separately (Fly.io / Railway / a Vercel cron
 * hitting /api/worker/tick, or Inngest/Trigger.dev). It is NOT required for the
 * Next.js app to boot — the ingestion API falls back to inline best-effort
 * classification when no worker is running.
 *
 * Health: GET http://localhost:3004/health
 */
import { PrismaClient } from "@prisma/client";
import { classifyInquiry } from "../../src/lib/ai";

const db = new PrismaClient();
const PORT = Number(process.env.WORKER_PORT ?? 3004);
const POLL_MS = 1500;
const BATCH = 5;
const STALE_MS = 10 * 60_000; // RUNNING claims older than this are re-queued (crash recovery)

type JobRow = { id: string; type: string; payload: string; attempts: number; maxAttempts: number; contractorId: string | null };

// ─────────────────────────── handlers ───────────────────────────

type Handler = (payload: Record<string, unknown>, job: JobRow) => Promise<Record<string, unknown>>;

const handlers: Record<string, Handler> = {
  async LEAD_CLASSIFY(payload) {
    const inquiryId = String(payload.inquiryId ?? "");
    if (!inquiryId) throw new Error("payload.inquiryId required");
    const result = await classifyInquiry(inquiryId);
    if (!result) return { skipped: "already classified (idempotent)" };
    return { category: result.category, score: result.score, urgency: result.urgency };
  },
};

// ─────────────────────────── queue mechanics ───────────────────────────

async function claim(job: JobRow): Promise<boolean> {
  const res = await db.backgroundJob.updateMany({
    where: { id: job.id, status: "PENDING" }, // atomic claim — only one worker wins
    data: { status: "RUNNING", attempts: { increment: 1 }, updatedAt: new Date() },
  });
  return res.count === 1;
}

async function complete(job: JobRow, result: Record<string, unknown>): Promise<void> {
  await db.backgroundJob.update({
    where: { id: job.id },
    data: { status: "DONE", result: JSON.stringify(result), finishedAt: new Date(), lastError: null },
  });
}

async function fail(job: JobRow, err: string): Promise<void> {
  const dead = job.attempts >= job.maxAttempts;
  await db.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: dead ? "FAILED" : "PENDING",
      lastError: err.slice(0, 500),
      runAt: dead ? undefined : new Date(Date.now() + Math.min(30_000 * job.attempts * job.attempts, 30 * 60_000)),
      finishedAt: dead ? new Date() : null,
    },
  });
  if (dead) console.error(`[worker] job ${job.id} (${job.type}) dead-lettered after ${job.attempts} attempts: ${err}`);
}

async function processBatch(): Promise<number> {
  // crash recovery: re-queue RUNNING jobs whose worker died mid-flight
  await db.backgroundJob.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "PENDING", updatedAt: new Date() },
  });

  const jobs = await db.backgroundJob.findMany({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: BATCH,
  });

  let processed = 0;
  for (const job of jobs) {
    if (!(await claim(job))) continue; // another worker got it
    processed++;
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type "${job.type}"`);
      const payload = JSON.parse(job.payload || "{}") as Record<string, unknown>;
      const result = await handler(payload, job);
      await complete(job, result);
      console.log(`[worker] DONE ${job.type} ${job.id}`, result);
    } catch (e) {
      await fail(job, (e as Error).message ?? String(e));
      console.error(`[worker] FAIL ${job.type} ${job.id} (attempt ${job.attempts}/${job.maxAttempts}):`, (e as Error).message);
    }
  }
  return processed;
}

// ─────────────────────────── health + loop ───────────────────────────

async function queueStats() {
  const [pending, running, done, failed] = await Promise.all([
    db.backgroundJob.count({ where: { status: "PENDING" } }),
    db.backgroundJob.count({ where: { status: "RUNNING" } }),
    db.backgroundJob.count({ where: { status: "DONE" } }),
    db.backgroundJob.count({ where: { status: "FAILED" } }),
  ]);
  return { pending, running, done, failed };
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      const [dbOk, queue] = await Promise.all([
        db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        queueStats(),
      ]);
      return Response.json({ ok: dbOk, service: "ridgeline-worker", queue, time: new Date().toISOString() });
    }
    return new Response("RidgeLine worker\n", { status: 200 });
  },
});

console.log(`[worker] RidgeLine background worker listening on :${PORT} (health: GET /health)`);

let running = true;
async function loop() {
  while (running) {
    try {
      await processBatch();
    } catch (e) {
      console.error("[worker] batch error:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void loop();
process.on("SIGTERM", () => { running = false; void db.$disconnect().finally(() => process.exit(0)); });
process.on("SIGINT", () => { running = false; void db.$disconnect().finally(() => process.exit(0)); });
