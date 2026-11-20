/**
 * Dev launcher: guarantees the local stack is up before Next starts.
 *
 *  1. Ensures the embedded PostgreSQL cluster is running on :5432 (same engine as Neon).
 *  2. Spawns `next dev -p 3000` with `.env` values FORCED over any inherited environment
 *     (the sandbox exports a stale DATABASE_URL; production/Vercel is unaffected because
 *     it never runs this script — it uses `next build` + real DATABASE_URL env vars).
 *  3. Tees stdout/stderr into dev.log (same behavior as the previous `| tee dev.log`).
 */
import { spawn } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";

const root = process.cwd();

function canConnect(port = 5432): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 900 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

function parseEnvFile(): Record<string, string> {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v.length > 0) out[m[1]] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function ensurePostgres(): Promise<void> {
  if (await canConnect()) return;
  // own the cluster in a detached process so it survives dev restarts
  const child = spawn("bun", ["scripts/pg-server.ts", "hold"], {
    detached: true, stdio: "ignore", cwd: root, env: process.env,
  });
  child.unref();
  for (let i = 0; i < 90; i++) {
    if (await canConnect()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error("[dev] PostgreSQL did not start on :5432 — continuing, DB-backed routes may fail.");
}

function isRemoteDb(url?: string): boolean {
  if (!url) return false;
  return !url.includes("localhost") && !url.includes("127.0.0.1") && !url.startsWith("file:");
}

async function main() {
  const envFile = parseEnvFile();

  // Use the configured DATABASE_URL as-is (e.g. Neon). Only boot the embedded
  // PostgreSQL cluster when no usable external database is configured.
  const effectiveDb = envFile.DATABASE_URL || process.env.DATABASE_URL;
  if (!isRemoteDb(effectiveDb)) {
    await ensurePostgres();
  } else {
    console.log("[dev] remote DATABASE_URL detected — using it directly (embedded PostgreSQL skipped)");
  }

  if (envFile.DATABASE_URL && process.env.DATABASE_URL !== envFile.DATABASE_URL) {
    console.log(`[dev] DATABASE_URL overridden from .env (inherited value ignored)`);
  }

  const log = createWriteStream(join(root, "dev.log"), { flags: "a" });
  const child = spawn("bunx", ["next", "dev", "-p", "3000"], {
    cwd: root,
    env: { ...process.env, ...envFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(process.stdout);
  child.stdout?.pipe(log);
  child.stderr?.pipe(process.stderr);
  child.stderr?.pipe(log);
  child.on("exit", (code) => {
    log.end();
    process.exit(code ?? 0);
  });
}

void main().catch((e) => {
  console.error("[dev] launcher failed:", e?.message ?? e);
  process.exit(1);
});
