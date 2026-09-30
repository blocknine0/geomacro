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
const fragmentId = String(process.env.B2_FRAGMENT_RESTORE_ID ?? process.argv[2] ?? "").trim();
if (!url || !role || projectRef(url) !== PROJECT_REF) throw new Error("B2_FRAGMENT_RESTORE_SUPABASE_CONFIG_INVALID");
if (!/^[0-9a-f-]{36}$/i.test(fragmentId)) throw new Error("B2_FRAGMENT_RESTORE_ID_INVALID");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const storage = db.storage.from(SOURCE_BUCKET);
const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT, accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY, bucket: ARCHIVE_BUCKET });

async function main() {
  const { data: manifest, error: manifestError } = await db.from("live_fragment_manifest")
    .select("id,object_path,storage_bucket,compressed_sha256,compressed_bytes")
    .eq("id", fragmentId).maybeSingle();
  if (manifestError || !manifest) throw new Error(`B2_FRAGMENT_RESTORE_MANIFEST_MISSING_${fragmentId}`);
  const { data: archive, error: archiveError } = await db.from("live_fragment_archive_locations")
    .select("archive_bucket,archive_object_path,compressed_sha256,compressed_bytes,source_bucket,source_object_path,verified_at,source_deleted_at")
    .eq("fragment_id", fragmentId).maybeSingle();
  if (archiveError || !archive) throw new Error(`B2_FRAGMENT_RESTORE_POINTER_MISSING_${fragmentId}`);
  if (archive.archive_bucket !== ARCHIVE_BUCKET || archive.source_bucket !== SOURCE_BUCKET ||
      archive.source_object_path !== manifest.object_path || archive.compressed_sha256 !== manifest.compressed_sha256 ||
      Number(archive.compressed_bytes) !== Number(manifest.compressed_bytes)) throw new Error(`B2_FRAGMENT_RESTORE_POINTER_MISMATCH_${fragmentId}`);
  const expectedHash = String(manifest.compressed_sha256 ?? "");
  const expectedBytes = Number(manifest.compressed_bytes ?? -1);
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !Number.isInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > MAX_OBJECT_BYTES)
    throw new Error(`B2_FRAGMENT_RESTORE_METADATA_INVALID_${fragmentId}`);

  const readback = await b2.get(archive.archive_object_path);
  if (readback.length !== expectedBytes || sha(readback) !== expectedHash) throw new Error(`B2_FRAGMENT_RESTORE_B2_HASH_INVALID_${fragmentId}`);

  const { data: existing, error: existingError } = await storage.download(manifest.object_path);
  if (existing) {
    const existingBytes = Buffer.from(await existing.arrayBuffer());
    if (existingBytes.length !== expectedBytes || sha(existingBytes) !== expectedHash) throw new Error(`B2_FRAGMENT_RESTORE_SOURCE_CONFLICT_${fragmentId}`);
    console.log(JSON.stringify({ ok: true, restored: false, reason: "source_already_present_and_verified", fragment_id: fragmentId }));
    return;
  }
  if (existingError && !["400", "404"].includes(String(existingError.statusCode ?? existingError.status ?? "")))
    throw new Error(`B2_FRAGMENT_RESTORE_SOURCE_PROBE_FAILED_${fragmentId}`);

  const { error: uploadError } = await storage.upload(manifest.object_path, readback, { contentType: "application/gzip", upsert: false });
  if (uploadError) throw new Error(`B2_FRAGMENT_RESTORE_UPLOAD_FAILED_${fragmentId}: ${uploadError.message ?? "unknown"}`);
  const { data: restored, error: restoredError } = await storage.download(manifest.object_path);
  if (restoredError || !restored) throw new Error(`B2_FRAGMENT_RESTORE_READBACK_FAILED_${fragmentId}`);
  const restoredBytes = Buffer.from(await restored.arrayBuffer());
  if (restoredBytes.length !== expectedBytes || sha(restoredBytes) !== expectedHash) throw new Error(`B2_FRAGMENT_RESTORE_READBACK_HASH_INVALID_${fragmentId}`);
  console.log(JSON.stringify({ ok: true, restored: true, fragment_id: fragmentId, source_path: manifest.object_path,
    bytes: expectedBytes, verification: "b2-hash+supabase-storage-readback-hash" }));
}
main().catch((error) => { console.error(error instanceof Error ? (error.stack ?? error.message) : String(error)); process.exit(1); });
