#!/usr/bin/env node
// Bundle many old observation payloads into one B2 object, perform exactly one
// full archive readback for the bundle, verify every member, then atomically
// clear only the verified Supabase payloads while recording the bundle pointer.
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_READ_STATUSES = new Set([429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const MAX_COMPRESSED_BYTES = 18_000_000;
const MAX_RAW_BUNDLE_BYTES = 40_000_000;
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const limit = Number(process.env.OBS_BUNDLE_LIMIT ?? 100);
const suffix = String(process.env.OBS_ARCHIVE_SUFFIX ?? "").trim().toLowerCase();

if (url !== "https://ldpwajisioljyjtojvfx.supabase.co" || !role ||
    !Number.isInteger(limit) || limit < 1 || limit > 100 || !/^[0-9a-f]$/.test(suffix)) {
  throw new Error("OBS_BUNDLE_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID, secretKey: process.env.B2_APPLICATION_KEY,
  bucket: "geomacro-private-archive" });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const bundleId = `${stamp}-${suffix}-${randomUUID()}`;
const archiveKey = `geomacro-evidence/v1/observation-bundles/${bundleId}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/observation-bundles/${bundleId}.json`;

async function archiveRead() {
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${url}/functions/v1/archive-verify-read`, {
        method: "POST",
        headers: { authorization: `Bearer ${role}`, "content-type": "application/json" },
        body: JSON.stringify({ kind: "observation-bundle", id: bundleId, part: "archive" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 20_000_000) throw new Error("OBS_BUNDLE_VERIFY_READ_TOO_LARGE");
        return bytes;
      }
      if (!TRANSIENT_READ_STATUSES.has(response.status) || attempt === READ_ATTEMPTS) throw new Error(`OBS_BUNDLE_VERIFY_READ_FAILED_${response.status}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message === "OBS_BUNDLE_VERIFY_READ_TOO_LARGE" || /^OBS_BUNDLE_VERIFY_READ_FAILED_\d+$/.test(message) || attempt === READ_ATTEMPTS) throw cause;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error("OBS_BUNDLE_VERIFY_READ_RETRY_EXHAUSTED");
}

const { data: candidates, error } = await db.rpc("geomacro_next_observation_archive_candidates", { p_suffix: suffix, p_limit: limit });
if (error) throw error;
if (!candidates?.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0, shard_suffix: suffix }));
  process.exit(0);
}

const selected = [];
let rawBytes = 0;
for (const row of candidates) {
  if (!row.observation_id || !String(row.observation_id).toLowerCase().endsWith(suffix) ||
      !/^[a-f0-9]{64}$/.test(String(row.raw_hash ?? "")) || !row.raw_payload ||
      Date.now() - Date.parse(row.ingested_at) < 72 * 3_600_000) throw new Error("OBS_BUNDLE_SOURCE_INVALID");
  const payloadBytes = Buffer.from(JSON.stringify(row.raw_payload));
  if (payloadBytes.length > 2_000_000) throw new Error("OBS_BUNDLE_MEMBER_TOO_LARGE");
  if (selected.length > 0 && rawBytes + payloadBytes.length > MAX_RAW_BUNDLE_BYTES) break;
  selected.push({ observation_id: row.observation_id, raw_hash: row.raw_hash, ingested_at: row.ingested_at,
    raw_payload: row.raw_payload, payload_sha256: sha(payloadBytes) });
  rawBytes += payloadBytes.length;
}
if (!selected.length) throw new Error("OBS_BUNDLE_EMPTY");

let bundle;
let compressed;
while (selected.length) {
  bundle = { schema: "geomacro.observation-raw-bundle.v1", bundle_id: bundleId, shard_suffix: suffix,
    created_at: new Date().toISOString(), entries: selected };
  compressed = gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
  if (compressed.length <= MAX_COMPRESSED_BYTES) break;
  selected.pop();
}
if (!selected.length || !bundle || !compressed) throw new Error("OBS_BUNDLE_CANNOT_FIT");

await b2.put(archiveKey, compressed);
const readback = await archiveRead();
const bundleSha = sha(compressed);
if (sha(readback) !== bundleSha) throw new Error("OBS_BUNDLE_COMPRESSED_HASH_MISMATCH");
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (restored?.schema !== "geomacro.observation-raw-bundle.v1" || restored?.bundle_id !== bundleId ||
    restored?.shard_suffix !== suffix || !Array.isArray(restored?.entries) || restored.entries.length !== selected.length) {
  throw new Error("OBS_BUNDLE_RESTORE_INVALID");
}
const restoredById = new Map(restored.entries.map((entry) => [entry.observation_id, entry]));
for (const source of selected) {
  const entry = restoredById.get(source.observation_id);
  if (!entry || entry.raw_hash !== source.raw_hash || entry.ingested_at !== source.ingested_at ||
      entry.payload_sha256 !== source.payload_sha256 || sha(Buffer.from(JSON.stringify(entry.raw_payload))) !== source.payload_sha256 ||
      JSON.stringify(entry.raw_payload) !== JSON.stringify(source.raw_payload)) {
    throw new Error(`OBS_BUNDLE_MEMBER_RESTORE_INVALID_${source.observation_id}`);
  }
}

const bundleProof = {
  schema: "geomacro.observation-raw-bundle-proof.v1", bundle_id: bundleId, archive_key: archiveKey,
  shard_suffix: suffix, member_count: selected.length, compressed_sha256: bundleSha,
  compressed_bytes: compressed.length, verified_at: new Date().toISOString(),
  members: selected.map((entry) => ({ observation_id: entry.observation_id, raw_hash: entry.raw_hash,
    payload_sha256: entry.payload_sha256, source_ingested_at: entry.ingested_at })),
};
await b2.put(proofKey, Buffer.from(JSON.stringify(bundleProof)));

// One DB transaction records the exact verified bundle/member hashes and clears
// raw_payload only if every source row still matches the pre-readback payload.
const { data: cleared, error: clearError } = await db.rpc("geomacro_clear_verified_observation_bundle_v2", {
  p_bundle_key: archiveKey,
  p_bundle_sha256: bundleSha,
  p_items: selected.map(({ observation_id, raw_hash, raw_payload, payload_sha256 }) => ({
    observation_id, raw_hash, raw_payload, payload_sha256,
  })),
});
if (clearError || !Array.isArray(cleared) || cleared.length !== selected.length) throw clearError ?? new Error("OBS_BUNDLE_CLEAR_UNCONFIRMED");
const clearedIds = new Set(cleared.map((row) => row.observation_id));
if (selected.some((entry) => !clearedIds.has(entry.observation_id))) throw new Error("OBS_BUNDLE_CLEAR_SET_MISMATCH");

console.log(JSON.stringify({ ok: true, status: "progress", bundle_id: bundleId, archived: selected.length,
  shard_suffix: suffix, bundle_compressed_bytes: compressed.length, b2_full_gets: 1,
  b2_puts_per_bundle: 2, observations_per_b2_get: selected.length, source_rows_retained: true,
  bundle_pointer_recorded: true, normalized_hashes_retained: true,
  verification_mode: "one-full-bundle-readback-before-atomic-cleanup" }));
