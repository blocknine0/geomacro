import { readFileSync } from "node:fs";

const file = ".github/workflows/apply-risk-gate-production-migrations.yml";
const source = readFileSync(file, "utf8");

const required = [
  "SUPABASE_DB_URL",
  "supabase db push --db-url \"$SUPABASE_DB_URL\" --dry-run",
  "supabase db push --db-url \"$SUPABASE_DB_URL\"",
  "EXPECTED_SUPABASE_PROJECT_REF: ldpwajisioljyjtojvfx",
  "environment: production",
  "default: plan",
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`Missing production migration guard: ${token}`);
  }
}

if (source.includes("supabase link --project-ref")) {
  throw new Error("Production migration workflow must not depend on Management API linking");
}
if (source.includes("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}")) {
  throw new Error("Production migration workflow must not require a scoped PAT");
}

console.log("Production migration direct-db-url static contract: PASS");
