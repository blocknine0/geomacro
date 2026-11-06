#!/usr/bin/env node
// Copy one verified fragment to B2 and read it back. Never deletes or edits Supabase.
import { createClient } from "@supabase/supabase-js";
import { archiveObjectPlan, verifyArchiveReadback } from "./b2-archive-contract.mjs";
import { createB2Client, b2StorageConfigured } from "./b2-s3-client.mjs";

const bucket = "geomacro-private-archive";
const accessKey = process.env.B2_KEY_ID;
const secretKey = process.env.B2_APPLICATION_KEY;
const supabaseUrl = process.env.APP_SUPABASE_URL;
const supabaseKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
const fragmentId = process.argv[2];
if (!b2StorageConfigured() || !supabaseKey ||
    supabaseUrl !== "https://ldpwajisioljyjtojvfx.supabase.co" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(fragmentId ?? "")) {
  throw new Error("ARCHIVE_CANARY_CONFIG_REQUIRED");
}

const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT, accessKey, secretKey, bucket });
const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: manifest, error } = await db.from("live_fragment_manifest")
  .select("id,storage_bucket,object_path,compression,payload_sha256,compressed_sha256,compressed_bytes")
  .eq("id", fragmentId).single();
if (error || !manifest || manifest.compression !== "gzip" || manifest.storage_bucket !== "geomacro-live-intelligence") {
  throw new Error("CANARY_MANIFEST_NOT_VERIFIED");
}
const { data: blob, error: downloadError } = await db.storage.from(manifest.storage_bucket).download(manifest.object_path);
if (downloadError || !blob) throw new Error("CANARY_SOURCE_DOWNLOAD_FAILED");
const compressed = Buffer.from(await blob.arrayBuffer());
const plan = archiveObjectPlan({ bucket, objectPath: manifest.object_path, compressedBytes: compressed,
  compressedSha256: manifest.compressed_sha256, payloadSha256: manifest.payload_sha256 });
if (compressed.length !== manifest.compressed_bytes) throw new Error("CANARY_SOURCE_LENGTH_MISMATCH");
await b2.put(plan.archive_key, compressed);
verifyArchiveReadback(plan, await b2.get(plan.archive_key));
console.log(JSON.stringify({ ok: true, source_fragment_id: manifest.id, archive_bucket: bucket,
  archive_key: plan.archive_key, compressed_bytes: plan.compressed_bytes,
  compressed_sha256: plan.compressed_sha256, payload_sha256: plan.payload_sha256,
  source_preserved: true, database_modified: false }));
