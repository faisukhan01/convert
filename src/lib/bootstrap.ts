import { db } from "@/lib/db";
import { ensureEngine } from "@/lib/engine";

/**
 * One-time per-process bootstrap: ensure demo state, auto-seed an empty database (fresh
 * installation works with zero external keys), and start the in-process worker tick.
 * Repeated restarts preserve user edits; `bun run demo:reset` is the explicit reset path.
 */
const g = globalThis as unknown as { __rl_bootstrap?: Promise<void> };

async function doBootstrap(): Promise<void> {
  await db.demoState.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  const users = await db.user.count();
  if (users === 0) {
    const { runSeed } = await import("@/lib/seed");
    await runSeed({ force: true });
    console.log("[bootstrap] empty database detected — demo data seeded");
  }
  ensureEngine();
}

export function ensureBootstrap(): Promise<void> {
  if (!g.__rl_bootstrap) {
    g.__rl_bootstrap = doBootstrap().catch((e) => {
      g.__rl_bootstrap = undefined;
      throw e;
    });
  }
  return g.__rl_bootstrap;
}
