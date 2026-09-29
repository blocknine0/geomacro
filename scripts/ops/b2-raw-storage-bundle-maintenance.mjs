#!/usr/bin/env node
// Archive up to 100 Supabase raw Storage objects in one B2 bundle, perform one
// full B2 readback for the entire bundle, verify every member, then mark DB
// archive pointers and remove only those verified Storage objects via Storage API.
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_READ_STATUSES = new Set([429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const MAX_BUNDLE_BYTES = 18_000_000;
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

  const { data: blob, error: downloadError } = await storage.download(path);
  if (downloadError || !blob) throw new Error(`B2_RAW_BUNDLE_SOURCE_DOWNLOAD_FAILED_${id}`, { cause: downloadError });
  const compressed = Buffer.from(await blob.arrayBuffer());
  const raw = gunzipSync(compressed);
  if (raw.length !== payloadBytes || sha(raw) !== payloadHash) throw new Error(`B2_RAW_BUNDLE_SOURCE_PAYLOAD_MISMATCH_${id}`);
  members.push({
    snapshot_id: id,
    object_path: path,
    fetched_at: fetchedAt,
    payload_bytes: payloadBytes,
    payload_sha256: payloadHash,
    member_compressed_sha256: sha(compressed),
    compressed_b64: compressed.toString("base64"),
  });
}

let selected = members;
let bundle;
let packed;
while (selected.length) {
  bundle = {
    schema: "geomacro.raw-storage-bundle.v1",
    bundle_id: bundleId,
    shard_suffix: suffix,
    created_at: new Date().toISOString(),
    entries: selected,
  };
  packed = gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
  if (packed.length <= MAX_BUNDLE_BYTES) break;
  selected = selected.slice(0, -1);
}
if (!selected.length || !bundle || !packed) throw new Error("B2_RAW_BUNDLE_CANNOT_FIT");

await b2.put(bundleKey, packed);
const readback = await archiveRead();
const bundleSha = sha(packed);
if (readback.length !== packed.length || sha(readback) !== bundleSha) throw new Error("B2_RAW_BUNDLE_READBACK_HASH_INVALID");
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (restored?.schema !== "geomacro.raw-storage-bundle.v1" || restored?.bundle_id !== bundleId ||
    restored?.shard_suffix !== suffix || !Array.isArray(restored?.entries) || restored.entries.length !== selected.length) {
  throw new Error("B2_RAW_BUNDLE_RESTORE_INVALID");
}
const restoredById = new Map(restored.entries.map((entry) => [entry.snapshot_id, entry]));
for (const source of selected) {
  const entry = restoredById.get(source.snapshot_id);
  if (!entry || entry.object_path !== source.object_path || entry.payload_bytes !== source.payload_bytes ||
      entry.payload_sha256 !== source.payload_sha256 || entry.member_compressed_sha256 !== source.member_compressed_sha256) {
    throw new Error(`B2_RAW_BUNDLE_MEMBER_METADATA_INVALID_${source.snapshot_id}`);
  }
  const memberCompressed = Buffer.from(entry.compressed_b64, "base64");
  if (sha(memberCompressed) !== source.member_compressed_sha256) throw new Error(`B2_RAW_BUNDLE_MEMBER_COMPRESSED_HASH_INVALID_${source.snapshot_id}`);
  const memberRaw = gunzipSync(memberCompressed);
  if (memberRaw.length !== source.payload_bytes || sha(memberRaw) !== source.payload_sha256) {
    throw new Error(`B2_RAW_BUNDLE_MEMBER_RESTORE_INVALID_${source.snapshot_id}`);
  }
}

const proof = {
  schema: "geomacro.raw-storage-bundle-proof.v1",
  bundle_id: bundleId,
  archive_bucket: "geomacro-private-archive",
  archive_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_bytes: packed.length,
  member_count: selected.length,
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
  deleted_paths: paths,
  deleted_at: new Date().toISOString(),
})));

console.log(JSON.stringify({
  ok: true,
  status: "progress",
  bundle_id: bundleId,
  processed: selected.length,
  archived_compressed_bytes: packed.length,
  b2_full_gets: 1,
  raw_objects_per_b2_get: selected.length,
  supabase_sources_absent: true,
  storage_deletion_via_api_only: true,
  source_manifest_rows_preserved: true,
  shard_suffix: suffix,
  budget,
  verification_mode: "one-full-bundle-readback-before-storage-api-cleanup",
}));
