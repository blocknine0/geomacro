#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const olderDays = Number(process.env.STRUCTURED_EVENT_ARCHIVE_OLDER_DAYS ?? 30);

if (url !== PROJECT_URL || !role || !Number.isInteger(olderDays) || olderDays < 7 || olderDays > 3650) {
  throw new Error("STRUCTURED_EVENT_ARCHIVE_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

const cutoff = new Date(Date.now() - olderDays * 86_400_000).toISOString();
const { data: rows, error } = await db
  .from("live_structured_events")
  .select("id,story_key,domain,event_type,last_seen_at,last_observed_at,structured_payload,structure_version")
  .lt("last_seen_at", cutoff)
  .order("last_seen_at", { ascending: true })
  .limit(1);
if (error) throw new Error(`STRUCTURED_EVENT_ARCHIVE_QUERY_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);
if (!rows?.length) {
  console.log(JSON.stringify({ ok: true, archived: 0, reason: "no_cold_structured_event_candidate", cutoff }));
  process.exit(0);
}

const row = rows[0];
if (
  !/^[0-9a-f-]{36}$/i.test(String(row.id ?? "")) ||
  !row.structured_payload ||
  typeof row.structured_payload !== "object" ||
  Array.isArray(row.structured_payload) ||
  Object.keys(row.structured_payload).length === 0
) {
  throw new Error("STRUCTURED_EVENT_ARCHIVE_SOURCE_INVALID");
}

const source = {
  schema: "geomacro.structured-event-payload-archive.v1",
  event_id: row.id,
  story_key: row.story_key,
  domain: row.domain,
  event_type: row.event_type,
  structure_version: row.structure_version,
  last_seen_at: row.last_seen_at,
  last_observed_at: row.last_observed_at,
  structured_payload: row.structured_payload,
};
const raw = Buffer.from(JSON.stringify(source));
if (raw.length > 4_000_000) throw new Error("STRUCTURED_EVENT_ARCHIVE_PAYLOAD_TOO_LARGE");
const compressed = gzipSync(raw, { level: 9 });
const archiveKey = `geomacro-evidence/v1/structured-events/${row.id}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/structured-events/${row.id}.json`;

await b2.put(archiveKey, compressed);
const readback = await b2.get(archiveKey);
if (readback.length !== compressed.length || sha256(readback) !== sha256(compressed)) {
  throw new Error("STRUCTURED_EVENT_ARCHIVE_READBACK_HASH_INVALID");
}
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (
  restored?.schema !== source.schema ||
  restored?.event_id !== row.id ||
  sha256(Buffer.from(JSON.stringify(restored))) !== sha256(raw)
) {
  throw new Error("STRUCTURED_EVENT_ARCHIVE_RESTORE_INVALID");
}

const proof = {
  schema: "geomacro.structured-event-payload-archive-proof.v1",
  event_id: row.id,
  archive_bucket: ARCHIVE_BUCKET,
  archive_key: archiveKey,
  source_payload_sha256: sha256(Buffer.from(JSON.stringify(row.structured_payload))),
  archive_sha256: sha256(compressed),
  archive_bytes: compressed.length,
  verified_at: new Date().toISOString(),
  destructive_cleanup_performed: false,
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

const { data: current, error: currentError } = await db
  .from("live_structured_events")
  .select("id,structured_payload")
  .eq("id", row.id)
  .single();
if (
  currentError ||
  current?.id !== row.id ||
  sha256(Buffer.from(JSON.stringify(current.structured_payload))) !== proof.source_payload_sha256
) {
  throw new Error("STRUCTURED_EVENT_ARCHIVE_SOURCE_CHANGED");
}

console.log(JSON.stringify({
  ok: true,
  archived: 1,
  event_id: row.id,
  cutoff,
  archive_key: archiveKey,
  archive_sha256: proof.archive_sha256,
  source_payload_sha256: proof.source_payload_sha256,
  full_b2_readback_verified: true,
  json_restore_verified: true,
  source_row_retained: true,
  structured_payload_retained: true,
  destructive_cleanup_performed: false,
}));
