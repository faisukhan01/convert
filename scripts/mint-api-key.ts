/**
 * Mint an organization API key for the ingestion API from the CLI:
 *
 *   DATABASE_URL=… bun scripts/mint-api-key.ts --slug summit --name "Website"
 *
 * Prints the RAW key exactly once — only its SHA-256 hash is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("slug") ?? "summit";
  const name = arg("name") ?? "CLI key";
  const contractor = await db.contractor.findUnique({ where: { slug } });
  if (!contractor) throw new Error(`No contractor with slug "${slug}"`);

  const raw = `rl_live_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(raw).digest("hex");
  const key = await db.apiKey.create({
    data: { contractorId: contractor.id, name, prefix: raw.slice(0, 16), keyHash },
  });
  console.log(`Organization : ${contractor.name} (${contractor.slug})`);
  console.log(`Key id       : ${key.id}`);
  console.log(`RAW KEY (once): ${raw}`);
  console.log(`Use as header : x-api-key: <raw key>  →  POST /api/v1/leads`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
