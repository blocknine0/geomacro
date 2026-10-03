import { readFileSync } from "node:fs";

const script = readFileSync("scripts/ingest-certified-sources.mjs", "utf8");
const workflow = readFileSync(".github/workflows/governed-source-ingestion.yml", "utf8");

for (const marker of [
  "live_external_observations",
  "enabled_for_ingestion",
  "enabled_for_commercial_signals",
  "EIA_API_KEY",
  "NOAA_NCEI_TOKEN",
  "commercial_eligibility_status",
  "createB2Client",
  "geomacro.observation-raw-bundle.v1",
  "gzip-fragment-bundle",
  "gzip-fragment-bundles",
  "compression: \"gzip-9\"",
  "MAX_FRAGMENT_MEMBERS",
  "MAX_FRAGMENT_COMPRESSED_BYTES",
  "MAX_FRAGMENTS_PER_SOURCE",
  "b2.put",
  "b2.get",
  "readback_verified: true",
  "raw_payload: null",
  "archive_bundle_key",
  "archive_bundle_sha256",
  "archive_member_sha256",
  "fragment_set_sha256",
  "compression_ratio",
  "d1-checkpoints.sql",
  "published_at: null",
  "supabase_raw_payload_written: false",
  "destructive_change: false",
]) {
  if (!script.includes(marker)) throw new Error(`missing script contract marker: ${marker}`);
}

if (script.includes("published_at: observed ?? now") || script.includes("published_at:observed??now")) {
  throw new Error("ingestion time must not be substituted for unknown publication time");
}
if (script.includes("raw_payload: raw") || script.includes("raw_payload:raw")) {
  throw new Error("raw source payload must not be written directly to Supabase");
}

for (const marker of [
  "B2_S3_ENDPOINT",
  "B2_REQUEST_BUDGET",
  "geomacro-control-plane",
  "Write compact D1 ingestion checkpoints",
  "Replay compact D1 checkpoint upsert",
  "Verify D1 checkpoint readback",
  "supabase_raw_payload_written",
  "No x402 payment",
]) {
  if (!workflow.includes(marker)) throw new Error(`missing workflow contract marker: ${marker}`);
}
if (workflow.includes("Replay governed normalized ingestion")) {
  throw new Error("source fetch/B2 upload must not be duplicated just to prove checkpoint idempotency");
}

console.log("PASS: governed compressed B2-fragment ingestion contract");
