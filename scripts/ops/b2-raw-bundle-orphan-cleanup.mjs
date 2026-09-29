#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const SOURCE_BUCKET = "geomacro-live-intelligence";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const limit = Number(process.env.B2_RAW_ORPHAN_LIMIT ?? 100);
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (url !== PROJECT_URL || !role || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("B2_RAW_ORPHAN_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});
const storage = db.storage.from(SOURCE_BUCKET);

const { data: rows, error } = await db.rpc("geomacro_next_raw_bundle_source_orphans", { p_limit: limit });
if (error) throw error;
if (!rows?.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", cleaned: 0, source_bytes_removed: 0 }));
  process.exit(0);
}

const groups = new Map();
for (const row of rows) {
  const id = String(row.snapshot_id ?? "");
  const path = String(row.object_path ?? "");
  const bundleKey = String(row.archive_bundle_key ?? "");
  const bundleSha = String(row.archive_bundle_sha256 ?? "");
  const memberSha = String(row.archive_member_sha256 ?? "");
  const payloadSha = String(row.content_sha256 ?? "");
  const payloadBytes = Number(row.byte_count ?? -1);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) || row.storage_bucket !== SOURCE_BUCKET ||
      !/^raw\/v1\/[A-Za-z0-9_./-]+\.gz$/.test(path) || path.includes("..") ||
      !/^geomacro-evidence\/v1\/raw-bundles\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$/.test(bundleKey) ||
      !/^[a-f0-9]{64}$/.test(bundleSha) || !/^[a-f0-9]{64}$/.test(memberSha) ||
      !/^[a-f0-9]{64}$/.test(payloadSha) || !Number.isInteger(payloadBytes) || payloadBytes < 0 || payloadBytes > 20_000_000) {
    throw new Error(`B2_RAW_ORPHAN_ROW_INVALID_${id || "unknown"}`);
  }
  const group = groups.get(bundleKey) ?? { bundleSha, rows: [] };
  if (group.bundleSha !== bundleSha) throw new Error("B2_RAW_ORPHAN_BUNDLE_SHA_CONFLICT");
  group.rows.push({ id, path, memberSha, payloadSha, payloadBytes });
  groups.set(bundleKey, group);
}

let cleaned = 0;
let sourceBytesRemoved = 0;
for (const [bundleKey, group] of groups) {
  const archived = await b2.get(bundleKey);
  if (sha(archived) !== group.bundleSha) throw new Error(`B2_RAW_ORPHAN_BUNDLE_HASH_INVALID_${bundleKey}`);
  const restored = JSON.parse(gunzipSync(archived).toString("utf8"));
  if (restored?.schema !== "geomacro.raw-storage-bundle.v1" || !Array.isArray(restored?.entries)) {
    throw new Error(`B2_RAW_ORPHAN_BUNDLE_SCHEMA_INVALID_${bundleKey}`);
  }
  const restoredById = new Map(restored.entries.map((entry) => [String(entry.snapshot_id), entry]));
  const paths = [];
  for (const row of group.rows) {
    const entry = restoredById.get(row.id);
    if (!entry || String(entry.object_path) !== row.path || Number(entry.payload_bytes) !== row.payloadBytes ||
        String(entry.payload_sha256) !== row.payloadSha || String(entry.member_compressed_sha256) !== row.memberSha) {
      throw new Error(`B2_RAW_ORPHAN_MEMBER_METADATA_INVALID_${row.id}`);
    }
    const memberCompressed = Buffer.from(String(entry.compressed_b64 ?? ""), "base64");
    if (sha(memberCompressed) !== row.memberSha) throw new Error(`B2_RAW_ORPHAN_MEMBER_HASH_INVALID_${row.id}`);
    const payload = gunzipSync(memberCompressed);
    if (payload.length !== row.payloadBytes || sha(payload) !== row.payloadSha) {
      throw new Error(`B2_RAW_ORPHAN_PAYLOAD_INVALID_${row.id}`);
    }
    const { data: source, error: sourceError } = await storage.download(row.path);
    if (sourceError || !source) throw new Error(`B2_RAW_ORPHAN_SOURCE_DOWNLOAD_FAILED_${row.id}`, { cause: sourceError });
    const sourceCompressed = Buffer.from(await source.arrayBuffer());
    if (sourceCompressed.length !== memberCompressed.length || sha(sourceCompressed) !== row.memberSha || !sourceCompressed.equals(memberCompressed)) {
      throw new Error(`B2_RAW_ORPHAN_SOURCE_BYTES_MISMATCH_${row.id}`);
    }
    paths.push(row.path);
    sourceBytesRemoved += sourceCompressed.length;
  }

  const { data: removed, error: removeError } = await storage.remove(paths);
  if (removeError || !Array.isArray(removed) || removed.length !== paths.length) {
    throw new Error(`B2_RAW_ORPHAN_REMOVE_UNCONFIRMED_${bundleKey}`, { cause: removeError });
  }
  const { data: present, error: presentError } = await db.rpc("geomacro_raw_storage_paths_present", { p_paths: paths });
  if (presentError || !Array.isArray(present) || present.length !== 0) {
    throw new Error(`B2_RAW_ORPHAN_SOURCE_STILL_PRESENT_${bundleKey}`);
  }

  const bundleId = bundleKey.split("/").at(-1).replace(/\.json\.gz$/, "");
  const proofKey = `geomacro-evidence/v1/index/raw-bundle-orphan-cleanup/${bundleId}.json`;
  const proof = Buffer.from(JSON.stringify({
    schema: "geomacro.raw-storage-orphan-cleanup.v1",
    bundle_id: bundleId,
    archive_bucket: ARCHIVE_BUCKET,
    archive_key: bundleKey,
    archive_sha256: group.bundleSha,
    deleted_paths: paths,
    cleaned_at: new Date().toISOString(),
    verification: "bundle-sha-member-sha-payload-sha-and-source-byte-equality",
  }));
  await b2.put(proofKey, proof);
  const proofReadback = await b2.get(proofKey);
  if (sha(proofReadback) !== sha(proof)) throw new Error(`B2_RAW_ORPHAN_PROOF_READBACK_INVALID_${bundleId}`);
  cleaned += paths.length;
}

console.log(JSON.stringify({
  ok: true,
  status: cleaned === rows.length ? "complete" : "progress",
  cleaned,
  source_bytes_removed: sourceBytesRemoved,
  bundles_verified: groups.size,
  database_rows_deleted: 0,
  verification: "bundle-sha-member-sha-payload-sha-and-source-byte-equality-before-storage-api-delete",
}));
