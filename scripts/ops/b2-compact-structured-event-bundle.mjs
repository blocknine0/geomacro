#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const MAX_BUNDLE_RAW_BYTES = 12_000_000;
const MAX_BUNDLE_COMPRESSED_BYTES = 6_000_000;
const VERIFY_READ_CHUNK_SIZE = 100;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const olderDays = Number(process.env.STRUCTURED_EVENT_BUNDLE_OLDER_DAYS ?? 7);
const limit = Number(process.env.STRUCTURED_EVENT_BUNDLE_LIMIT ?? 25);

if (
  url !== PROJECT_URL ||
  !role ||
  !Number.isInteger(olderDays) ||
  olderDays < 7 ||
  olderDays > 3650 ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  limit > 1000
) {
  throw new Error("STRUCTURED_EVENT_BUNDLE_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

function compactPointer(bundleKey, bundleSha256, payloadSha256, eventId) {
  return {
    _archive: {
      v: 2,
      t: "bundle-v1",
      k: bundleKey,
      a: bundleSha256,
      p: payloadSha256,
      m: eventId,
    },
  };
}

function payloadHash(payload) {
  return sha256(Buffer.from(JSON.stringify(payload)));
}

function verifyBundle(readback, expectedBundleSha, expectedMembers) {
  if (readback.length > MAX_BUNDLE_COMPRESSED_BYTES || sha256(readback) !== expectedBundleSha) {
    throw new Error("STRUCTURED_EVENT_BUNDLE_READBACK_HASH_INVALID");
  }

  let restored;
  try {
    restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  } catch {
    throw new Error("STRUCTURED_EVENT_BUNDLE_RESTORE_INVALID");
  }
  if (
    restored?.schema !== "geomacro.structured-event-payload-bundle.v1" ||
    !Array.isArray(restored?.members) ||
    restored.members.length !== expectedMembers.length
  ) {
    throw new Error("STRUCTURED_EVENT_BUNDLE_RESTORE_INVALID");
  }

  const expected = new Map(expectedMembers.map((member) => [member.event_id, member]));
  const seen = new Set();
  for (const member of restored.members) {
    const eventId = String(member?.event_id ?? "");
    const wanted = expected.get(eventId);
    if (!wanted || seen.has(eventId)) throw new Error("STRUCTURED_EVENT_BUNDLE_MEMBER_INVALID");
    seen.add(eventId);
    if (
      member?.payload_sha256 !== wanted.payload_sha256 ||
      !member?.structured_payload ||
      typeof member.structured_payload !== "object" ||
      Array.isArray(member.structured_payload) ||
      payloadHash(member.structured_payload) !== wanted.payload_sha256
    ) {
      throw new Error("STRUCTURED_EVENT_BUNDLE_MEMBER_HASH_INVALID");
    }
  }
  if (seen.size !== expectedMembers.length) throw new Error("STRUCTURED_EVENT_BUNDLE_MEMBER_INVALID");
  return restored;
}

async function readEventRowsByIds(ids, failureCode) {
  const allRows = [];
  for (let offset = 0; offset < ids.length; offset += VERIFY_READ_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + VERIFY_READ_CHUNK_SIZE);
    const { data, error } = await db
      .from("live_structured_events")
      .select("id,structured_payload,last_seen_at")
      .in("id", chunk);
    if (error || (data ?? []).length !== chunk.length) {
      throw new Error(failureCode);
    }
    allRows.push(...(data ?? []));
  }
  return allRows;
}

async function rollback(updates) {
  const restoreUpdates = updates.map((item) => ({
    id: item.id,
    last_seen_at: item.last_seen_at,
    expected_pointer: item.compact_payload,
    restore_payload: item.expected_payload,
  }));
  const { data, error } = await db.rpc("geomacro_restore_structured_event_payload_bundle", {
    p_updates: restoreUpdates,
  });
  if (error || Number(data) !== restoreUpdates.length) {
    throw new Error(`STRUCTURED_EVENT_BUNDLE_ROLLBACK_FAILED_${error?.code ?? "count"}`);
  }

  const restoredRows = await readEventRowsByIds(
    restoreUpdates.map((item) => item.id),
    "STRUCTURED_EVENT_BUNDLE_ROLLBACK_VERIFY_FAILED",
  );
  const expectedById = new Map(restoreUpdates.map((item) => [item.id, item]));
  for (const row of restoredRows) {
    const wanted = expectedById.get(row.id);
    if (!wanted || row.last_seen_at !== wanted.last_seen_at || payloadHash(row.structured_payload) !== payloadHash(wanted.restore_payload)) {
      throw new Error("STRUCTURED_EVENT_BUNDLE_ROLLBACK_VERIFY_FAILED");
    }
  }
}

const cutoff = new Date(Date.now() - olderDays * 86_400_000).toISOString();
const { data: rows, error } = await db
  .from("live_structured_events")
  .select("id,story_key,domain,event_type,last_seen_at,last_observed_at,structured_payload,structure_version")
  .lt("last_seen_at", cutoff)
  .not("structured_payload", "cs", JSON.stringify({ _archive: { v: 2 } }))
  .order("last_seen_at", { ascending: true })
  .limit(limit);
if (error) throw new Error(`STRUCTURED_EVENT_BUNDLE_QUERY_FAILED_${error.code ?? "unknown"}: ${error.message ?? "unknown"}`);

const members = [];
let rawPayloadBytes = 0;
for (const row of rows ?? []) {
  const payload = row?.structured_payload;
  if (
    !/^[0-9a-f-]{36}$/i.test(String(row?.id ?? "")) ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length === 0
  ) continue;

  const payloadRaw = Buffer.from(JSON.stringify(payload));
  const member = {
    event_id: row.id,
    story_key: row.story_key,
    domain: row.domain,
    event_type: row.event_type,
    structure_version: row.structure_version,
    last_seen_at: row.last_seen_at,
    last_observed_at: row.last_observed_at,
    payload_sha256: sha256(payloadRaw),
    structured_payload: payload,
  };
  const projected = Buffer.byteLength(JSON.stringify({
    schema: "geomacro.structured-event-payload-bundle.v1",
    created_at: new Date(0).toISOString(),
    members: [...members, member],
  }));
  if (projected > MAX_BUNDLE_RAW_BYTES) break;
  members.push(member);
  rawPayloadBytes += payloadRaw.length;
}

if (members.length === 0) {
  console.log(JSON.stringify({ ok: true, status: "complete", compacted: 0, older_days: olderDays, limit, cutoff, b2: b2.usage() }));
  process.exit(0);
}

const envelope = {
  schema: "geomacro.structured-event-payload-bundle.v1",
  created_at: new Date().toISOString(),
  members,
};
const bundleRaw = Buffer.from(JSON.stringify(envelope));
if (bundleRaw.length > MAX_BUNDLE_RAW_BYTES) throw new Error("STRUCTURED_EVENT_BUNDLE_TOO_LARGE");
const compressed = gzipSync(bundleRaw, { level: 9 });
if (compressed.length > MAX_BUNDLE_COMPRESSED_BYTES) throw new Error("STRUCTURED_EVENT_BUNDLE_COMPRESSED_TOO_LARGE");
const bundleSha = sha256(compressed);
const day = new Date().toISOString().slice(0, 10);
const bundleKey = `geomacro-evidence/v1/structured-event-bundles/${day}/${bundleSha}.json.gz`;
const preflightKey = `geomacro-evidence/v1/health/read-preflight/${day}/${bundleSha}.missing`;

const preflightReadback = await b2.getOptional(preflightKey);
if (preflightReadback !== null) throw new Error("STRUCTURED_EVENT_BUNDLE_READ_PREFLIGHT_COLLISION");

await b2.put(bundleKey, compressed);
const firstReadback = await b2.get(bundleKey);
verifyBundle(firstReadback, bundleSha, members);

const memberById = new Map(members.map((member) => [member.event_id, member]));
const sourceById = new Map((rows ?? []).map((row) => [row.id, row]));
const updates = [];
for (const member of members) {
  const row = sourceById.get(member.event_id);
  if (!row) continue;
  const pointer = compactPointer(bundleKey, bundleSha, member.payload_sha256, member.event_id);
  const currentBytes = Buffer.byteLength(JSON.stringify(row.structured_payload));
  const pointerBytes = Buffer.byteLength(JSON.stringify(pointer));
  if (pointerBytes >= currentBytes) continue;
  updates.push({
    id: row.id,
    last_seen_at: row.last_seen_at,
    expected_payload: row.structured_payload,
    compact_payload: pointer,
    current_bytes: currentBytes,
    pointer_bytes: pointerBytes,
  });
}

if (updates.length === 0) {
  console.log(JSON.stringify({ ok: true, status: "complete", compacted: 0, archived_members: members.length, reason: "NO_PAYLOAD_LARGER_THAN_POINTER", bundle_key: bundleKey, b2: b2.usage() }));
  process.exit(0);
}

const proofKey = `geomacro-evidence/v1/index/structured-event-bundles/${bundleSha}.proof.json`;
const proof = {
  schema: "geomacro.structured-event-payload-bundle-proof.v1",
  archive_bucket: ARCHIVE_BUCKET,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_compressed_bytes: compressed.length,
  bundle_raw_bytes: bundleRaw.length,
  archived_member_count: members.length,
  compacted_member_count: updates.length,
  member_payload_hashes: Object.fromEntries(members.map((member) => [member.event_id, member.payload_sha256])),
  pre_write_b2_read_preflight_verified: true,
  pre_update_full_b2_readback_verified: true,
  json_restore_verified: true,
  verified_at: new Date().toISOString(),
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

const rpcUpdates = updates.map(({ current_bytes: _current, pointer_bytes: _pointer, ...item }) => item);
const { data: compactedCount, error: compactError } = await db.rpc("geomacro_compact_structured_event_payload_bundle", {
  p_updates: rpcUpdates,
});
if (compactError || Number(compactedCount) !== rpcUpdates.length) {
  throw new Error(`STRUCTURED_EVENT_BUNDLE_COMPACT_RPC_FAILED_${compactError?.code ?? "count"}`);
}

let updatedRows;
try {
  updatedRows = await readEventRowsByIds(
    updates.map((item) => item.id),
    "STRUCTURED_EVENT_BUNDLE_UPDATE_VERIFY_FAILED",
  );
} catch (cause) {
  await rollback(updates);
  throw cause;
}
const updateById = new Map(updates.map((item) => [item.id, item]));
for (const row of updatedRows) {
  const wanted = updateById.get(row.id);
  if (
    !wanted ||
    row.last_seen_at !== wanted.last_seen_at ||
    row?.structured_payload?._archive?.v !== 2 ||
    row?.structured_payload?._archive?.t !== "bundle-v1" ||
    row?.structured_payload?._archive?.k !== bundleKey ||
    row?.structured_payload?._archive?.a !== bundleSha ||
    row?.structured_payload?._archive?.m !== row.id ||
    row?.structured_payload?._archive?.p !== memberById.get(row.id)?.payload_sha256
  ) {
    await rollback(updates);
    throw new Error("STRUCTURED_EVENT_BUNDLE_UPDATE_VERIFY_FAILED");
  }
}

try {
  const secondReadback = await b2.get(bundleKey);
  verifyBundle(secondReadback, bundleSha, members);
} catch (cause) {
  await rollback(updates);
  throw new Error("STRUCTURED_EVENT_BUNDLE_POST_UPDATE_RESTORE_FAILED", { cause });
}

const hotBytesBefore = updates.reduce((sum, item) => sum + item.current_bytes, 0);
const hotBytesAfter = updates.reduce((sum, item) => sum + item.pointer_bytes, 0);
console.log(JSON.stringify({
  ok: true,
  status: "progress",
  compacted: updates.length,
  archived_members: members.length,
  b2_read_preflight_verified_before_write: true,
  full_b2_readback_verified_before_update: true,
  full_b2_readback_verified_after_update: true,
  json_restore_verified: true,
  source_rows_retained: true,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_compressed_bytes: compressed.length,
  source_payload_bytes_archived: rawPayloadBytes,
  hot_payload_bytes_before: hotBytesBefore,
  hot_payload_bytes_after: hotBytesAfter,
  hot_payload_bytes_reduced: hotBytesBefore - hotBytesAfter,
  pointer_version: 2,
  pointer_type: "bundle-v1",
  older_days: olderDays,
  cutoff,
  b2: b2.usage(),
}));
