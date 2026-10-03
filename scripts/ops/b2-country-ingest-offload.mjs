#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { packAdaptiveRawStorageBundle, verifyRawStorageBundle } from "./raw-storage-bundle-codec.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_BUCKET = "geomacro-live-intelligence";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const MAX_BUNDLE_BYTES = 18_000_000;
const MAX_SOURCE_RAW_BYTES = 30_000_000;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const projectRef = (url) => { try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; } };

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const lookbackHours = Math.max(1, Math.min(72, Number(process.env.B2_INGEST_LOOKBACK_HOURS ?? 72)));
const rawBundleLimit = Math.max(1, Math.min(100, Number(process.env.B2_INGEST_RAW_BUNDLE_LIMIT ?? 25)));
const rawRounds = Math.max(1, Math.min(80, Number(process.env.B2_INGEST_RAW_ROUNDS ?? 40)));
const historicalDrain = String(process.env.B2_INGEST_HISTORICAL_DRAIN ?? "0") === "1";

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

// live_fragment_manifest is intentionally immutable. Do not rewrite its
// storage_bucket/object_path fields as part of raw-snapshot offload. Fragment
// archival requires a separate immutable sidecar/location resolver and is not
// allowed to block verified raw snapshot drainage.
function fragmentDisposition() {
  return {
    moved: 0,
    compressed_bytes: 0,
    disposition: "retained_in_supabase_until_immutable_archive_resolver_exists",
  };
}

