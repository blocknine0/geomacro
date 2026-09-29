#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_BUCKET = "geomacro-live-intelligence";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const COUNTRY_SOURCE = "country_raw_web_mesh";
const MAX_BUNDLE_BYTES = 18_000_000;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const projectRef = (url) => { try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; } };

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const lookbackHours = Math.max(1, Math.min(72, Number(process.env.B2_INGEST_LOOKBACK_HOURS ?? 72)));
const rawBundleLimit = Math.max(1, Math.min(100, Number(process.env.B2_INGEST_RAW_BUNDLE_LIMIT ?? 25)));
const rawRounds = Math.max(1, Math.min(80, Number(process.env.B2_INGEST_RAW_ROUNDS ?? 40)));
const fragmentLimit = Math.max(1, Math.min(500, Number(process.env.B2_INGEST_FRAGMENT_LIMIT ?? 200)));

if (!url || !role || projectRef(url) !== PROJECT_REF) throw new Error("B2_INGEST_SUPABASE_CONFIG_INVALID");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});
const storage = db.storage.from(SOURCE_BUCKET);
const cutoff = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
const settleBefore = new Date(Date.now() - 120_000).toISOString();

async function archiveCountryFragments() {
  const { data: rows, error } = await db.from("live_fragment_manifest")
    .select("id,source_key,storage_bucket,object_path,payload_sha256,compressed_sha256,compressed_bytes,period_end")
    .eq("source_key", COUNTRY_SOURCE)
    .eq("storage_bucket", SOURCE_BUCKET)
    .like("object_path", "fragments/v1/%")
    .gte("period_end", cutoff)
    .lte("period_end", settleBefore)
    .order("period_end", { ascending: true })
    .limit(fragmentLimit);
  if (error) throw error;

  let moved = 0;
  let bytes = 0;
  for (const row of rows ?? []) {
    const id = String(row.id ?? "");
    const sourcePath = String(row.object_path ?? "");
    const compressedHash = String(row.compressed_sha256 ?? "");
    const payloadHash = String(row.payload_sha256 ?? "");
    const compressedBytes = Number(row.compressed_bytes ?? -1);
    if (!/^[0-9a-f-]{20,}$/i.test(id) || !/^fragments\/v1\/[A-Za-z0-9_./-]+\.ndjson\.gz$/.test(sourcePath) ||
        sourcePath.includes("..") || !/^[a-f0-9]{64}$/.test(compressedHash) || !/^[a-f0-9]{64}$/.test(payloadHash) ||
        !Number.isInteger(compressedBytes) || compressedBytes < 0 || compressedBytes > 8_000_000) {
      throw new Error(`B2_COUNTRY_FRAGMENT_METADATA_INVALID_${id || "unknown"}`);
    }

    const { data: blob, error: downloadError } = await storage.download(sourcePath);
    if (downloadError || !blob) throw new Error(`B2_COUNTRY_FRAGMENT_SOURCE_DOWNLOAD_FAILED_${id}`, { cause: downloadError });
    const packed = Buffer.from(await blob.arrayBuffer());
    if (packed.length !== compressedBytes || sha(packed) !== compressedHash) throw new Error(`B2_COUNTRY_FRAGMENT_COMPRESSED_HASH_INVALID_${id}`);
    const raw = gunzipSync(packed);
    if (sha(raw) !== payloadHash) throw new Error(`B2_COUNTRY_FRAGMENT_PAYLOAD_HASH_INVALID_${id}`);

    const archiveKey = `geomacro-evidence/v1/live/v1/country-raw/${id}-${compressedHash.slice(0, 16)}.ndjson.gz`;
    await b2.put(archiveKey, packed);
    const readback = await b2.get(archiveKey);
    if (readback.length !== packed.length || sha(readback) !== compressedHash || sha(gunzipSync(readback)) !== payloadHash) {
      throw new Error(`B2_COUNTRY_FRAGMENT_READBACK_INVALID_${id}`);
    }

    const { data: updated, error: updateError } = await db.from("live_fragment_manifest")
      .update({ storage_bucket: ARCHIVE_BUCKET, object_path: archiveKey, verified_at: new Date().toISOString(), verification_method: "b2-primary-readback-sha256" })
      .eq("id", id)
      .eq("storage_bucket", SOURCE_BUCKET)
      .eq("object_path", sourcePath)
      .eq("compressed_sha256", compressedHash)
      .select("id")
      .single();
    if (updateError || updated?.id !== id) throw updateError ?? new Error(`B2_COUNTRY_FRAGMENT_POINTER_UPDATE_FAILED_${id}`);

    const { data: removed, error: removeError } = await storage.remove([sourcePath]);
    if (removeError || !Array.isArray(removed) || removed.length !== 1) throw new Error(`B2_COUNTRY_FRAGMENT_SOURCE_REMOVE_UNCONFIRMED_${id}`, { cause: removeError });
    const { data: info, error: infoError } = await storage.info(sourcePath);
    if (info || !infoError || ![400, 404].includes(Number(infoError.statusCode ?? infoError.status))) {
      throw new Error(`B2_COUNTRY_FRAGMENT_SOURCE_STILL_PRESENT_${id}`);
    }
    moved += 1;
    bytes += packed.length;
  }
  return { moved, compressed_bytes: bytes };
}

