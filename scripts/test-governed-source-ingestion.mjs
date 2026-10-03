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
  "b2.put",
  "b2.get",
  "contains_normalized_observations: true",
  "fragment_set_sha256",
  "compression_ratio",
  "d1-checkpoints.sql",
  "published_at: null",
  "supabase_dependency: false",
  "supabase_mirror_attempted: false",
  "supabase_raw_payload_written: false",
  "destructive_change: false",
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

console.log("PASS: governed Supabase-free compressed B2-fragment ingestion contract");
