#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_BUCKET = "geomacro-live-intelligence";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const MAX_OBJECT_BYTES = 8_000_000;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const projectRef = (url) => { try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; } };

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const fragmentId = String(process.env.B2_FRAGMENT_TARGET_ID ?? process.argv[2] ?? "").trim();
const deleteSource = String(process.env.B2_FRAGMENT_TARGET_DELETE ?? "0") === "1";
const minAgeHours = Math.max(24, Math.min(24 * 365, Number(process.env.B2_FRAGMENT_MIN_AGE_HOURS ?? 168)));

if (!url || !role || projectRef(url) !== PROJECT_REF) throw new Error("B2_FRAGMENT_TARGET_SUPABASE_CONFIG_INVALID");
if (!/^[0-9a-f-]{36}$/i.test(fragmentId)) throw new Error("B2_FRAGMENT_TARGET_ID_INVALID");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const storage = db.storage.from(SOURCE_BUCKET);
const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT, accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY, bucket: ARCHIVE_BUCKET });

async function getManifest() {
  const { data, error } = await db.from("live_fragment_manifest")
    .select("id,object_path,storage_bucket,compressed_sha256,compressed_bytes,item_count,period_end,verified_at")
    .eq("id", fragmentId).maybeSingle();
  if (error || !data) throw new Error(`B2_FRAGMENT_TARGET_MANIFEST_MISSING_${fragmentId}`);
  const sourcePath = String(data.object_path ?? "");
  const expectedHash = String(data.compressed_sha256 ?? "");
  const expectedBytes = Number(data.compressed_bytes ?? -1);
  const itemCount = Number(data.item_count ?? -1);
  const periodEnd = Date.parse(String(data.period_end ?? ""));
  if (data.storage_bucket !== SOURCE_BUCKET || !/^live\/v1\/[A-Za-z0-9_./-]+\.ndjson\.gz$/.test(sourcePath) ||
      sourcePath.includes("..") || !/^[a-f0-9]{64}$/.test(expectedHash) || !Number.isInteger(expectedBytes) ||
      expectedBytes < 0 || expectedBytes > MAX_OBJECT_BYTES || !Number.isInteger(itemCount) || itemCount < 0 ||
      !Number.isFinite(periodEnd) || Date.now() - periodEnd < minAgeHours * 3600_000)
    throw new Error(`B2_FRAGMENT_TARGET_METADATA_INVALID_${fragmentId}`);
  return { ...data, sourcePath, expectedHash, expectedBytes, itemCount };
}

async function getArchive() {
  const { data, error } = await db.from("live_fragment_archive_locations")
    .select("fragment_id,archive_bucket,archive_object_path,compressed_sha256,compressed_bytes,source_bucket,source_object_path,verified_at,source_deleted_at,deletion_proof_key")
    .eq("fragment_id", fragmentId).maybeSingle();
  if (error) throw new Error(`B2_FRAGMENT_TARGET_ARCHIVE_QUERY_FAILED_${error.code ?? "unknown"}`);
  return data ?? null;
}

async function handledCount() {
  const [{ count: evidence, error: evidenceError }, { count: excluded, error: excludedError }] = await Promise.all([
    db.from("live_structured_event_evidence").select("*", { count: "exact", head: true }).eq("fragment_id", fragmentId),
    db.from("live_structuring_exclusions").select("*", { count: "exact", head: true }).eq("fragment_id", fragmentId),
  ]);
  if (evidenceError || excludedError) throw new Error(`B2_FRAGMENT_TARGET_HANDLED_COUNT_FAILED_${fragmentId}`);
  return { evidence: Number(evidence ?? 0), excluded: Number(excluded ?? 0), total: Number(evidence ?? 0) + Number(excluded ?? 0) };
}

