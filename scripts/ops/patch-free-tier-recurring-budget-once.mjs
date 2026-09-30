#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

const budgetPath = "scripts/ops/supabase-free-tier-budget.mjs";
let budget = readFileSync(budgetPath, "utf8");
budget = replaceOnce(
  budget,
  '    bulk_supabase_writes_allowed: data.bulk_write_allowed === true,\n',
  '    bulk_supabase_writes_allowed: data.bulk_write_allowed === true,\n    recurring_ingest_allowed: data.mode === "normal",\n',
  "budget policy",
);
if (!budget.includes('const requireNormal = process.argv.includes("--require-normal")')) {
  budget += `\n// Recurring ingestion needs more headroom than one-off operator actions.\n// In the warning band scheduled growth stays fail-closed until recovery returns\n// the project to normal headroom.\nconst requireNormal = process.argv.includes("--require-normal");\nif (requireNormal && data.mode !== "normal") {\n  console.error(\n    JSON.stringify({\n      ok: false,\n      code: "SUPABASE_FREE_TIER_HEADROOM_REQUIRED",\n      mode: data.mode,\n      database_bytes: data.database_bytes,\n      warn_bytes: data.warn_bytes,\n      target_bytes: data.target_bytes,\n    }),\n  );\n  process.exitCode = 78;\n}\n`;
}
writeFileSync(budgetPath, budget);

const workflowPath = ".github/workflows/auto-ingest-news.yml";
let workflow = readFileSync(workflowPath, "utf8");
workflow = replaceOnce(workflow, "# Runs every 2 hours as the low-write GRI freshness path.", "# Runs every 6 hours as the bounded low-write GRI freshness path.", "comment cadence");
workflow = replaceOnce(workflow, '    - cron: "0 */2 * * *"', '    - cron: "17 */6 * * *"', "schedule cadence");
workflow = replaceOnce(workflow, '      - "scripts/ops/select-missing-gri-discovery-domain.mjs"\n', '      - "scripts/ops/select-missing-gri-discovery-domain.mjs"\n      - "scripts/ops/supabase-free-tier-budget.mjs"\n', "budget path trigger");
workflow = replaceOnce(workflow, "      - name: Report Supabase free-tier budget without enabling bulk writers", "      - name: Require normal free-tier headroom before recurring writes", "budget step name");
workflow = replaceOnce(workflow, "        run: node scripts/ops/supabase-free-tier-budget.mjs\n", "        run: node scripts/ops/supabase-free-tier-budget.mjs --require-bulk-write --require-normal\n", "budget command");
workflow = replaceOnce(workflow, '          GUARDIAN_QUERY_BUDGET_PER_CATEGORY: ${{ vars.GUARDIAN_QUERY_BUDGET_PER_CATEGORY }}', '          GUARDIAN_QUERY_BUDGET_PER_CATEGORY: "3"', "guardian budget");
workflow = replaceOnce(workflow, '          GUARDIAN_QUERY_ROTATION_HOURS: ${{ vars.GUARDIAN_QUERY_ROTATION_HOURS }}', '          GUARDIAN_QUERY_ROTATION_HOURS: "6"', "guardian rotation");
workflow = replaceOnce(workflow, '          GROQ_MAX_REQUESTS_PER_RUN: ${{ vars.GROQ_MAX_REQUESTS_PER_RUN }}', '          GROQ_MAX_REQUESTS_PER_RUN: "12"', "groq run cap");
workflow = replaceOnce(workflow, '          GROQ_MAX_WAIT_MS: "900000"', '          GROQ_MAX_WAIT_MS: "180000"', "groq wait cap");
workflow = replaceOnce(workflow, '          GROQ_BATCH_SIZE: "4"', '          GROQ_BATCH_SIZE: "2"', "groq batch cap");
workflow = replaceOnce(workflow, '          NEWS_MAX_RETRIES: ${{ vars.NEWS_MAX_RETRIES }}', '          NEWS_MAX_RETRIES: "2"', "news retries");
writeFileSync(workflowPath, workflow);

for (const required of [
  'recurring_ingest_allowed: data.mode === "normal"',
  'SUPABASE_FREE_TIER_HEADROOM_REQUIRED',
  '--require-bulk-write --require-normal',
  'cron: "17 */6 * * *"',
  'GROQ_MAX_REQUESTS_PER_RUN: "12"',
]) {
  if (!budget.includes(required) && !workflow.includes(required)) throw new Error(`missing marker: ${required}`);
}
console.log(JSON.stringify({ ok: true }));
