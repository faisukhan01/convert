import { db } from "@/lib/db";

/**
 * Demo clock: lets the operator advance multi-day follow-up in seconds. All engine timing
 * uses demoNow(); production deployments simply leave the offset at zero.
 */
type Cache = { at: number; offsetMs: number };
const g = globalThis as unknown as { __rl_clock?: Cache };

export async function getClockOffset(): Promise<number> {
  if (g.__rl_clock && Date.now() - g.__rl_clock.at < 1000) return g.__rl_clock.offsetMs;
  const row = await db.demoState.findUnique({ where: { id: "singleton" } });
  const offsetMs = row?.clockOffsetMs ?? 0;
  g.__rl_clock = { at: Date.now(), offsetMs };
  return offsetMs;
}

export function invalidateClock(): void {
  g.__rl_clock = undefined;
}

export async function demoNow(): Promise<Date> {
  return new Date(Date.now() + (await getClockOffset()));
}

export async function shiftClock(ms: number): Promise<number> {
  await db.demoState.upsert({
    where: { id: "singleton" },
    update: { clockOffsetMs: { increment: ms } },
    create: { id: "singleton", clockOffsetMs: Math.max(0, ms) },
  });
  invalidateClock();
  return getClockOffset();
}

export async function resetClock(): Promise<void> {
  await db.demoState.upsert({
    where: { id: "singleton" },
    update: { clockOffsetMs: 0 },
    create: { id: "singleton", clockOffsetMs: 0 },
  });
  invalidateClock();
}