async function sourceBytes(sourcePath, expectedBytes, expectedHash) {
  const { data, error } = await storage.download(sourcePath);
  if (error || !data) throw new Error(`B2_FRAGMENT_TARGET_SOURCE_DOWNLOAD_FAILED_${fragmentId}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length !== expectedBytes || sha(bytes) !== expectedHash) throw new Error(`B2_FRAGMENT_TARGET_SOURCE_HASH_INVALID_${fragmentId}`);
  return bytes;
}

async function verifyArchive(manifest, archive) {
  const archiveKey = `geomacro-evidence/v1/${manifest.sourcePath}`;
  if (!archive) {
    const bytes = await sourceBytes(manifest.sourcePath, manifest.expectedBytes, manifest.expectedHash);
    await b2.put(archiveKey, bytes);
    const readback = await b2.get(archiveKey);
    if (readback.length !== manifest.expectedBytes || sha(readback) !== manifest.expectedHash)
      throw new Error(`B2_FRAGMENT_TARGET_ARCHIVE_READBACK_INVALID_${fragmentId}`);
    const verifiedAt = new Date().toISOString();
    const { error } = await db.from("live_fragment_archive_locations").insert({
      fragment_id: fragmentId,
      archive_bucket: ARCHIVE_BUCKET,
      archive_object_path: archiveKey,
      compressed_sha256: manifest.expectedHash,
      compressed_bytes: manifest.expectedBytes,
      source_bucket: SOURCE_BUCKET,
      source_object_path: manifest.sourcePath,
      verified_at: verifiedAt,
      verification_method: "b2-readback-sha256",
    });
    if (error) throw new Error(`B2_FRAGMENT_TARGET_POINTER_INSERT_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);
    return { archive_bucket: ARCHIVE_BUCKET, archive_object_path: archiveKey, compressed_sha256: manifest.expectedHash,
      compressed_bytes: manifest.expectedBytes, source_bucket: SOURCE_BUCKET, source_object_path: manifest.sourcePath,
      verified_at: verifiedAt, source_deleted_at: null, deletion_proof_key: null };
  }
  if (archive.archive_bucket !== ARCHIVE_BUCKET || archive.source_bucket !== SOURCE_BUCKET ||
      archive.source_object_path !== manifest.sourcePath || archive.archive_object_path !== archiveKey ||
      archive.compressed_sha256 !== manifest.expectedHash || Number(archive.compressed_bytes) !== manifest.expectedBytes)
    throw new Error(`B2_FRAGMENT_TARGET_POINTER_MISMATCH_${fragmentId}`);
  const readback = await b2.get(archive.archive_object_path);
  if (readback.length !== manifest.expectedBytes || sha(readback) !== manifest.expectedHash)
    throw new Error(`B2_FRAGMENT_TARGET_ARCHIVE_HASH_INVALID_${fragmentId}`);
  return archive;
}

async function putVerifiedProof(key, object) {
  const bytes = Buffer.from(JSON.stringify(object));
  const expected = sha(bytes);
  await b2.put(key, bytes);
  const readback = await b2.get(key);
  if (readback.length !== bytes.length || sha(readback) !== expected) throw new Error(`B2_FRAGMENT_TARGET_PROOF_READBACK_INVALID_${fragmentId}`);
  return expected;
}

