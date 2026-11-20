/**
 * Detached dev-server launcher for this sandbox.
 *
 * The sandbox reaps background jobs that belong to a finished shell command
 * (plain `nohup ... &` / setsid from bash die with the command). Processes
 * spawned with node's `detached: true` + `unref()` from a short-lived bun
 * process survive — that is exactly how scripts/dev.ts keeps the embedded
 * PostgreSQL cluster alive across commands. This script uses the same escape
 * hatch for the whole dev stack.
 *
 * Usage:  bun scripts/keep-dev.ts
 */
import { spawn } from "node:child_process";
import { openSync } from "node:fs";

const root = process.cwd();
const out = openSync(`${root}/dev.log`, "a");

const child = spawn("bun", ["run", "dev"], {
  cwd: root,
  detached: true,
  stdio: ["ignore", out, out],
});
child.unref();
console.log(`[keep-dev] dev stack detached — pid ${child.pid} (logs → dev.log)`);
