import { readFileSync } from "node:fs";

const script = readFileSync("scripts/ingest-certified-sources.mjs", "utf8");
const workflow = readFileSync(".github/workflows/governed-source-ingestion.yml", "utf8");

for (const marker of [
  "GOVERNED_SOURCE_CONTRACTS",
  "D1_SOURCE_STATE_FILE",
  "geomacro.d1-governed-source-state.v1",
  "enabled_for_ingestion",
  "enabled_for_commercial_signals",
  "commercial_usage_status",
  "EIA_API_KEY",
  "NOAA_NCEI_TOKEN",
  "commercial_eligibility_status",
  "createB2Client",
  "geomacro.observation-raw-bundle.v1",
  "normalized_observation",
  "normalized_sha256",
  "gzip-fragment-bundle",
  "gzip-fragment-bundles",
  "compression: \"gzip-9\"",
  "MAX_FRAGMENT_MEMBERS",
  "MAX_FRAGMENT_COMPRESSED_BYTES",
  "MAX_FRAGMENTS_PER_SOURCE",
  "b2.putWithMetadataVerification",
  "signed-put-full-readback-sha256",
  "full_body_readback_verified: true",
  "contains_normalized_observations: true",
  "fragment_set_sha256",
  "compression_ratio",
  "d1-checkpoints.sql",
  "published_at: null",
  "supabase_dependency: false",
  "supabase_mirror_attempted: false",
  "supabase_raw_payload_written: false",
  "destructive_change: false",
  "GOVERNED_INGESTION_B2_SHARED_ACCOUNT_QUOTA_REQUIRED",
  'process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1"',
  'process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "governed_source_ingestion"',
]) {
  if (!script.includes(marker)) throw new Error(`missing script contract marker: ${marker}`);
}

for (const forbidden of [
  '@supabase/supabase-js',
  'createClient(',
  'APP_SUPABASE_URL',
  'APP_SUPABASE_SERVICE_ROLE_KEY',
  'live_external_observations',
]) {
  if (script.includes(forbidden)) throw new Error(`Supabase runtime dependency remains in ingestion script: ${forbidden}`);
}
if (script.includes("published_at: observed ?? now") || script.includes("published_at:observed??now")) {
  throw new Error("ingestion time must not be substituted for unknown publication time");
}

for (const marker of [
  "B2_S3_ENDPOINT",
  "B2_REQUEST_BUDGET",
  "geomacro-control-plane",
  "Require D1 schema v5 and account B2 quota ledger before source reads",
  'B2_ACCOUNT_QUOTA_REQUIRED: "1"',
  "B2_ACCOUNT_QUOTA_WORKFLOW_ID: governed_source_ingestion",
  'echo "D1_DATABASE_ID=$DB_ID" >> "$GITHUB_ENV"',
  "Number(rows[0]?.quota_table) !== 1",
  "GOVERNED_INGESTION_SHARED_B2_D1_SCHEMA_V5_REQUIRED",
  "GOVERNED_B2_SHARED_ACCOUNT_QUOTA_NOT_ACTIVE",
  "global_account_quota_guard_enabled",
  "Number(row?.version) >= 2",
  "Export governed source admission state from D1",
  "Write compact D1 ingestion checkpoints",
  "Replay compact D1 checkpoint upsert",
  "Verify D1 checkpoint readback",
  "supabase_dependency",
  "No Supabase dependency",
]) {
  if (!workflow.includes(marker)) throw new Error(`missing workflow contract marker: ${marker}`);
}
for (const forbidden of [
  '${{ secrets.APP_SUPABASE_URL }}',
  '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
  'Replay governed normalized ingestion',
]) {
  if (workflow.includes(forbidden)) throw new Error(`forbidden workflow dependency remains: ${forbidden}`);
}


const quotaSchema = workflow.indexOf("Require D1 schema v5 and account B2 quota ledger before source reads");
const sourceExport = workflow.indexOf("Export governed source admission state from D1");
const archive = workflow.indexOf("Run governed B2-first ingestion");
if (!(quotaSchema >= 0 && sourceExport > quotaSchema && archive > sourceExport)) {
  throw new Error("GOVERNED_B2_ACCOUNT_QUOTA_PREFLIGHT_ORDER_INVALID");
}

console.log("PASS: governed Supabase-free compressed B2-fragment ingestion contract");
