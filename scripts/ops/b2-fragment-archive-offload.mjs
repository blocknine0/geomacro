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
const limit = Math.max(1, Math.min(500, Number(process.env.B2_FRAGMENT_ARCHIVE_LIMIT ?? 100)));
const minAgeHours = Math.max(24, Math.min(24 * 365, Number(process.env.B2_FRAGMENT_MIN_AGE_HOURS ?? 168)));
const deleteSource = String(process.env.B2_FRAGMENT_DELETE_SOURCE ?? "0") === "1";

if (!url || !role || projectRef(url) !== PROJECT_REF) throw new Error("B2_FRAGMENT_SUPABASE_CONFIG_INVALID");
const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const storage = db.storage.from(SOURCE_BUCKET);
const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT, accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY, bucket: ARCHIVE_BUCKET });
const cutoff = new Date(Date.now() - minAgeHours * 3600_000).toISOString();

async function candidates() {
  const { data, error } = await db.from("live_fragment_manifest")
    .select("id,object_path,storage_bucket,compressed_sha256,compressed_bytes,item_count,period_end,verified_at")
    .eq("storage_bucket", SOURCE_BUCKET)
    .like("object_path", "live/v1/%")
    .lte("period_end", cutoff)
    .order("period_end", { ascending: true })
    .limit(limit * 3);
  if (error) throw new Error(`B2_FRAGMENT_QUERY_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);

  const ids = (data ?? []).map((row) => row.id);
  if (!ids.length) return [];
  const { data: archived, error: archiveError } = await db.from("live_fragment_archive_locations")
    .select("fragment_id,source_deleted_at").in("fragment_id", ids);
  if (archiveError) throw new Error(`B2_FRAGMENT_ARCHIVE_QUERY_FAILED_${archiveError.code ?? "unknown"}: ${archiveError.message ?? "unknown"}`);
  const byId = new Map((archived ?? []).map((row) => [row.fragment_id, row]));
  return (data ?? []).filter((row) => !byId.has(row.id)).slice(0, limit);
}

async function handledCount(fragmentId) {
  const [{ count: evidence, error: evidenceError }, { count: excluded, error: excludedError }] = await Promise.all([
    db.from("live_structured_event_evidence").select("*", { count: "exact", head: true }).eq("fragment_id", fragmentId),
    db.from("live_structuring_exclusions").select("*", { count: "exact", head: true }).eq("fragment_id", fragmentId),
  ]);
  if (evidenceError || excludedError) throw new Error(`B2_FRAGMENT_HANDLED_COUNT_FAILED_${fragmentId}`);
  return Number(evidence ?? 0) + Number(excluded ?? 0);
}

async function archiveOne(row) {
  const id = String(row.id ?? "");
  const sourcePath = String(row.object_path ?? "");
  const expectedHash = String(row.compressed_sha256 ?? "");
  const expectedBytes = Number(row.compressed_bytes ?? -1);
  const itemCount = Number(row.item_count ?? -1);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^live\/v1\/[A-Za-z0-9_./-]+\.ndjson\.gz$/.test(sourcePath) ||
      sourcePath.includes("..") || !/^[a-f0-9]{64}$/.test(expectedHash) || !Number.isInteger(expectedBytes) ||
      expectedBytes < 0 || expectedBytes > MAX_OBJECT_BYTES || !Number.isInteger(itemCount) || itemCount < 0)
    throw new Error(`B2_FRAGMENT_METADATA_INVALID_${id || "unknown"}`);

  const { data: blob, error: downloadError } = await storage.download(sourcePath);
  if (downloadError || !blob) throw new Error(`B2_FRAGMENT_SOURCE_DOWNLOAD_FAILED_${id}`);
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length !== expectedBytes || sha(bytes) !== expectedHash) throw new Error(`B2_FRAGMENT_SOURCE_HASH_INVALID_${id}`);

  const archiveKey = `geomacro-evidence/v1/${sourcePath}`;
  await b2.put(archiveKey, bytes);
  const readback = await b2.get(archiveKey);
  if (readback.length !== bytes.length || sha(readback) !== expectedHash) throw new Error(`B2_FRAGMENT_READBACK_INVALID_${id}`);

  const { error: insertError } = await db.from("live_fragment_archive_locations").insert({
    fragment_id: id,
    archive_bucket: ARCHIVE_BUCKET,
    archive_object_path: archiveKey,
    compressed_sha256: expectedHash,
    compressed_bytes: expectedBytes,
    source_bucket: SOURCE_BUCKET,
    source_object_path: sourcePath,
    verified_at: new Date().toISOString(),
    verification_method: "b2-readback-sha256",
  });
  if (insertError) throw new Error(`B2_FRAGMENT_POINTER_INSERT_FAILED_${insertError.code ?? "unknown"}: ${insertError.message ?? "unknown"}`);

  if (!deleteSource) return { id, archive_key: archiveKey, deleted: false, bytes: expectedBytes, reason: "archive_only" };

  const handled = await handledCount(id);
  if (handled < itemCount) {
    return { id, archive_key: archiveKey, deleted: false, bytes: expectedBytes,
      reason: "unprocessed_records_remain", handled, item_count: itemCount };
  }

  const { data: removed, error: removeError } = await storage.remove([sourcePath]);
  if (removeError || !Array.isArray(removed) || removed.length !== 1) throw new Error(`B2_FRAGMENT_SOURCE_REMOVE_UNCONFIRMED_${id}`);
  const { data: stillThere, error: postDeleteError } = await storage.download(sourcePath);
  if (stillThere) throw new Error(`B2_FRAGMENT_SOURCE_STILL_PRESENT_${id}`);
  const postDeleteStatus = String(postDeleteError?.statusCode ?? postDeleteError?.status ?? "");
  if (!postDeleteError || !["400", "404"].includes(postDeleteStatus))
    throw new Error(`B2_FRAGMENT_SOURCE_DELETE_PROBE_INDETERMINATE_${id}_${postDeleteStatus || "no_status"}`);

  const deletedAt = new Date().toISOString();
  const deletionProofKey = `geomacro-evidence/v1/index/live-fragments-deleted/${id}.json`;
  await b2.put(deletionProofKey, Buffer.from(JSON.stringify({ schema: "geomacro.live-fragment-source-deletion.v1",
    fragment_id: id, source_bucket: SOURCE_BUCKET, source_object_path: sourcePath, archive_bucket: ARCHIVE_BUCKET,
    archive_object_path: archiveKey, compressed_sha256: expectedHash, deleted_at: deletedAt, handled, item_count: itemCount })));

  const { error: markError } = await db.rpc("geomacro_mark_live_fragment_source_deleted", {
    p_fragment_id: id, p_deletion_proof_key: deletionProofKey, p_deleted_at: deletedAt,
  });
  if (markError) throw new Error(`B2_FRAGMENT_DELETE_MARK_FAILED_${markError.code ?? "unknown"}: ${markError.message ?? "unknown"}`);
  return { id, archive_key: archiveKey, deleted: true, bytes: expectedBytes, handled, item_count: itemCount };
}

async function main() {
  const rows = await candidates();
  const results = [];
  for (const row of rows) results.push(await archiveOne(row));
  console.log(JSON.stringify({ ok: true, mode: "verified-fragment-b2-offload", cutoff, source_delete_enabled: deleteSource,
    processed: results.length, archived_bytes: results.reduce((sum, x) => sum + x.bytes, 0), deleted: results.filter((x) => x.deleted).length,
    verification: "source-hash+b2-readback-hash+immutable-sidecar+fully-handled-gate+storage-api-delete+absence-proof", results }));
}
main().catch((error) => { console.error(error instanceof Error ? (error.stack ?? error.message) : String(error)); process.exit(1); });
