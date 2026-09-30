#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_BUCKET = "geomacro-live-intelligence";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const CONFIRM = "DELETE_VERIFIED_SOURCE_USING_B2_RESOLVER";
const MAX_OBJECT_BYTES = 8_000_000;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const projectRef = (value) => { try { return new URL(value).hostname.split(".")[0] ?? ""; } catch { return ""; } };

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const fragmentId = String(process.env.B2_FRAGMENT_TARGET_ID ?? process.argv[2] ?? "").trim();
const deleteSource = String(process.env.B2_FRAGMENT_RESOLVER_DELETE ?? "0") === "1";
const confirmation = String(process.env.B2_FRAGMENT_RESOLVER_CONFIRM ?? "").trim();
const minAgeHours = Math.max(24, Math.min(24 * 365, Number(process.env.B2_FRAGMENT_MIN_AGE_HOURS ?? 168)));

if (!url || !role || projectRef(url) !== PROJECT_REF) throw new Error("B2_FRAGMENT_RESOLVER_SUPABASE_CONFIG_INVALID");
if (!/^[0-9a-f-]{36}$/i.test(fragmentId)) throw new Error("B2_FRAGMENT_RESOLVER_ID_INVALID");
if (deleteSource && confirmation !== CONFIRM) throw new Error("B2_FRAGMENT_RESOLVER_DELETE_CONFIRMATION_REQUIRED");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const storage = db.storage.from(SOURCE_BUCKET);
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

async function manifestRow() {
  const { data, error } = await db.from("live_fragment_manifest")
    .select("id,object_path,storage_bucket,compressed_sha256,compressed_bytes,item_count,period_end,verified_at")
    .eq("id", fragmentId).maybeSingle();
  if (error || !data) throw new Error(`B2_FRAGMENT_RESOLVER_MANIFEST_MISSING_${fragmentId}`);
  const sourcePath = String(data.object_path ?? "");
  const expectedHash = String(data.compressed_sha256 ?? "");
  const expectedBytes = Number(data.compressed_bytes ?? -1);
  const itemCount = Number(data.item_count ?? -1);
  const periodEnd = Date.parse(String(data.period_end ?? ""));
  if (data.storage_bucket !== SOURCE_BUCKET ||
      !/^(?:live|fragments)\/v1\/[A-Za-z0-9_./-]+\.ndjson\.gz$/.test(sourcePath) || sourcePath.includes("..") ||
      !/^[a-f0-9]{64}$/.test(expectedHash) || !Number.isInteger(expectedBytes) || expectedBytes < 0 ||
      expectedBytes > MAX_OBJECT_BYTES || !Number.isInteger(itemCount) || itemCount < 0 ||
      !Number.isFinite(periodEnd) || Date.now() - periodEnd < minAgeHours * 3600_000) {
    throw new Error(`B2_FRAGMENT_RESOLVER_METADATA_INVALID_${fragmentId}`);
  }
  return { ...data, sourcePath, expectedHash, expectedBytes, itemCount };
}

async function archiveRow() {
  const { data, error } = await db.from("live_fragment_archive_locations")
    .select("fragment_id,archive_bucket,archive_object_path,compressed_sha256,compressed_bytes,source_bucket,source_object_path,verified_at,source_deleted_at,deletion_proof_key")
    .eq("fragment_id", fragmentId).maybeSingle();
  if (error) throw new Error(`B2_FRAGMENT_RESOLVER_ARCHIVE_QUERY_FAILED_${error.code ?? "unknown"}`);
  return data ?? null;
}

async function handledCount() {
  const [{ count: evidence, error: evidenceError }, { count: excluded, error: excludedError }] = await Promise.all([
    db.from("live_structured_event_evidence").select("*", { count: "exact", head: true }).eq("fragment_id", fragmentId),
    db.from("live_structuring_exclusions").select("*", { count: "exact", head: true }).eq("fragment_id", fragmentId),
  ]);
  if (evidenceError || excludedError) throw new Error(`B2_FRAGMENT_RESOLVER_HANDLED_COUNT_FAILED_${fragmentId}`);
  return { evidence: Number(evidence ?? 0), excluded: Number(excluded ?? 0), total: Number(evidence ?? 0) + Number(excluded ?? 0) };
}

