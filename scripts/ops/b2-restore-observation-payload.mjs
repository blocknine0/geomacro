#!/usr/bin/env node
// Verify and read an observation raw payload directly from private B2.
// New bundle pointers require one B2 GET; legacy per-object archives remain supported.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const sha = (x) => createHash("sha256").update(x).digest("hex");
const id = process.env.OBS_RESTORE_ID;
if (!id || id.length > 512 || process.env.APP_SUPABASE_URL !== "https://ldpwajisioljyjtojvfx.supabase.co" ||
    !process.env.APP_SUPABASE_SERVICE_ROLE_KEY) throw new Error("OBS_RESTORE_CONFIG_INVALID");
const db = createClient(process.env.APP_SUPABASE_URL, process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { data: row, error } = await db.from("live_external_observations")
  .select("observation_id,raw_hash,raw_payload,archive_bundle_key,archive_bundle_sha256,archive_member_sha256")
  .eq("observation_id", id).single();
if (error || !row || row.raw_payload !== null) throw new Error("OBS_RESTORE_ROW_INVALID");
const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID, secretKey: process.env.B2_APPLICATION_KEY,
  bucket: "geomacro-private-archive" });

let raw;
let source;
if (row.archive_bundle_key) {
  if (!/^geomacro-evidence\/v1\/observation-bundles\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$/.test(row.archive_bundle_key) ||
      !/^[a-f0-9]{64}$/.test(row.archive_bundle_sha256 ?? "") ||
      !/^[a-f0-9]{64}$/.test(row.archive_member_sha256 ?? "")) throw new Error("OBS_RESTORE_BUNDLE_POINTER_INVALID");
  const packed = await b2.get(row.archive_bundle_key);
  if (sha(packed) !== row.archive_bundle_sha256) throw new Error("OBS_RESTORE_BUNDLE_HASH_INVALID");
  const bundle = JSON.parse(gunzipSync(packed, { maxOutputLength: 50_000_000 }).toString("utf8"));
  if (bundle?.schema !== "geomacro.observation-raw-bundle.v1" || !Array.isArray(bundle?.entries)) throw new Error("OBS_RESTORE_BUNDLE_SHAPE_INVALID");
  const entry = bundle.entries.find((candidate) => candidate.observation_id === id);
  if (!entry || entry.raw_hash !== row.raw_hash || entry.payload_sha256 !== row.archive_member_sha256 || !entry.raw_payload) {
    throw new Error("OBS_RESTORE_BUNDLE_MEMBER_INVALID");
  }
  raw = Buffer.from(JSON.stringify(entry.raw_payload));
  if (sha(raw) !== row.archive_member_sha256) throw new Error("OBS_RESTORE_BUNDLE_MEMBER_HASH_INVALID");
  JSON.parse(raw.toString("utf8"));
  source = "private_b2_bundle";
} else {
  const suffix = sha(Buffer.from(id));
  const key = `geomacro-evidence/v1/observations/${suffix}.json.gz`;
  const proofKey = `geomacro-evidence/v1/index/observations/${suffix}.json`;
  const proof = JSON.parse((await b2.get(proofKey)).toString("utf8"));
  if (proof.schema !== "geomacro.observation-raw-archive.v1" || proof.observation_id !== id ||
      proof.source_raw_hash !== row.raw_hash || proof.archive_key !== key ||
      proof.source_table !== "public.live_external_observations") throw new Error("OBS_RESTORE_PROOF_INVALID");
  const compressed = await b2.get(key);
  if (compressed.length !== proof.compressed_bytes || sha(compressed) !== proof.compressed_sha256) throw new Error("OBS_RESTORE_COMPRESSED_HASH_INVALID");
  raw = gunzipSync(compressed, { maxOutputLength: 2_000_000 });
  if (raw.length !== proof.payload_bytes || sha(raw) !== proof.payload_sha256) throw new Error("OBS_RESTORE_PAYLOAD_HASH_INVALID");
  JSON.parse(raw.toString("utf8"));
  source = "private_b2_legacy";
}
console.log(JSON.stringify({ ok: true, observation_id: id, source,
  payload_bytes: raw.length, proof_verified: true, payload_verified: true }));
