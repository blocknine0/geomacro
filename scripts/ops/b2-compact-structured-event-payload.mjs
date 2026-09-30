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
const olderDays = Number(process.env.STRUCTURED_EVENT_COMPACT_OLDER_DAYS ?? 7);
const limit = Number(process.env.STRUCTURED_EVENT_COMPACT_LIMIT ?? 1);

if (
  url !== PROJECT_URL ||
  !role ||
  !Number.isInteger(olderDays) ||
  olderDays < 7 ||
  olderDays > 3650 ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  limit > 10
) {
  throw new Error("STRUCTURED_EVENT_COMPACT_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

const HOT_KEYS = [
  "structure_version",
  "country_version",
  "story_version",
  "scoring_version",
  "relevance_version",
  "event_label",
  "primary_country_name",
  "source_domains",
  "source_families",
  "cluster_tokens",
  "why_it_matters",
  "risk_channels",
  "severity",
  "confidence",
  "direction",
];

function compactProjection(payload, pointer) {
  const projection = {};
  for (const key of HOT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) projection[key] = payload[key];
  }
  projection._archive = pointer;
  return projection;
}

const cutoff = new Date(Date.now() - olderDays * 86_400_000).toISOString();
const { data: rows, error } = await db
  .from("live_structured_events")
  .select("id,story_key,domain,event_type,last_seen_at,last_observed_at,structured_payload,structure_version")
  .lt("last_seen_at", cutoff)
  .order("last_seen_at", { ascending: true })
  .limit(Math.max(limit * 8, 20));
if (error) throw new Error(`STRUCTURED_EVENT_COMPACT_QUERY_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);

let compacted = 0;
let skipped = 0;
for (const row of rows ?? []) {
  if (compacted >= limit) break;
  const payload = row.structured_payload;
  if (
    !/^[0-9a-f-]{36}$/i.test(String(row.id ?? "")) ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length === 0 ||
    (payload._archive && typeof payload._archive === "object")
  ) {
    skipped += 1;
    continue;
  }

  const payloadRaw = Buffer.from(JSON.stringify(payload));
  if (payloadRaw.length > 4_000_000) throw new Error("STRUCTURED_EVENT_COMPACT_PAYLOAD_TOO_LARGE");
  const envelope = {
    schema: "geomacro.structured-event-payload-archive.v1",
    event_id: row.id,
    story_key: row.story_key,
    domain: row.domain,
    event_type: row.event_type,
    structure_version: row.structure_version,
    last_seen_at: row.last_seen_at,
    last_observed_at: row.last_observed_at,
    structured_payload: payload,
  };
  const raw = Buffer.from(JSON.stringify(envelope));
  const compressed = gzipSync(raw, { level: 9 });
  const archiveKey = `geomacro-evidence/v1/structured-events/${row.id}/${sha256(payloadRaw)}.json.gz`;
  const proofKey = `geomacro-evidence/v1/index/structured-events/${row.id}/${sha256(payloadRaw)}.json`;

  await b2.put(archiveKey, compressed);
  const readback = await b2.get(archiveKey);
  if (readback.length !== compressed.length || sha256(readback) !== sha256(compressed)) {
    throw new Error("STRUCTURED_EVENT_COMPACT_READBACK_HASH_INVALID");
  }
  const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  const restoredPayloadRaw = Buffer.from(JSON.stringify(restored?.structured_payload ?? null));
  if (
    restored?.schema !== envelope.schema ||
    restored?.event_id !== row.id ||
    sha256(Buffer.from(JSON.stringify(restored))) !== sha256(raw) ||
    sha256(restoredPayloadRaw) !== sha256(payloadRaw)
  ) {
    throw new Error("STRUCTURED_EVENT_COMPACT_RESTORE_INVALID");
  }

  const pointer = {
    schema: "geomacro.structured-event-cold-pointer.v1",
    archive_bucket: ARCHIVE_BUCKET,
    archive_key: archiveKey,
    archive_sha256: sha256(compressed),
    payload_sha256: sha256(payloadRaw),
    verified_at: new Date().toISOString(),
  };
  const compact = compactProjection(payload, pointer);
  const compactRaw = Buffer.from(JSON.stringify(compact));
  if (compactRaw.length >= payloadRaw.length) {
    skipped += 1;
    continue;
  }

  const proof = {
    schema: "geomacro.structured-event-payload-compaction-proof.v1",
    event_id: row.id,
    archive_bucket: ARCHIVE_BUCKET,
    archive_key: archiveKey,
    source_payload_sha256: pointer.payload_sha256,
    archive_sha256: pointer.archive_sha256,
    source_payload_bytes: payloadRaw.length,
    compact_payload_bytes: compactRaw.length,
    bytes_reduced_logical: payloadRaw.length - compactRaw.length,
    full_b2_readback_verified: true,
    json_restore_verified: true,
    verified_at: pointer.verified_at,
  };
  await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

  const { data: current, error: currentError } = await db
    .from("live_structured_events")
    .select("id,structured_payload,last_seen_at")
    .eq("id", row.id)
    .single();
  if (
    currentError ||
    current?.id !== row.id ||
    current?.last_seen_at !== row.last_seen_at ||
    sha256(Buffer.from(JSON.stringify(current.structured_payload))) !== pointer.payload_sha256
  ) {
    throw new Error("STRUCTURED_EVENT_COMPACT_SOURCE_CHANGED");
  }

  const { data: updated, error: updateError } = await db
    .from("live_structured_events")
    .update({ structured_payload: compact })
    .eq("id", row.id)
    .eq("last_seen_at", row.last_seen_at)
    .select("id,structured_payload,last_seen_at")
    .single();
  if (
    updateError ||
    updated?.id !== row.id ||
    updated?.last_seen_at !== row.last_seen_at ||
    updated?.structured_payload?._archive?.payload_sha256 !== pointer.payload_sha256
  ) {
    throw new Error("STRUCTURED_EVENT_COMPACT_UPDATE_UNCONFIRMED");
  }

  try {
    const postReadback = await b2.get(pointer.archive_key);
    if (sha256(postReadback) !== pointer.archive_sha256) throw new Error("STRUCTURED_EVENT_COMPACT_POST_UPDATE_ARCHIVE_HASH_INVALID");
    const postRestored = JSON.parse(gunzipSync(postReadback).toString("utf8"));
    if (sha256(Buffer.from(JSON.stringify(postRestored?.structured_payload ?? null))) !== pointer.payload_sha256) {
      throw new Error("STRUCTURED_EVENT_COMPACT_POST_UPDATE_RESTORE_INVALID");
    }
  } catch (cause) {
    const rollback = await db
      .from("live_structured_events")
      .update({ structured_payload: payload })
      .eq("id", row.id)
      .eq("last_seen_at", row.last_seen_at);
    if (rollback.error) throw new Error("STRUCTURED_EVENT_COMPACT_ROLLBACK_FAILED", { cause });
    throw cause;
  }

  compacted += 1;
  console.log(JSON.stringify({
    ok: true,
    status: "progress",
    event_id: row.id,
    full_b2_readback_verified: true,
    json_restore_verified: true,
    source_row_retained: true,
    hot_projection_retained: true,
    full_payload_externalized: true,
    source_payload_bytes: payloadRaw.length,
    compact_payload_bytes: compactRaw.length,
    bytes_reduced_logical: payloadRaw.length - compactRaw.length,
    archive_key: pointer.archive_key,
  }));
}

console.log(JSON.stringify({
  ok: true,
  status: compacted > 0 ? "progress" : "complete",
  compacted,
  skipped,
  limit,
  older_days: olderDays,
  cutoff,
  verification_mode: "full-b2-readback-plus-post-update-restore-with-rollback",
}));
