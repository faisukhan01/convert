/**
 * Local PostgreSQL lifecycle for development (embedded-postgres).
 *
 * Production runs on Neon PostgreSQL via DATABASE_URL. This script gives the
 * dev sandbox the SAME engine locally, so the committed postgresql schema is
 * exercised end-to-end during development — no engine drift.
 *
 *   bun scripts/pg-server.ts start   → idempotent: starts PG on :5432 if not already running
 *   bun scripts/pg-server.ts stop    → stops the embedded instance
 *   bun scripts/pg-server.ts status  → prints whether PG is accepting connections
 *
 * Data dir: ./db/pgdata · DB: ridgeline · user: postgres / postgres (LOCAL ONLY —
 * never used in production; credentials always come from DATABASE_URL env).
 */
import EmbeddedPostgres from "embedded-postgres";
import { join } from "node:path";
import net from "node:net";

const PORT = 5432;
const DATA_DIR = join(process.cwd(), "db", "pgdata");
const CMD = process.argv[2] ?? "status";

function canConnect(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: PORT, timeout: 900 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

async function main() {
  if (CMD === "status") {
    console.log((await canConnect()) ? `postgres:running :${PORT}` : "postgres:stopped");
    return;
  }

  if (CMD === "stop") {
    try {
      const { default: PG } = await import("embedded-postgres");
      const pg = new PG({ databaseDir: DATA_DIR, user: "postgres", password: "postgres", port: PORT, persistent: false });
      await pg.stop();
      console.log("postgres:stopped");
    } catch {
      console.log("postgres:already-stopped");
    }
    return;
  }

  // start (idempotent)
  if (await canConnect()) {
    console.log(`postgres:already-running :${PORT}`);
    return;
  }

  const { default: PG } = await import("embedded-postgres");
  const pg = new PG({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
    onError: (messageOrError: unknown) => console.error("[pg]", String(messageOrError).slice(0, 300)),
  });

  try {
    await pg.initialise();
  } catch (e) {
    // initialise fails if the data dir already exists and is initialized — safe to continue
    const msg = String((e as Error)?.message ?? e);
    if (!/exists|initialized/i.test(msg)) throw e;
  }
  await pg.start();
  console.log(`postgres:started :${PORT} (data: ${DATA_DIR})`);

  // keep this process alive — the postgres instance is owned by it
  const hold = setInterval(() => void canConnect(), 30_000);
  hold.unref?.();
  process.on("SIGTERM", async () => { clearInterval(hold); try { await pg.stop(); } catch { /* noop */ } process.exit(0); });
  process.on("SIGINT", async () => { clearInterval(hold); try { await pg.stop(); } catch { /* noop */ } process.exit(0); });
}

void main().catch((e) => {
  console.error("pg-server failed:", e?.message ?? e);
  process.exit(1);
});
