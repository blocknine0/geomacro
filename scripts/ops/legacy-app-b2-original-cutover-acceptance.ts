#!/usr/bin/env bun
// Retired: its discovery flow is incompatible with the D1-only object index.
import { mkdirSync, writeFileSync } from "node:fs";
const out = "artifacts/legacy-exit/app-b2-origin-free-read-acceptance.json";
const receipt = {
  schema: "geomacro.legacy-application-b2-origin-free-read-acceptance.v1",
  checked_at: new Date().toISOString(),
  status: "BLOCKED_D1_INDEX_REQUIRED",
  reason: "LEGACY_DISCOVERY_RETIRED_USE_GATEWAY_D1_INDEX",
  application_original_reader_independent_originals_verified: 0,
  old_supabase_deletion_authorized: false,
  source_mutations: 0, b2_puts: 0, b2_deletes: 0, real_money_transactions: 0,
};
mkdirSync("artifacts/legacy-exit", { recursive: true });
writeFileSync(out, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(receipt));
process.exitCode = 3;