async function loadRawCandidates() {
  let query = db.from("live_raw_source_snapshots")
    .select("snapshot_id,storage_bucket,object_path,byte_count,content_sha256,fetched_at,archive_bundle_key")
    .eq("storage_bucket", SOURCE_BUCKET)
    .like("object_path", "raw/v1/%")
    .is("archive_bundle_key", null)
    .lte("fetched_at", settleBefore)
    .order("fetched_at", { ascending: true })
    .limit(rawBundleLimit * 4);

  // Default production mode remains the bounded recent post-ingest window.
  // Historical drain is explicit and selects only rows older than that window,
  // so the two modes cannot race over the same snapshots.
  query = historicalDrain
    ? query.lt("fetched_at", cutoff)
    : query.gte("fetched_at", cutoff);

  const { data: rows, error } = await query;
  if (error) throw new Error(`B2_RECENT_RAW_QUERY_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);

  const members = [];
  let rawBytes = 0;
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
    if (members.length > 0 && rawBytes + payloadBytes > MAX_SOURCE_RAW_BYTES) break;

    const { data: blob, error: downloadError } = await storage.download(sourcePath);
    if (downloadError || !blob) {
      const status = Number(downloadError?.statusCode ?? downloadError?.status ?? 0);
      if (status === 400 || status === 404) continue;
      throw new Error(`B2_RECENT_RAW_SOURCE_DOWNLOAD_FAILED_${id}_${status || "unknown"}`);
    }
    const sourceCompressed = Buffer.from(await blob.arrayBuffer());
    const payload = gunzipSync(sourceCompressed, { maxOutputLength: payloadBytes + 1 });
    if (payload.length !== payloadBytes || sha(payload) !== payloadHash) throw new Error(`B2_RECENT_RAW_PAYLOAD_INVALID_${id}`);
    members.push({
      snapshot_id: id,
      object_path: sourcePath,
      fetched_at: String(row.fetched_at),
      payload_bytes: payloadBytes,
      payload_sha256: payloadHash,
      member_compressed_sha256: sha(sourceCompressed),
      payload,
      source_compressed: sourceCompressed,
    });
    rawBytes += payloadBytes;
  }
  return members;
}

async function archiveOneRawBundle() {
  const members = await loadRawCandidates();
  if (!members.length) return { status: "complete", processed: 0, compressed_bytes: 0, bytes_saved_vs_v1: 0 };

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const bundleId = `${stamp}-0-${randomUUID()}`;
  const bundleKey = `geomacro-evidence/v1/raw-bundles/${bundleId}.json.gz`;
  const proofKey = `geomacro-evidence/v1/index/raw-bundles/${bundleId}.json`;
  const deletionKey = `geomacro-evidence/v1/index/raw-bundles-deleted/${bundleId}.json`;
  const preflightKey = `geomacro-evidence/v1/health/raw-read-preflight/${bundleId}.missing`;

  let selected = members;
  let packedBundle;
  const createdAt = new Date().toISOString();
  while (selected.length) {
    packedBundle = packAdaptiveRawStorageBundle({ bundleId, shardSuffix: "0", createdAt, members: selected });
    if (packedBundle.packed.length <= MAX_BUNDLE_BYTES) break;
    selected = selected.slice(0, -1);
  }
  if (!selected.length || !packedBundle || packedBundle.packed.length > MAX_BUNDLE_BYTES) throw new Error("B2_RECENT_RAW_BUNDLE_CANNOT_FIT");

  // Fail closed before any new archive write if B2 read capability is blocked.
  const preflight = await b2.getOptional(preflightKey);
  if (preflight !== null) throw new Error("B2_RECENT_RAW_READ_PREFLIGHT_COLLISION");

  await b2.put(bundleKey, packedBundle.packed);
  const readback = await b2.get(bundleKey);
  const bundleHash = sha(packedBundle.packed);
  if (readback.length !== packedBundle.packed.length || sha(readback) !== bundleHash) throw new Error("B2_RECENT_RAW_BUNDLE_READBACK_HASH_INVALID");
  try {
    verifyRawStorageBundle({
      bytes: readback,
      expectedSha256: bundleHash,
      expectedBundleId: bundleId,
      expectedShardSuffix: "0",
      expectedMembers: selected,
    });
  } catch (cause) {
    throw new Error("B2_RECENT_RAW_BUNDLE_RESTORE_INVALID", { cause });
  }

  await b2.put(proofKey, Buffer.from(JSON.stringify({
    schema: "geomacro.raw-storage-bundle-proof.v2", bundle_id: bundleId, archive_bucket: ARCHIVE_BUCKET,
    archive_key: bundleKey, bundle_schema: packedBundle.schema, storage_encoding: packedBundle.storage_encoding,
    bundle_sha256: bundleHash, bundle_bytes: packedBundle.packed.length, member_count: selected.length,
    baseline_v1_bytes: packedBundle.baseline_v1_bytes, candidate_v2_bytes: packedBundle.candidate_v2_bytes,
    bytes_saved_vs_v1: packedBundle.bytes_saved_vs_v1, saving_ratio_vs_v1: packedBundle.saving_ratio_vs_v1,
    pre_write_b2_read_preflight_verified: true, full_b2_readback_verified: true,
    verified_at: new Date().toISOString(), members: selected.map(({ snapshot_id, object_path, fetched_at, payload_bytes, payload_sha256, member_compressed_sha256 }) => ({ snapshot_id, object_path, fetched_at, payload_bytes, payload_sha256, member_compressed_sha256 })),
  })));

  const { data: marked, error: markError } = await db.rpc("geomacro_mark_verified_raw_bundle", {
    p_bundle_key: bundleKey,
    p_bundle_sha256: bundleHash,
    p_items: selected.map(({ snapshot_id, object_path, payload_sha256, member_compressed_sha256 }) => ({ snapshot_id, object_path, content_sha256: payload_sha256, member_compressed_sha256 })),
  });
  if (markError) throw new Error(`B2_RECENT_RAW_BUNDLE_MARK_FAILED_${markError.code ?? "unknown"}: ${markError.message ?? "unknown"}`);
  if (!Array.isArray(marked) || marked.length !== selected.length) throw new Error("B2_RECENT_RAW_BUNDLE_MARK_UNCONFIRMED");

  const paths = selected.map((entry) => entry.object_path);
  const { data: removed, error: removeError } = await storage.remove(paths);
  if (removeError || !Array.isArray(removed) || removed.length !== selected.length) throw new Error("B2_RECENT_RAW_SOURCE_REMOVE_UNCONFIRMED");
  const { data: present, error: presenceError } = await db.rpc("geomacro_raw_storage_paths_present", { p_paths: paths });
  if (presenceError) throw new Error(`B2_RECENT_RAW_PRESENCE_CHECK_FAILED_${presenceError.code ?? "unknown"}: ${presenceError.message ?? "unknown"}`);
  if (!Array.isArray(present) || present.length !== 0) throw new Error("B2_RECENT_RAW_SOURCE_STILL_PRESENT");

  await b2.put(deletionKey, Buffer.from(JSON.stringify({
    schema: "geomacro.raw-storage-bundle-source-deletion.v1", bundle_id: bundleId, archive_key: bundleKey,
    archive_proof_key: proofKey, bundle_schema: packedBundle.schema, deleted_paths: paths,
    deleted_at: new Date().toISOString(), reason: historicalDrain ? "historical-b2-primary-drain" : "post-ingest-b2-primary-offload",
  })));

  return {
    status: "progress",
    processed: selected.length,
    compressed_bytes: packedBundle.packed.length,
    bundle_schema: packedBundle.schema,
    storage_encoding: packedBundle.storage_encoding,
    baseline_v1_bytes: packedBundle.baseline_v1_bytes,
    candidate_v2_bytes: packedBundle.candidate_v2_bytes,
    bytes_saved_vs_v1: packedBundle.bytes_saved_vs_v1,
    saving_ratio_vs_v1: packedBundle.saving_ratio_vs_v1,
  };
}

async function main() {
  const fragments = fragmentDisposition();
  let rawProcessed = 0;
  let rawCompressedBytes = 0;
  let rawSavedVsV1 = 0;
  let v2Bundles = 0;
  let rounds = 0;
  for (; rounds < rawRounds; rounds += 1) {
    const result = await archiveOneRawBundle();
    rawProcessed += result.processed;
    rawCompressedBytes += result.compressed_bytes;
    rawSavedVsV1 += result.bytes_saved_vs_v1 ?? 0;
    if (result.bundle_schema === "geomacro.raw-storage-bundle.v2") v2Bundles += 1;
    if (result.status === "complete") break;
  }
  console.log(JSON.stringify({
    ok: true,
    mode: historicalDrain ? "historical-b2-primary-drain" : "post-ingest-b2-primary-offload",
    historical_drain: historicalDrain,
    cutoff,
    settle_before: settleBefore,
    fragments,
    raw: { processed: rawProcessed, compressed_bytes: rawCompressedBytes, bytes_saved_vs_v1: rawSavedVsV1, adaptive_v2_bundles: v2Bundles, rounds },
    verification: "full-b2-readback-before-pointer-update-and-source-delete",
    pre_write_b2_read_preflight_verified: true,
    supabase_storage_retention_target: "ephemeral-raw-ingest-buffer; immutable fragments retained until sidecar resolver exists",
    b2: b2.usage(),
  }));
}

function errorText(error) {
  if (error instanceof Error) return error.stack ?? error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

main().catch((error) => {
  console.error(errorText(error));
  process.exit(1);
});
