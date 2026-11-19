/**
 * Switch the Prisma datasource between local SQLite (demo) and PostgreSQL (Neon).
 *
 *   bun run db:use-postgres   → provider = "postgresql"  (then set DATABASE_URL to Neon)
 *   bun run db:use-sqlite     → provider = "sqlite"      (local demo)
 *
 * The model block is identical for both engines — this only flips the datasource provider,
 * then you run `bun run db:push`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const target = process.argv[2] === "postgres" ? "postgresql" : "sqlite";
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
let src = readFileSync(schemaPath, "utf8");
src = src.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${target}"`);
writeFileSync(schemaPath, src);
console.log(`prisma/schema.prisma datasource provider -> ${target}`);
console.log(target === "postgresql"
  ? "Now set DATABASE_URL to your Neon connection string (postgresql://…?sslmode=require) and run `bun run db:push`."
  : "Set DATABASE_URL=file:./db/custom.db for the local demo and run `bun run db:push`.");
