import { runSeed } from "@/lib/seed";

const force = process.argv.includes("--force") || process.argv.includes("--reset");
runSeed({ force })
  .then(() => {
    console.log(force ? "Demo data reset with deterministic fixtures." : "Seed complete (skipped if data already exists).");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