async function sourceBytes(sourcePath, expectedBytes, expectedHash) {
  const { data, error } = await storage.download(sourcePath);
  if (error || !data) throw new Error(`B2_FRAGMENT_RESOLVER_SOURCE_DOWNLOAD_FAILED_${fragmentId}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length !== expectedBytes || sha(bytes) !== expectedHash) throw new Error(`B2_FRAGMENT_RESOLVER_SOURCE_HASH_INVALID_${fragmentId}`);
  return bytes;
}

function encodedStoragePath(sourcePath) {
  return sourcePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function storageObjectState(sourcePath) {
  const response = await fetch(`${url}/storage/v1/object/info/${SOURCE_BUCKET}/${encodedStoragePath(sourcePath)}`, {
    headers: { apikey: role, authorization: `Bearer ${role}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.ok) return { exists: true, status: response.status };
  const body = await response.json().catch(() => null);
  const structuredStatus = String(body?.statusCode ?? "");
  const structuredError = String(body?.error ?? body?.message ?? "");
  const absent = response.status === 404 ||
    (response.status === 400 && structuredStatus === "404" && /not.?found|no.?such.?key/i.test(structuredError));
  if (absent) return { exists: false, status: response.status };
  throw new Error(`B2_FRAGMENT_RESOLVER_SOURCE_INFO_INDETERMINATE_${fragmentId}_${response.status}_${structuredStatus || "none"}`);
}

async function waitForStorageAbsence(sourcePath) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const state = await storageObjectState(sourcePath);
    if (!state.exists) return;
    if (attempt < 5) await sleep(500 * (attempt + 1));
  }
  throw new Error(`B2_FRAGMENT_RESOLVER_SOURCE_STILL_PRESENT_${fragmentId}`);
}