async function loadRecentRawCandidates() {
  const { data: rows, error } = await db.from("live_raw_source_snapshots")
    .select("snapshot_id,storage_bucket,object_path,byte_count,content_sha256,fetched_at,archive_bundle_key")
    .eq("storage_bucket", SOURCE_BUCKET)
    .like("object_path", "raw/v1/%")
    .is("archive_bundle_key", null)
    .gte("fetched_at", cutoff)
    .lte("fetched_at", settleBefore)
    .order("fetched_at", { ascending: true })
    .limit(rawBundleLimit * 4);
  if (error) throw error;

  const members = [];
  for (const row of rows ?? []) {
    if (members.length >= rawBundleLimit) break;
    const id = String(row.snapshot_id ?? "");
    const sourcePath = String(row.object_path ?? "");
    const payloadHash = String(row.content_sha256 ?? "");
    const payloadBytes = Number(row.byte_count ?? -1);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) || !/^raw\/v1\/[A-Za-z0-9_./-]+\.gz$/.test(sourcePath) || sourcePath.includes("..") ||
        !/^[a-f0-9]{64}$/.test(payloadHash) || !Number.isInteger(payloadBytes) || payloadBytes < 0 || payloadBytes > 20_000_000) {
      throw new Error(`B2_RECENT_RAW_METADATA_INVALID_${id || "unknown"}`);
    }

    const { data: blob, error: downloadError } = await storage.download(sourcePath);
    if (downloadError || !blob) {
      const status = Number(downloadError?.statusCode ?? downloadError?.status ?? 0);
      if (status === 400 || status === 404) continue;
      throw new Error(`B2_RECENT_RAW_SOURCE_DOWNLOAD_FAILED_${id}`, { cause: downloadError });
    }
    const compressed = Buffer.from(await blob.arrayBuffer());
    const raw = gunzipSync(compressed);
    if (raw.length !== payloadBytes || sha(raw) !== payloadHash) throw new Error(`B2_RECENT_RAW_PAYLOAD_INVALID_${id}`);
    members.push({
      snapshot_id: id,
      object_path: sourcePath,
      fetched_at: String(row.fetched_at),
      payload_bytes: payloadBytes,
      payload_sha256: payloadHash,
      member_compressed_sha256: sha(compressed),
      compressed_b64: compressed.toString("base64"),
    });
  }
  return members;
}

