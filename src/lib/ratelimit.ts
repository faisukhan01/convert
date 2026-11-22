/**
 * Database-backed fixed-window rate limiter. Applied to the public ingestion API
 * per API key.
 *
 * Counters live in the RateLimitBucket table (one row per key per minute window),
 * so the limit holds across every serverless instance / worker — the previous
 * in-memory map silently multiplied the effective limit by the instance count.
 * The counter increment is atomic (SQL UPDATE ... count = count + 1), so two
 * instances racing on the same window cannot exceed the limit.
 *
 * No Redis needed: one indexed upsert per ingestion call is negligible at
 * ingestion volumes, and stale windows are pruned opportunistically.
 */
import { db } from "./db";

export type RateResult = { ok: boolean; remaining: number; retryAfterSec: number; limit: number };

const WINDOW_MS = 60_000;
const PRUNE_OLDER_THAN_MS = 15 * 60_000;

export async function rateLimit(key: string, limitPerMin: number): Promise<RateResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS);

  const bucket = await db.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  // Opportunistic pruning: ~5% of calls clean up stale windows so the table
  // stays tiny without a cron.
  if (Math.random() < 0.05) {
    await db.rateLimitBucket
      .deleteMany({ where: { windowStart: { lt: new Date(now - PRUNE_OLDER_THAN_MS) } } })
      .catch(() => undefined);
  }

  const ok = bucket.count <= limitPerMin;
  return {
    ok,
    limit: limitPerMin,
    remaining: Math.max(0, limitPerMin - bucket.count),
    retryAfterSec: ok ? 0 : Math.max(1, Math.ceil((windowStart.getTime() + WINDOW_MS - now) / 1000)),
  };
}