async function verifyArchive(manifest, archive) {
  const archiveKey = `geomacro-evidence/v1/${manifest.sourcePath}`;
  if (!archive) {
    const bytes = await sourceBytes(manifest.sourcePath, manifest.expectedBytes, manifest.expectedHash);
    await b2.put(archiveKey, bytes);
    const readback = await b2.get(archiveKey);
    if (readback.length !== manifest.expectedBytes || sha(readback) !== manifest.expectedHash)
      throw new Error(`B2_FRAGMENT_RESOLVER_ARCHIVE_READBACK_INVALID_${fragmentId}`);
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
    if (error) throw new Error(`B2_FRAGMENT_RESOLVER_POINTER_INSERT_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);
    return {
      fragment_id: fragmentId,
      archive_bucket: ARCHIVE_BUCKET,
      archive_object_path: archiveKey,
      compressed_sha256: manifest.expectedHash,
      compressed_bytes: manifest.expectedBytes,
      source_bucket: SOURCE_BUCKET,
      source_object_path: manifest.sourcePath,
      verified_at: verifiedAt,
      source_deleted_at: null,
      deletion_proof_key: null,
    };
  }
  if (archive.archive_bucket !== ARCHIVE_BUCKET || archive.source_bucket !== SOURCE_BUCKET ||
      archive.source_object_path !== manifest.sourcePath || archive.archive_object_path !== archiveKey ||
      archive.compressed_sha256 !== manifest.expectedHash || Number(archive.compressed_bytes) !== manifest.expectedBytes) {
    throw new Error(`B2_FRAGMENT_RESOLVER_POINTER_MISMATCH_${fragmentId}`);
  }
  const readback = await b2.get(archive.archive_object_path);
  if (readback.length !== manifest.expectedBytes || sha(readback) !== manifest.expectedHash)
    throw new Error(`B2_FRAGMENT_RESOLVER_ARCHIVE_HASH_INVALID_${fragmentId}`);
  return archive;
}

async function resolverRow() {
  const { data, error } = await db.from("resolved_live_fragment_locations")
    .select("id,resolved_storage_bucket,resolved_object_path,compressed_sha256,archive_bucket,archive_object_path,archive_verified_at,source_deleted_at,deletion_proof_key")
    .eq("id", fragmentId).maybeSingle();
  if (error || !data) throw new Error(`B2_FRAGMENT_RESOLVER_VIEW_QUERY_FAILED_${error?.code ?? "missing"}`);
  return data;
}

async function verifyResolver(manifest, archive, expectArchive) {
  const row = await resolverRow();
  if (row.compressed_sha256 !== manifest.expectedHash) throw new Error(`B2_FRAGMENT_RESOLVER_VIEW_HASH_MISMATCH_${fragmentId}`);
  if (expectArchive) {
    if (!row.source_deleted_at || row.resolved_storage_bucket !== ARCHIVE_BUCKET ||
        row.resolved_object_path !== archive.archive_object_path || row.archive_bucket !== ARCHIVE_BUCKET ||
        row.archive_object_path !== archive.archive_object_path || !row.archive_verified_at) {
      throw new Error(`B2_FRAGMENT_RESOLVER_VIEW_ARCHIVE_ROUTE_INVALID_${fragmentId}`);
    }
  } else if (row.source_deleted_at || row.resolved_storage_bucket !== SOURCE_BUCKET || row.resolved_object_path !== manifest.sourcePath) {
    throw new Error(`B2_FRAGMENT_RESOLVER_VIEW_SOURCE_ROUTE_INVALID_${fragmentId}`);
  }
  return row;
}

async function putVerifiedProof(key, object) {
  const bytes = Buffer.from(JSON.stringify(object));
  const expected = sha(bytes);
  await b2.put(key, bytes);
  const readback = await b2.get(key);
  if (readback.length !== bytes.length || sha(readback) !== expected)
    throw new Error(`B2_FRAGMENT_RESOLVER_PROOF_READBACK_INVALID_${fragmentId}`);
}

async function readPreparedProof(key, manifest, archive) {
  const bytes = await b2.get(key);
  if (bytes.length > 100_000) throw new Error(`B2_FRAGMENT_RESOLVER_PREPARED_PROOF_TOO_LARGE_${fragmentId}`);
  let proof;
  try { proof = JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new Error(`B2_FRAGMENT_RESOLVER_PREPARED_PROOF_INVALID_JSON_${fragmentId}`); }
  if (proof?.schema !== "geomacro.live-fragment-resolver-offload-prepared.v1" || proof?.fragment_id !== fragmentId ||
      proof?.deletion_mode !== "resolver_backed_cold_offload" || proof?.source_bucket !== SOURCE_BUCKET ||
      proof?.source_object_path !== manifest.sourcePath || proof?.archive_bucket !== ARCHIVE_BUCKET ||
      proof?.archive_object_path !== archive.archive_object_path || proof?.compressed_sha256 !== manifest.expectedHash ||
      Number(proof?.compressed_bytes) !== manifest.expectedBytes || Number(proof?.item_count) !== manifest.itemCount ||
      !Number.isFinite(Date.parse(String(proof?.prepared_at ?? "")))) {
    throw new Error(`B2_FRAGMENT_RESOLVER_PREPARED_PROOF_MISMATCH_${fragmentId}`);
  }
  return proof;
}

async function finalizeDeletion(manifest, archive, handled, preparedKey, recoveryMode) {
  const deletedAt = new Date().toISOString();
  const deletionProofKey = `geomacro-evidence/v1/index/live-fragments-deleted/${fragmentId}.json`;
  await putVerifiedProof(deletionProofKey, {
    schema: "geomacro.live-fragment-source-deletion.v1",
    deletion_mode: "resolver_backed_cold_offload",
    fragment_id: fragmentId,
    source_bucket: SOURCE_BUCKET,
    source_object_path: manifest.sourcePath,
    archive_bucket: ARCHIVE_BUCKET,
    archive_object_path: archive.archive_object_path,
    compressed_sha256: manifest.expectedHash,
    compressed_bytes: manifest.expectedBytes,
    prepared_proof_key: preparedKey,
    deleted_at: deletedAt,
    handled_before_finalize: handled.total,
    item_count: manifest.itemCount,
    evidence_count: handled.evidence,
    exclusion_count: handled.excluded,
    reconciliation: recoveryMode ? "verified_resolver_offload_reconciled" : "normal_resolver_backed_offload",
  });
  const { error: markError } = await db.rpc("geomacro_mark_live_fragment_source_deleted", {
    p_fragment_id: fragmentId,
    p_deletion_proof_key: deletionProofKey,
    p_deleted_at: deletedAt,
  });
  if (markError) throw new Error(`B2_FRAGMENT_RESOLVER_DELETE_MARK_FAILED_${markError.code ?? "unknown"}: ${markError.message ?? "unknown"}`);
  await verifyResolver(manifest, { ...archive, source_deleted_at: deletedAt, deletion_proof_key: deletionProofKey }, true);
  return { deletedAt, deletionProofKey };
}

async function main() {
  const manifest = await manifestRow();
  let archive = await archiveRow();
  archive = await verifyArchive(manifest, archive);
  const handled = await handledCount();

  if (archive.source_deleted_at) {
    await verifyResolver(manifest, archive, true);
    console.log(JSON.stringify({ ok: true, mode: "resolver-backed-fragment-offload", fragment_id: fragmentId,
      archive_verified: true, resolver_verified: true, deleted: true, reason: "already_marked_deleted",
      deletion_proof_key: archive.deletion_proof_key ?? null, item_count: manifest.itemCount, handled_count: handled.total }));
    return;
  }

  await verifyResolver(manifest, archive, false);
  const sourceState = await storageObjectState(manifest.sourcePath);
  const preparedKey = `geomacro-evidence/v1/index/live-fragments-resolver-offload-prepared/${fragmentId}.json`;

  if (!deleteSource) {
    if (!sourceState.exists) throw new Error(`B2_FRAGMENT_RESOLVER_SOURCE_ABSENT_WITHOUT_RECONCILE_${fragmentId}`);
    await sourceBytes(manifest.sourcePath, manifest.expectedBytes, manifest.expectedHash);
    console.log(JSON.stringify({ ok: true, mode: "resolver-backed-fragment-offload-preflight", fragment_id: fragmentId,
      archive_verified: true, source_verified: true, resolver_source_route_verified: true, delete_requested: false,
      item_count: manifest.itemCount, handled_count: handled.total, unprocessed_count: Math.max(0, manifest.itemCount - handled.total),
      bytes: manifest.expectedBytes }));
    return;
  }

  if (!sourceState.exists) {
    await readPreparedProof(preparedKey, manifest, archive);
    const finalized = await finalizeDeletion(manifest, archive, handled, preparedKey, true);
    console.log(JSON.stringify({ ok: true, mode: "resolver-backed-fragment-offload-reconcile", fragment_id: fragmentId,
      archive_verified: true, source_absence_verified: true, prepared_proof_verified: true, resolver_archive_route_verified: true,
      deleted: true, deletion_proof_key: finalized.deletionProofKey, prepared_proof_key: preparedKey,
      item_count: manifest.itemCount, handled_count: handled.total, bytes: manifest.expectedBytes }));
    return;
  }

  await sourceBytes(manifest.sourcePath, manifest.expectedBytes, manifest.expectedHash);
  const preparedAt = new Date().toISOString();
  await putVerifiedProof(preparedKey, {
    schema: "geomacro.live-fragment-resolver-offload-prepared.v1",
    deletion_mode: "resolver_backed_cold_offload",
    fragment_id: fragmentId,
    source_bucket: SOURCE_BUCKET,
    source_object_path: manifest.sourcePath,
    archive_bucket: ARCHIVE_BUCKET,
    archive_object_path: archive.archive_object_path,
    compressed_sha256: manifest.expectedHash,
    compressed_bytes: manifest.expectedBytes,
    item_count: manifest.itemCount,
    handled_count_at_prepare: handled.total,
    evidence_count_at_prepare: handled.evidence,
    exclusion_count_at_prepare: handled.excluded,
    prepared_at: preparedAt,
  });

  const { data: removed, error: removeError } = await storage.remove([manifest.sourcePath]);
  if (removeError || !Array.isArray(removed) || removed.length !== 1)
    throw new Error(`B2_FRAGMENT_RESOLVER_SOURCE_REMOVE_UNCONFIRMED_${fragmentId}`);
  await waitForStorageAbsence(manifest.sourcePath);
  const finalized = await finalizeDeletion(manifest, archive, handled, preparedKey, false);

  console.log(JSON.stringify({ ok: true, mode: "resolver-backed-fragment-offload", fragment_id: fragmentId,
    archive_verified: true, source_verified_before_delete: true, source_absence_verified: true,
    resolver_archive_route_verified: true, deleted: true, deletion_proof_key: finalized.deletionProofKey,
    prepared_proof_key: preparedKey, item_count: manifest.itemCount, handled_count: handled.total,
    unprocessed_count_at_delete: Math.max(0, manifest.itemCount - handled.total), bytes: manifest.expectedBytes }));
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