async function archiveOneRawBundle() {
  const members = await loadRecentRawCandidates();
  if (!members.length) return { status: "complete", processed: 0, compressed_bytes: 0 };

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const bundleId = `${stamp}-0-${randomUUID()}`;
  const bundleKey = `geomacro-evidence/v1/raw-bundles/${bundleId}.json.gz`;
  const proofKey = `geomacro-evidence/v1/index/raw-bundles/${bundleId}.json`;
  const deletionKey = `geomacro-evidence/v1/index/raw-bundles-deleted/${bundleId}.json`;

  let selected = members;
  let bundle;
  let packed;
  while (selected.length) {
    bundle = { schema: "geomacro.raw-storage-bundle.v1", bundle_id: bundleId, shard_suffix: "0", created_at: new Date().toISOString(), entries: selected };
    packed = gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
    if (packed.length <= MAX_BUNDLE_BYTES) break;
    selected = selected.slice(0, -1);
  }
  if (!selected.length || !bundle || !packed) throw new Error("B2_RECENT_RAW_BUNDLE_CANNOT_FIT");

  await b2.put(bundleKey, packed);
  const readback = await b2.get(bundleKey);
  const bundleHash = sha(packed);
  if (readback.length !== packed.length || sha(readback) !== bundleHash) throw new Error("B2_RECENT_RAW_BUNDLE_READBACK_HASH_INVALID");
  const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  if (restored?.schema !== "geomacro.raw-storage-bundle.v1" || restored?.bundle_id !== bundleId || !Array.isArray(restored?.entries) || restored.entries.length !== selected.length) {
    throw new Error("B2_RECENT_RAW_BUNDLE_RESTORE_INVALID");
  }
  const restoredById = new Map(restored.entries.map((entry) => [entry.snapshot_id, entry]));
  for (const source of selected) {
    const entry = restoredById.get(source.snapshot_id);
    if (!entry || entry.object_path !== source.object_path || entry.payload_bytes !== source.payload_bytes || entry.payload_sha256 !== source.payload_sha256 || entry.member_compressed_sha256 !== source.member_compressed_sha256) {
      throw new Error(`B2_RECENT_RAW_MEMBER_METADATA_INVALID_${source.snapshot_id}`);
    }
    const compressed = Buffer.from(entry.compressed_b64, "base64");
    if (sha(compressed) !== source.member_compressed_sha256) throw new Error(`B2_RECENT_RAW_MEMBER_COMPRESSED_HASH_INVALID_${source.snapshot_id}`);
    const raw = gunzipSync(compressed);
    if (raw.length !== source.payload_bytes || sha(raw) !== source.payload_sha256) throw new Error(`B2_RECENT_RAW_MEMBER_RESTORE_INVALID_${source.snapshot_id}`);
  }

  await b2.put(proofKey, Buffer.from(JSON.stringify({
    schema: "geomacro.raw-storage-bundle-proof.v1", bundle_id: bundleId, archive_bucket: ARCHIVE_BUCKET,
    archive_key: bundleKey, bundle_sha256: bundleHash, bundle_bytes: packed.length, member_count: selected.length,
    verified_at: new Date().toISOString(), members: selected.map(({ snapshot_id, object_path, fetched_at, payload_bytes, payload_sha256, member_compressed_sha256 }) => ({ snapshot_id, object_path, fetched_at, payload_bytes, payload_sha256, member_compressed_sha256 })),
  })));

  const { data: marked, error: markError } = await db.rpc("geomacro_mark_verified_raw_bundle", {
    p_bundle_key: bundleKey,
    p_bundle_sha256: bundleHash,
    p_items: selected.map(({ snapshot_id, object_path, payload_sha256, member_compressed_sha256 }) => ({ snapshot_id, object_path, content_sha256: payload_sha256, member_compressed_sha256 })),
  });
  if (markError || !Array.isArray(marked) || marked.length !== selected.length) throw markError ?? new Error("B2_RECENT_RAW_BUNDLE_MARK_UNCONFIRMED");

  const paths = selected.map((entry) => entry.object_path);
  const { data: removed, error: removeError } = await storage.remove(paths);
  if (removeError || !Array.isArray(removed) || removed.length !== selected.length) throw new Error("B2_RECENT_RAW_SOURCE_REMOVE_UNCONFIRMED", { cause: removeError });
  const { data: present, error: presenceError } = await db.rpc("geomacro_raw_storage_paths_present", { p_paths: paths });
  if (presenceError || !Array.isArray(present) || present.length !== 0) throw new Error("B2_RECENT_RAW_SOURCE_STILL_PRESENT", { cause: presenceError });

  await b2.put(deletionKey, Buffer.from(JSON.stringify({
    schema: "geomacro.raw-storage-bundle-source-deletion.v1", bundle_id: bundleId, archive_key: bundleKey,
    archive_proof_key: proofKey, deleted_paths: paths, deleted_at: new Date().toISOString(), reason: "post-ingest-b2-primary-offload",
  })));

  return { status: "progress", processed: selected.length, compressed_bytes: packed.length };
}

async function main() {
  const fragments = await archiveCountryFragments();
  let rawProcessed = 0;
  let rawCompressedBytes = 0;
  let rounds = 0;
  for (; rounds < rawRounds; rounds += 1) {
    const result = await archiveOneRawBundle();
    rawProcessed += result.processed;
    rawCompressedBytes += result.compressed_bytes;
    if (result.status === "complete") break;
  }
  console.log(JSON.stringify({
    ok: true,
    mode: "post-ingest-b2-primary-offload",
    cutoff,
    settle_before: settleBefore,
    fragments,
    raw: { processed: rawProcessed, compressed_bytes: rawCompressedBytes, rounds },
    verification: "full-b2-readback-before-pointer-update-and-source-delete",
    supabase_storage_retention_target: "ephemeral-ingest-buffer-only",
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
