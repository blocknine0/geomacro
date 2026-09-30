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

function pointerV2(archiveKey, archiveSha256, payloadSha256) {
  return {
    _archive: {
      v: 2,
      k: archiveKey,
      a: archiveSha256,
      p: payloadSha256,
    },
  };
}

function legacyPointer(payload) {
  const pointer = payload?._archive;
  if (!pointer || typeof pointer !== "object" || Array.isArray(pointer)) return null;
  if (pointer.v === 2 && typeof pointer.k === "string" && typeof pointer.a === "string" && typeof pointer.p === "string") {
    return { version: 2, key: pointer.k, archiveSha256: pointer.a, payloadSha256: pointer.p };
  }
  if (
    pointer.schema === "geomacro.structured-event-cold-pointer.v1" &&
    typeof pointer.archive_key === "string" &&
    typeof pointer.archive_sha256 === "string" &&
    typeof pointer.payload_sha256 === "string"
  ) {
    return {
      version: 1,
      key: pointer.archive_key,
      archiveSha256: pointer.archive_sha256,
      payloadSha256: pointer.payload_sha256,
    };
  }
  return null;
}

function assertArchiveKey(key, eventId) {
  const prefix = `geomacro-evidence/v1/structured-events/${eventId}/`;
  if (!key.startsWith(prefix) || !key.endsWith(".json.gz") || key.includes("..")) {
    throw new Error("STRUCTURED_EVENT_COMPACT_POINTER_INVALID");
  }
}

async function restoreArchive(pointer, eventId) {
  assertArchiveKey(pointer.key, eventId);
  if (!/^[0-9a-f]{64}$/.test(pointer.archiveSha256) || !/^[0-9a-f]{64}$/.test(pointer.payloadSha256)) {
    throw new Error("STRUCTURED_EVENT_COMPACT_POINTER_HASH_INVALID");
  }
  const readback = await b2.get(pointer.key);
  if (readback.length > 4_500_000 || sha256(readback) !== pointer.archiveSha256) {
    throw new Error("STRUCTURED_EVENT_COMPACT_READBACK_HASH_INVALID");
  }
  const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  const restoredPayload = restored?.structured_payload;
  if (
    restored?.schema !== "geomacro.structured-event-payload-archive.v1" ||
    restored?.event_id !== eventId ||
    !restoredPayload ||
    typeof restoredPayload !== "object" ||
    Array.isArray(restoredPayload)
  ) {
    throw new Error("STRUCTURED_EVENT_COMPACT_RESTORE_INVALID");
  }
  const payloadRaw = Buffer.from(JSON.stringify(restoredPayload));
  if (sha256(payloadRaw) !== pointer.payloadSha256) {
    throw new Error("STRUCTURED_EVENT_COMPACT_RESTORE_INVALID");
  }
  return { restored, restoredPayload, payloadRaw, readback };
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
  const currentPayload = row.structured_payload;
  if (
    !/^[0-9a-f-]{36}$/i.test(String(row.id ?? "")) ||
    !currentPayload ||
    typeof currentPayload !== "object" ||
    Array.isArray(currentPayload) ||
    Object.keys(currentPayload).length === 0
  ) {
    skipped += 1;
    continue;
  }

  const existingPointer = legacyPointer(currentPayload);
  if (existingPointer?.version === 2) {
    skipped += 1;
    continue;
  }

  let payload;
  let payloadRaw;
  let archiveKey;
  let archiveSha256;
  let payloadSha256;

  if (existingPointer?.version === 1) {
    const restored = await restoreArchive(existingPointer, row.id);
    payload = restored.restoredPayload;
    payloadRaw = restored.payloadRaw;
    archiveKey = existingPointer.key;
    archiveSha256 = existingPointer.archiveSha256;
    payloadSha256 = existingPointer.payloadSha256;
  } else {
    payload = currentPayload;
    payloadRaw = Buffer.from(JSON.stringify(payload));
    if (payloadRaw.length > 4_000_000) throw new Error("STRUCTURED_EVENT_COMPACT_PAYLOAD_TOO_LARGE");
    payloadSha256 = sha256(payloadRaw);
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
    archiveKey = `geomacro-evidence/v1/structured-events/${row.id}/${payloadSha256}.json.gz`;
    archiveSha256 = sha256(compressed);
    await b2.put(archiveKey, compressed);
    const readback = await b2.get(archiveKey);
    if (readback.length !== compressed.length || sha256(readback) !== archiveSha256) {
      throw new Error("STRUCTURED_EVENT_COMPACT_READBACK_HASH_INVALID");
    }
    const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
    const restoredPayloadRaw = Buffer.from(JSON.stringify(restored?.structured_payload ?? null));
    if (
      restored?.schema !== envelope.schema ||
      restored?.event_id !== row.id ||
      sha256(Buffer.from(JSON.stringify(restored))) !== sha256(raw) ||
      sha256(restoredPayloadRaw) !== payloadSha256
    ) {
      throw new Error("STRUCTURED_EVENT_COMPACT_RESTORE_INVALID");
    }
  }

  const compact = pointerV2(archiveKey, archiveSha256, payloadSha256);
  const compactRaw = Buffer.from(JSON.stringify(compact));
  const currentRaw = Buffer.from(JSON.stringify(currentPayload));
  if (compactRaw.length >= currentRaw.length) {
    skipped += 1;
    continue;
  }

  const proofKey = `geomacro-evidence/v1/index/structured-events/${row.id}/${payloadSha256}.pointer-v2.json`;
  const proof = {
    schema: "geomacro.structured-event-payload-compaction-proof.v2",
    event_id: row.id,
    archive_bucket: ARCHIVE_BUCKET,
    archive_key: archiveKey,
    source_payload_sha256: payloadSha256,
    archive_sha256: archiveSha256,
    full_payload_bytes: payloadRaw.length,
    prior_hot_payload_bytes: currentRaw.length,
    compact_payload_bytes: compactRaw.length,
    bytes_reduced_this_update: currentRaw.length - compactRaw.length,
    full_b2_readback_verified: true,
    json_restore_verified: true,
    verified_at: new Date().toISOString(),
  };
  await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

  const currentHash = sha256(currentRaw);
  const { data: current, error: currentError } = await db
    .from("live_structured_events")
    .select("id,structured_payload,last_seen_at")
    .eq("id", row.id)
    .single();
  if (
    currentError ||
    current?.id !== row.id ||
    current?.last_seen_at !== row.last_seen_at ||
    sha256(Buffer.from(JSON.stringify(current.structured_payload))) !== currentHash
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
    updated?.structured_payload?._archive?.v !== 2 ||
    updated?.structured_payload?._archive?.p !== payloadSha256
  ) {
    throw new Error("STRUCTURED_EVENT_COMPACT_UPDATE_UNCONFIRMED");
  }

  try {
    await restoreArchive({ key: archiveKey, archiveSha256, payloadSha256 }, row.id);
  } catch (cause) {
    const rollback = await db
      .from("live_structured_events")
      .update({ structured_payload: currentPayload })
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
    pointer_version: 2,
    full_b2_readback_verified: true,
    json_restore_verified: true,
    source_row_retained: true,
    full_payload_externalized: true,
    full_payload_bytes: payloadRaw.length,
    prior_hot_payload_bytes: currentRaw.length,
    compact_payload_bytes: compactRaw.length,
    bytes_reduced_this_update: currentRaw.length - compactRaw.length,
    archive_key: archiveKey,
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
  verification_mode: "pointer-v2-full-b2-readback-plus-post-update-restore-with-rollback",
}));
