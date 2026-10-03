#!/usr/bin/env node
// Archive up to 100 Supabase raw Storage objects in one B2 bundle, perform one
// full B2 readback for the entire bundle, verify every member, then mark DB
// archive pointers and remove only those verified Storage objects via Storage API.
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { packAdaptiveRawStorageBundle, verifyRawStorageBundle } from "./raw-storage-bundle-codec.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_READ_STATUSES = new Set([429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const MAX_BUNDLE_BYTES = 18_000_000;
const MAX_SOURCE_RAW_BYTES = 30_000_000;
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const limit = Number(process.env.B2_RAW_BUNDLE_LIMIT ?? 100);
const suffix = String(process.env.B2_RAW_MAINTENANCE_SUFFIX ?? "").trim().toLowerCase();

if (url !== "https://ldpwajisioljyjtojvfx.supabase.co" || !role ||
    !Number.isInteger(limit) || limit < 1 || limit > 100 || !/^[0-9a-f]$/.test(suffix)) {
  throw new Error("B2_RAW_BUNDLE_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: "geomacro-private-archive",
});
const storage = db.storage.from("geomacro-live-intelligence");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const bundleId = `${stamp}-${suffix}-${randomUUID()}`;
const bundleKey = `geomacro-evidence/v1/raw-bundles/${bundleId}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/raw-bundles/${bundleId}.json`;
const deletionKey = `geomacro-evidence/v1/index/raw-bundles-deleted/${bundleId}.json`;