async function main() {
  const manifest = await getManifest();
  let archive = await getArchive();
  archive = await verifyArchive(manifest, archive);

  if (archive.source_deleted_at) {
    console.log(JSON.stringify({ ok: true, mode: "targeted-fragment-cleanup", fragment_id: fragmentId,
      archive_verified: true, deleted: true, reason: "already_marked_deleted", deletion_proof_key: archive.deletion_proof_key ?? null }));
    return;
  }

  // The source must still exist and byte-match before any cleanup authorization.
  await sourceBytes(manifest.sourcePath, manifest.expectedBytes, manifest.expectedHash);
  const handled = await handledCount();
  const eligible = handled.total >= manifest.itemCount;
  if (!deleteSource) {
    console.log(JSON.stringify({ ok: true, mode: "targeted-fragment-cleanup-preflight", fragment_id: fragmentId,
      archive_verified: true, source_verified: true, delete_requested: false, eligible,
      item_count: manifest.itemCount, handled_count: handled.total, evidence_count: handled.evidence,
      exclusion_count: handled.excluded, bytes: manifest.expectedBytes }));
    return;
  }
  if (!eligible) throw new Error(`B2_FRAGMENT_TARGET_UNPROCESSED_RECORDS_${fragmentId}_${handled.total}_OF_${manifest.itemCount}`);

  const preparedAt = new Date().toISOString();
  const preparedKey = `geomacro-evidence/v1/index/live-fragments-delete-prepared/${fragmentId}.json`;
  await putVerifiedProof(preparedKey, { schema: "geomacro.live-fragment-delete-prepared.v1", fragment_id: fragmentId,
    source_bucket: SOURCE_BUCKET, source_object_path: manifest.sourcePath, archive_bucket: ARCHIVE_BUCKET,
    archive_object_path: archive.archive_object_path, compressed_sha256: manifest.expectedHash,
    compressed_bytes: manifest.expectedBytes, item_count: manifest.itemCount, handled_count: handled.total,
    evidence_count: handled.evidence, exclusion_count: handled.excluded, prepared_at: preparedAt });

  const { data: removed, error: removeError } = await storage.remove([manifest.sourcePath]);
  if (removeError || !Array.isArray(removed) || removed.length !== 1) throw new Error(`B2_FRAGMENT_TARGET_SOURCE_REMOVE_UNCONFIRMED_${fragmentId}`);
  const { data: stillThere, error: postDeleteError } = await storage.download(manifest.sourcePath);
  if (stillThere) throw new Error(`B2_FRAGMENT_TARGET_SOURCE_STILL_PRESENT_${fragmentId}`);
  const postDeleteStatus = String(postDeleteError?.statusCode ?? postDeleteError?.status ?? "");
  if (!postDeleteError || !["400", "404"].includes(postDeleteStatus))
    throw new Error(`B2_FRAGMENT_TARGET_SOURCE_DELETE_PROBE_INDETERMINATE_${fragmentId}_${postDeleteStatus || "no_status"}`);

  const deletedAt = new Date().toISOString();
  const deletionProofKey = `geomacro-evidence/v1/index/live-fragments-deleted/${fragmentId}.json`;
  await putVerifiedProof(deletionProofKey, { schema: "geomacro.live-fragment-source-deletion.v1", fragment_id: fragmentId,
    source_bucket: SOURCE_BUCKET, source_object_path: manifest.sourcePath, archive_bucket: ARCHIVE_BUCKET,
    archive_object_path: archive.archive_object_path, compressed_sha256: manifest.expectedHash,
    compressed_bytes: manifest.expectedBytes, prepared_proof_key: preparedKey, deleted_at: deletedAt,
    handled: handled.total, item_count: manifest.itemCount, evidence_count: handled.evidence, exclusion_count: handled.excluded });

  const { error: markError } = await db.rpc("geomacro_mark_live_fragment_source_deleted", {
    p_fragment_id: fragmentId, p_deletion_proof_key: deletionProofKey, p_deleted_at: deletedAt,
  });
  if (markError) throw new Error(`B2_FRAGMENT_TARGET_DELETE_MARK_FAILED_${markError.code ?? "unknown"}: ${markError.message ?? "unknown"}`);

  console.log(JSON.stringify({ ok: true, mode: "targeted-fragment-cleanup", fragment_id: fragmentId,
    archive_verified: true, source_verified_before_delete: true, eligible: true, deleted: true,
    deletion_proof_key: deletionProofKey, prepared_proof_key: preparedKey, bytes: manifest.expectedBytes,
    item_count: manifest.itemCount, handled_count: handled.total }));
}

main().catch((error) => { console.error(error instanceof Error ? (error.stack ?? error.message) : String(error)); process.exit(1); });
