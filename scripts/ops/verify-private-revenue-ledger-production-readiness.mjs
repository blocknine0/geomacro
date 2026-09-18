import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROD_PROJECT_REF = "ldpwajisioljyjtojvfx";
const SHA = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

async function main() {
  const expectedSha = required("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA").toLowerCase();
  if (!SHA.test(expectedSha)) {
    fail("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA must be a full 40-character SHA");
  }

  const url = required("APP_SUPABASE_URL");
  const key = required("APP_SUPABASE_SERVICE_ROLE_KEY");
  const parsed = new URL(url);
  const projectRef = parsed.hostname.split(".")[0];

  if (parsed.protocol !== "https:" || projectRef !== PROD_PROJECT_REF) {
    fail("Private revenue-ledger readiness must target the authoritative Geomacro production project");
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.rpc(
    "private_commercial_revenue_delivery_ledger_readiness",
  );
  if (error) throw error;

  const readiness =
    Array.isArray(data) && data.length === 1 ? data[0] : data;

  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) {
    fail("Private revenue-ledger readiness RPC returned an invalid payload");
  }

  const requiredTrue = [
    "ready",
    "table_exists",
    "rls_enabled",
    "capture_trigger_exists",
    "capture_function_exists",
    "verify_function_exists",
    "immutable_trigger_exists",
    "service_role_select_allowed",
  ];
  for (const key of requiredTrue) {
    if (readiness[key] !== true) {
      fail(`Private revenue-ledger readiness gate failed: ${key} is not true`);
    }
  }

  const requiredFalse = [
    "anon_select_allowed",
    "authenticated_select_allowed",
    "service_role_insert_allowed",
    "service_role_update_allowed",
    "service_role_delete_allowed",
  ];
  for (const key of requiredFalse) {
    if (readiness[key] !== false) {
      fail(`Private revenue-ledger access boundary failed: ${key} is not false`);
    }
  }

  if (
    !Number.isInteger(Number(readiness.invalid_hash_chain_rows)) ||
    Number(readiness.invalid_hash_chain_rows) !== 0
  ) {
    fail("Private revenue-ledger hash chain contains invalid rows");
  }

  const rowCount = Number(readiness.row_count ?? 0);
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
    fail("Private revenue-ledger row_count is invalid");
  }

  const head =
    readiness.head_entry_sha256 === null ||
    readiness.head_entry_sha256 === undefined
      ? null
      : String(readiness.head_entry_sha256).toLowerCase();
  if (head !== null && !/^[0-9a-f]{64}$/.test(head)) {
    fail("Private revenue-ledger head hash is invalid");
  }

  const evidence = {
    schema_version: "geomacro.private-revenue-ledger-production-readiness.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: expectedSha,
    project_ref: PROD_PROJECT_REF,
    ready: true,
    table_exists: true,
    rls_enabled: true,
    capture_trigger_exists: true,
    capture_function_exists: true,
    verify_function_exists: true,
    immutable_trigger_exists: true,
    access_boundaries: {
      public_select_allowed: false,
      anon_select_allowed: false,
      authenticated_select_allowed: false,
      service_role_select_allowed: true,
      service_role_insert_allowed: false,
      service_role_update_allowed: false,
      service_role_delete_allowed: false,
    },
    row_count: rowCount,
    invalid_hash_chain_rows: 0,
    head_entry_sha256: head,
    private_delivery_payload_included: false,
    raw_payment_signature_included: false,
    private_key_included: false,
    credential_included: false,
    public_distribution_authorized: false,
    result: "PASS",
  };

  const output =
    process.env.GEOMACRO_PRIVATE_REVENUE_LEDGER_READINESS_OUTPUT?.trim() ||
    "artifacts/private-revenue-ledger-readiness/readiness.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });

  console.log("PASS: authoritative production private revenue delivery ledger is installed and ready.");
  console.log(`Rows: ${rowCount}`);
  console.log(`Head: ${head ?? "GENESIS"}`);
  console.log(`Evidence: ${output}`);
  console.log("BOUNDARY: no private delivery payload, payment proof, secret or credential was exported.");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
