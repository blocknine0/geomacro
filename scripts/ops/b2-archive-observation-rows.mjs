#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const limit = Number(process.env.B2_COLD_OBSERVATION_LIMIT ?? 100);
if (url !== "https://ldpwajisioljyjtojvfx.supabase.co" || !role || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("B2_COLD_OBSERVATION_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: "geomacro-private-archive",
});
const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
const { data: candidates, error: candidateError } = await db.rpc("geomacro_next_cold_observation_rows_v1", { p_limit: limit });
if (candidateError) throw candidateError;
const observations = (candidates ?? [])
  .map((row) => row.observation)
  .filter((row) => row && Date.parse(String(row.ingested_at ?? "")) < Date.parse(cutoff));
if (!observations.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0 }));
  process.exit(0);
}

for (const row of observations) {
  if (
    row.raw_payload !== null ||
    !/^geomacro-evidence\/v1\/observation-bundles\/[A-Za-z0-9_./-]+\.json\.gz$/.test(String(row.archive_bundle_key ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(row.archive_bundle_sha256 ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(row.archive_member_sha256 ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(row.raw_hash ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(row.normalized_hash ?? ""))
  ) throw new Error(`B2_COLD_OBSERVATION_CANDIDATE_INVALID_${String(row.observation_id ?? "unknown")}`);
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const bundleId = `${stamp}-${randomUUID()}`;
const bundleKey = `geomacro-evidence/v1/observation-history/${bundleId}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/observation-history/proofs/${bundleId}.json`;
const deletionKey = `geomacro-evidence/v1/index/observation-history/deleted/${bundleId}.json`;
const bundle = {
  schema: "geomacro.observation-history-bundle.v1",
  bundle_id: bundleId,
  created_at: new Date().toISOString(),
  cutoff,
  entries: observations,
};
const packed = gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
if (packed.length > 18_000_000) throw new Error("B2_COLD_OBSERVATION_BUNDLE_TOO_LARGE");
const bundleSha = sha(packed);
await b2.put(bundleKey, packed);
const readback = await b2.get(bundleKey);
if (readback.length !== packed.length || sha(readback) !== bundleSha) throw new Error("B2_COLD_OBSERVATION_READBACK_INVALID");
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (restored?.schema !== bundle.schema || restored?.bundle_id !== bundleId || restored?.entries?.length !== observations.length) {
  throw new Error("B2_COLD_OBSERVATION_RESTORE_INVALID");
}
for (let i = 0; i < observations.length; i += 1) {
  const source = observations[i];
  const target = restored.entries[i];
  if (
    String(target?.observation_id ?? "") !== String(source.observation_id) ||
    String(target?.raw_hash ?? "") !== String(source.raw_hash) ||
    String(target?.normalized_hash ?? "") !== String(source.normalized_hash) ||
    String(target?.archive_bundle_key ?? "") !== String(source.archive_bundle_key)
  ) throw new Error(`B2_COLD_OBSERVATION_MEMBER_INVALID_${String(source.observation_id)}`);
}

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.observation-history-bundle-proof.v1",
  bundle_id: bundleId,
  archive_key: bundleKey,
  bundle_sha256: bundleSha,
  member_count: observations.length,
  verified_at: new Date().toISOString(),
  observation_ids: observations.map((row) => row.observation_id),
}));
await b2.put(proofKey, proof);
const proofReadback = await b2.get(proofKey);
if (sha(proofReadback) !== sha(proof)) throw new Error("B2_COLD_OBSERVATION_PROOF_READBACK_INVALID");

const { data: deleted, error: deleteError } = await db.rpc("geomacro_delete_verified_cold_observation_rows_v1", {
  p_cutoff: cutoff,
  p_items: observations.map((row) => ({
    observation_id: row.observation_id,
    raw_hash: row.raw_hash,
    normalized_hash: row.normalized_hash,
    ingested_at: row.ingested_at,
  })),
});
if (deleteError || !Array.isArray(deleted) || deleted.length !== observations.length) {
  throw deleteError ?? new Error("B2_COLD_OBSERVATION_DELETE_UNCONFIRMED");
}
const deletedIds = new Set(deleted.map((row) => String(row.observation_id)));
if (observations.some((row) => !deletedIds.has(String(row.observation_id)))) {
  throw new Error("B2_COLD_OBSERVATION_DELETE_SET_MISMATCH");
}

await b2.put(deletionKey, Buffer.from(JSON.stringify({
  schema: "geomacro.observation-history-source-deletion.v1",
  bundle_id: bundleId,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  deleted_observation_ids: observations.map((row) => row.observation_id),
  deleted_at: new Date().toISOString(),
})));

console.log(JSON.stringify({
  ok: true,
  status: observations.length < limit ? "complete" : "progress",
  processed: observations.length,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  delete_after_full_b2_readback: true,
}));
