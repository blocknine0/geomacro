#!/usr/bin/env node
// Retired: its discovery flow is incompatible with the D1-only object index.
import { mkdirSync, writeFileSync } from "node:fs";
const out = "artifacts/legacy-exit/legacy-b2-origin-free-recovery-canary.json";
const receipt = {
  schema: "geomacro.legacy-b2-origin-free-restore-canary.v1",
  checked_at: new Date().toISOString(),
  status: "BLOCKED_NO_DELETION",
  reason: "LEGACY_DISCOVERY_RETIRED_USE_GATEWAY_D1_INDEX",
  source_supabase_network_requests: 0, source_supabase_writes: 0,
  source_supabase_deletes: 0,
  b2_writes: 0, b2_deletes: 0, payments: 0,
  old_supabase_deletion_authorized: false,
};
mkdirSync("artifacts/legacy-exit", { recursive: true });
writeFileSync(out, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(receipt));
process.exitCode = 3;