async function archiveRead() {
  // Probe the deployed Edge reader with the one-object canary. For bulk
  // bundles, read the full object from B2 and keep every member check below.
  if (limit > 1) {
    const bytes = await b2.get(bundleKey);
    if (bytes.length > 20_000_000) throw new Error("B2_RAW_BUNDLE_VERIFY_READ_TOO_LARGE");
    return bytes;
  }
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${url}/functions/v1/archive-verify-read`, {
        method: "POST",
        headers: { authorization: `Bearer ${role}`, "content-type": "application/json" },
        body: JSON.stringify({ kind: "raw-bundle", id: bundleId, part: "archive" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 20_000_000) throw new Error("B2_RAW_BUNDLE_VERIFY_READ_TOO_LARGE");
        return bytes;
      }
      if (!TRANSIENT_READ_STATUSES.has(response.status) || attempt === READ_ATTEMPTS) {
        throw new Error(`B2_RAW_BUNDLE_VERIFY_READ_FAILED_${response.status}`);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message === "B2_RAW_BUNDLE_VERIFY_READ_TOO_LARGE" || /^B2_RAW_BUNDLE_VERIFY_READ_FAILED_\d+$/.test(message) || attempt === READ_ATTEMPTS) throw cause;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error("B2_RAW_BUNDLE_VERIFY_READ_RETRY_EXHAUSTED");
}

const { data: budget, error: budgetError } = await db.rpc("geomacro_free_tier_budget_state");
if (budgetError || !budget) throw budgetError ?? new Error("SUPABASE_BUDGET_STATE_UNAVAILABLE");
const { data: candidates, error } = await db.rpc("geomacro_next_raw_storage_candidates_shard", {
  p_suffix: suffix,
  p_limit: limit,
});
if (error) throw error;
if (!candidates?.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0, budget, shard_suffix: suffix }));
  process.exit(0);
}

const members = [];
let sourceRawBytes = 0;
for (const row of candidates) {
  const id = String(row.snapshot_id ?? "");
  const path = String(row.object_path ?? "");
  const payloadHash = String(row.content_sha256 ?? "");
  const payloadBytes = Number(row.byte_count);
  const fetchedAt = String(row.fetched_at ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) || !id.toLowerCase().endsWith(suffix) ||
      row.storage_bucket !== "geomacro-live-intelligence" || !/^raw\/v1\/[A-Za-z0-9_./-]+\.gz$/.test(path) || path.includes("..") ||
      !/^[a-f0-9]{64}$/.test(payloadHash) || !Number.isInteger(payloadBytes) || payloadBytes < 0 || payloadBytes > 20_000_000 ||
      !Number.isFinite(Date.parse(fetchedAt)) || Date.now() - Date.parse(fetchedAt) < 72 * 3_600_000) {
    throw new Error(`B2_RAW_BUNDLE_CANDIDATE_INVALID_${id || "unknown"}`);
  }
  if (members.length > 0 && sourceRawBytes + payloadBytes > MAX_SOURCE_RAW_BYTES) break;

  const { data: blob, error: downloadError } = await storage.download(path);
  if (downloadError || !blob) throw new Error(`B2_RAW_BUNDLE_SOURCE_DOWNLOAD_FAILED_${id}`, { cause: downloadError });
  const sourceCompressed = Buffer.from(await blob.arrayBuffer());
  const payload = gunzipSync(sourceCompressed, { maxOutputLength: payloadBytes + 1 });
  if (payload.length !== payloadBytes || sha(payload) !== payloadHash) throw new Error(`B2_RAW_BUNDLE_SOURCE_PAYLOAD_MISMATCH_${id}`);
  members.push({
    snapshot_id: id,
    object_path: path,
    fetched_at: fetchedAt,
    payload_bytes: payloadBytes,
    payload_sha256: payloadHash,
    member_compressed_sha256: sha(sourceCompressed),
    payload,
    source_compressed: sourceCompressed,
  });
  sourceRawBytes += payloadBytes;
}
if (!members.length) throw new Error("B2_RAW_BUNDLE_EMPTY");

let selected = members;
let packedBundle;
const createdAt = new Date().toISOString();
while (selected.length) {
  packedBundle = packAdaptiveRawStorageBundle({ bundleId, shardSuffix: suffix, createdAt, members: selected });
  if (packedBundle.packed.length <= MAX_BUNDLE_BYTES) break;
  selected = selected.slice(0, -1);
}
if (!selected.length || !packedBundle || packedBundle.packed.length > MAX_BUNDLE_BYTES) throw new Error("B2_RAW_BUNDLE_CANNOT_FIT");

await b2.put(bundleKey, packedBundle.packed);
const readback = await archiveRead();
const bundleSha = sha(packedBundle.packed);
if (readback.length !== packedBundle.packed.length || sha(readback) !== bundleSha) throw new Error("B2_RAW_BUNDLE_READBACK_HASH_INVALID");
let verifiedBundle;
try {
  verifiedBundle = verifyRawStorageBundle({
    bytes: readback,
    expectedSha256: bundleSha,
    expectedBundleId: bundleId,
    expectedShardSuffix: suffix,
    expectedMembers: selected,
  });
} catch (cause) {
  throw new Error("B2_RAW_BUNDLE_MEMBER_RESTORE_INVALID_bundle", { cause });
}

const proof = {
  schema: "geomacro.raw-storage-bundle-proof.v2",
  bundle_id: bundleId,
  archive_bucket: "geomacro-private-archive",
  archive_key: bundleKey,
  bundle_schema: packedBundle.schema,
  storage_encoding: packedBundle.storage_encoding,
  bundle_sha256: bundleSha,
  bundle_bytes: packedBundle.packed.length,
  baseline_v1_bytes: packedBundle.baseline_v1_bytes,
  candidate_v2_bytes: packedBundle.candidate_v2_bytes,
  bytes_saved_vs_v1: packedBundle.bytes_saved_vs_v1,
  saving_ratio_vs_v1: packedBundle.saving_ratio_vs_v1,
  member_count: selected.length,
  full_b2_readback_verified: true,
  member_payload_restore_verified: true,
  verified_at: new Date().toISOString(),
  members: selected.map(({ snapshot_id, object_path, fetched_at, payload_bytes, payload_sha256, member_compressed_sha256 }) => ({
    snapshot_id, object_path, fetched_at, payload_bytes, payload_sha256, member_compressed_sha256,
  })),
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

const { data: marked, error: markError } = await db.rpc("geomacro_mark_verified_raw_bundle", {
  p_bundle_key: bundleKey,
  p_bundle_sha256: bundleSha,
  p_items: selected.map(({ snapshot_id, object_path, payload_sha256, member_compressed_sha256 }) => ({
    snapshot_id,
    object_path,
    content_sha256: payload_sha256,
    member_compressed_sha256,
  })),
});
if (markError || !Array.isArray(marked) || marked.length !== selected.length) throw markError ?? new Error("B2_RAW_BUNDLE_MARK_UNCONFIRMED");
const markedIds = new Set(marked.map((row) => String(row.snapshot_id)));
if (selected.some((entry) => !markedIds.has(entry.snapshot_id))) throw new Error("B2_RAW_BUNDLE_MARK_SET_MISMATCH");

const paths = selected.map((entry) => entry.object_path);
const { data: removed, error: removeError } = await storage.remove(paths);
if (removeError || !Array.isArray(removed) || removed.length !== selected.length) {
  throw new Error("B2_RAW_BUNDLE_SOURCE_REMOVE_UNCONFIRMED", { cause: removeError });
}
const { data: present, error: presenceError } = await db.rpc("geomacro_raw_storage_paths_present", { p_paths: paths });
if (presenceError || !Array.isArray(present) || present.length !== 0) throw new Error("B2_RAW_BUNDLE_SOURCE_STILL_PRESENT", { cause: presenceError });

await b2.put(deletionKey, Buffer.from(JSON.stringify({
  schema: "geomacro.raw-storage-bundle-source-deletion.v1",
  bundle_id: bundleId,
  archive_key: bundleKey,
  archive_proof_key: proofKey,
  bundle_schema: verifiedBundle.schema,
  deleted_paths: paths,
  deleted_at: new Date().toISOString(),
})));

console.log(JSON.stringify({
  ok: true,
  status: "progress",
  bundle_id: bundleId,
  processed: selected.length,
  bundle_schema: packedBundle.schema,
  storage_encoding: packedBundle.storage_encoding,
  archived_compressed_bytes: packedBundle.packed.length,
  baseline_v1_bytes: packedBundle.baseline_v1_bytes,
  candidate_v2_bytes: packedBundle.candidate_v2_bytes,
  bytes_saved_vs_v1: packedBundle.bytes_saved_vs_v1,
  saving_ratio_vs_v1: packedBundle.saving_ratio_vs_v1,
  b2_full_gets: 1,
  raw_objects_per_b2_get: selected.length,
  supabase_sources_absent: true,
  storage_deletion_via_api_only: true,
  source_manifest_rows_preserved: true,
  shard_suffix: suffix,
  budget,
  verification_mode: "one-full-bundle-readback-before-storage-api-cleanup",
}));
