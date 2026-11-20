/**
 * In-memory sliding-window rate limiter (per-process). Applied to the public
 * ingestion API per API key. Good enough for a single Next.js deployment;
 * swap for a Redis/Upstash limiter when scaling horizontally (interface unchanged).
 */
const buckets = new Map<string, { windowStart: number; count: number }>();

export type RateResult = { ok: boolean; remaining: number; retryAfterSec: number };

export function rateLimit(key: string, limitPerMin: number): RateResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= 60_000) {
    buckets.set(key, { windowStart: now, count: 1 });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (now - v.windowStart >= 120_000) buckets.delete(k);
    }
    return { ok: true, remaining: limitPerMin - 1, retryAfterSec: 0 };
  }
  if (b.count >= limitPerMin) {
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.windowStart + 60_000 - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true, remaining: limitPerMin - b.count, retryAfterSec: 0 };
}
