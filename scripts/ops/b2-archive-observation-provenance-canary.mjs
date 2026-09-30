#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const SOURCE_ID = "world_bank_indicators";
const MAX_SCAN = 100;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const olderDays = Number(process.env.OBSERVATION_PROVENANCE_ARCHIVE_OLDER_DAYS ?? 7);
if (
  url !== PROJECT_URL ||
  !role ||
  !Number.isInteger(olderDays) ||
  olderDays < 7 ||
  olderDays > 3650
) throw new Error("OBSERVATION_PROVENANCE_ARCHIVE_CONFIG_INVALID");

const db = createClient(url, role, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

const cutoff = new Date(Date.now() - olderDays * 86_400_000).toISOString();
const { data: candidates, error } = await db
  .from("live_external_observations")
  .select("observation_id,source_id,source_record_id,country_iso3,metric,observed_at,published_at,ingested_at,normalized_hash,provenance")
  .eq("source_id", SOURCE_ID)
  .lt("ingested_at", cutoff)
  .not("provenance", "eq", {})
  .order("ingested_at", { ascending: true })
  .limit(MAX_SCAN);
if (error) throw new Error(`OBSERVATION_PROVENANCE_ARCHIVE_QUERY_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);

let row = null;
for (const candidate of candidates ?? []) {
  const latest = await db
    .from("live_world_bank_indicator_latest")
    .select("observation_id")
    .eq("observation_id", candidate.observation_id)
    .maybeSingle();
  if (latest.error) throw new Error(`OBSERVATION_PROVENANCE_LATEST_CHECK_FAILED_${latest.error.code ?? "unknown"}`);
  if (!latest.data) {
    row = candidate;
    break;
  }
}

if (!row) {
  console.log(JSON.stringify({
    ok: true,
    archived: 0,
    reason: "no_historical_non_latest_wdi_candidate",
    cutoff,
    scanned: candidates?.length ?? 0,
  }));
  process.exit(0);
}

if (
  !String(row.observation_id ?? "").trim() ||
  row.source_id !== SOURCE_ID ||
  !row.provenance ||
  typeof row.provenance !== "object" ||
  Array.isArray(row.provenance) ||
  Object.keys(row.provenance).length === 0 ||
  !/^[0-9a-f]{64}$/i.test(String(row.normalized_hash ?? ""))
) throw new Error("OBSERVATION_PROVENANCE_ARCHIVE_SOURCE_INVALID");

const source = {
  schema: "geomacro.observation-provenance-archive.v1",
  observation_id: row.observation_id,
  source_id: row.source_id,
  source_record_id: row.source_record_id,
  country_iso3: row.country_iso3,
  metric: row.metric,
  observed_at: row.observed_at,
  published_at: row.published_at,
  ingested_at: row.ingested_at,
  normalized_hash: row.normalized_hash,
  provenance: row.provenance,
};
const raw = Buffer.from(JSON.stringify(source));
if (!raw.length || raw.length > 4_000_000) throw new Error("OBSERVATION_PROVENANCE_ARCHIVE_PAYLOAD_TOO_LARGE");
const compressed = gzipSync(raw, { level: 9 });
const provenanceSha = sha256(Buffer.from(JSON.stringify(row.provenance)));
const archiveKey = `geomacro-evidence/v1/observation-provenance/${row.observation_id}/${provenanceSha}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/observation-provenance/${row.observation_id}/${provenanceSha}.json`;

await b2.put(archiveKey, compressed);
const readback = await b2.get(archiveKey);
if (readback.length !== compressed.length || sha256(readback) !== sha256(compressed)) {
  throw new Error("OBSERVATION_PROVENANCE_ARCHIVE_READBACK_HASH_INVALID");
}
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (
  restored?.schema !== source.schema ||
  restored?.observation_id !== row.observation_id ||
  restored?.normalized_hash !== row.normalized_hash ||
  sha256(Buffer.from(JSON.stringify(restored?.provenance))) !== provenanceSha ||
  sha256(Buffer.from(JSON.stringify(restored))) !== sha256(raw)
) throw new Error("OBSERVATION_PROVENANCE_ARCHIVE_RESTORE_INVALID");

const proof = {
  schema: "geomacro.observation-provenance-archive-proof.v1",
  observation_id: row.observation_id,
  source_id: row.source_id,
  archive_bucket: ARCHIVE_BUCKET,
  archive_key: archiveKey,
  provenance_sha256: provenanceSha,
  archive_sha256: sha256(compressed),
  archive_bytes: compressed.length,
  historical_non_latest_verified: true,
  verified_at: new Date().toISOString(),
  destructive_cleanup_performed: false,
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

const latestRecheck = await db
  .from("live_world_bank_indicator_latest")
  .select("observation_id")
  .eq("observation_id", row.observation_id)
  .maybeSingle();
if (latestRecheck.error || latestRecheck.data) {
  throw new Error("OBSERVATION_PROVENANCE_ARCHIVE_LATEST_STATUS_CHANGED");
}

const { data: current, error: currentError } = await db
  .from("live_external_observations")
  .select("observation_id,source_id,normalized_hash,provenance")
  .eq("observation_id", row.observation_id)
  .single();
if (
  currentError ||
  current?.observation_id !== row.observation_id ||
  current?.source_id !== SOURCE_ID ||
  current?.normalized_hash !== row.normalized_hash ||
  sha256(Buffer.from(JSON.stringify(current?.provenance))) !== provenanceSha
) throw new Error("OBSERVATION_PROVENANCE_ARCHIVE_SOURCE_CHANGED");

console.log(JSON.stringify({
  ok: true,
  archived: 1,
  observation_id: row.observation_id,
  source_id: SOURCE_ID,
  cutoff,
  archive_key: archiveKey,
  archive_sha256: proof.archive_sha256,
  provenance_sha256: provenanceSha,
  full_b2_readback_verified: true,
  json_restore_verified: true,
  historical_non_latest_verified: true,
  source_row_retained: true,
  provenance_retained: true,
  destructive_cleanup_performed: false,
}));
