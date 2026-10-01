#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const REQUIRED_ACK = "I_ACCEPT_VERIFIED_EVIDENCE_COLD_DELETE";
const DB_CHUNK = 100;
const DELETE_CHUNK = 25;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const rowHash = (row) => sha256(Buffer.from(JSON.stringify(row)));

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const sameJson = (a, b) => stableJson(a) === stableJson(b);

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const ack = String(process.env.STRUCTURED_EVIDENCE_PHASE_B_ACK ?? "").trim();
const batchLimit = Number(process.env.STRUCTURED_EVIDENCE_PHASE_B_BATCH_LIMIT ?? 500);
const rounds = Number(process.env.STRUCTURED_EVIDENCE_PHASE_B_ROUNDS ?? 10);

if (
  url !== PROJECT_URL || !role || ack !== REQUIRED_ACK ||
  !Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 500 ||
  !Number.isInteger(rounds) || rounds < 1 || rounds > 10
) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_CONFIG_INVALID");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

const keyOf = (item) => `${item.event_id}:${item.fingerprint}`;
const bridgeKey = (eventId, sourceKey) => `${eventId}\u0000${sourceKey}`;
const chunks = (values, size) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));
const normalizeList = (value) => Array.isArray(value) ? value.map(String).sort() : [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function verifyArchiveBundle(readback, items) {
  if (!items.length) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_EMPTY_BATCH");
  const expectedBundleKey = items[0].bundle_key;
  const expectedBundleSha = items[0].bundle_sha256;
  if (items.some((item) => item.bundle_key !== expectedBundleKey || item.bundle_sha256 !== expectedBundleSha)) {
    throw new Error("STRUCTURED_EVIDENCE_PHASE_B_MIXED_BUNDLE");
  }
  if (sha256(readback) !== expectedBundleSha) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_BUNDLE_HASH_INVALID");

  let restored;
  try {
    restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  } catch {
    throw new Error("STRUCTURED_EVIDENCE_PHASE_B_BUNDLE_RESTORE_INVALID");
  }
  if (restored?.schema !== "geomacro.structured-event-evidence-bundle.v1" || !Array.isArray(restored?.members)) {
    throw new Error("STRUCTURED_EVIDENCE_PHASE_B_BUNDLE_RESTORE_INVALID");
  }

  const byKey = new Map(restored.members.map((member) => [`${member?.event_id ?? ""}:${member?.fingerprint ?? ""}`, member]));
  for (const item of items) {
    const member = byKey.get(keyOf(item));
    if (
      !member || member.source_key !== item.source_key || member.row_sha256 !== item.row_sha256 ||
      !member.row || typeof member.row !== "object" || Array.isArray(member.row) ||
      rowHash(member.row) !== item.row_sha256 ||
      !sameJson(member.row, item.row_json)
    ) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_MEMBER_INVALID_${keyOf(item)}`);
  }
}

async function loadCandidates() {
  const { data, error } = await db.rpc("geomacro_structured_evidence_delete_candidates", { p_limit: batchLimit });
  if (error) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_QUERY_FAILED_${error.code ?? "unknown"}`);
  return Array.isArray(data) ? data : [];
}

async function countPresent(items) {
  const { data, error } = await db.rpc("geomacro_count_structured_evidence_present", {
    p_keys: items.map(({ event_id, fingerprint }) => ({ event_id, fingerprint })),
  });
  if (error) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_PRESENCE_FAILED_${error.code ?? "unknown"}`);
  return Number(data);
}

async function rightsSnapshot(items) {
  const eventIds = [...new Set(items.map((item) => String(item.event_id)))].sort();
  const rightsRows = [];
  const eventRows = [];
  for (const part of chunks(eventIds, DB_CHUNK)) {
    const [{ data: rights, error: rightsError }, { data: events, error: eventError }] = await Promise.all([
      db.from("live_structured_event_commercial_rights_evaluation")
        .select("event_id,evaluated_status,reason_codes,source_keys").in("event_id", part),
      db.from("live_structured_events")
        .select("id,commercial_eligibility_status,commercial_eligibility_reason_codes").in("id", part),
    ]);
    if (rightsError || eventError) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_RIGHTS_READ_FAILED");
    rightsRows.push(...(rights ?? []));
    eventRows.push(...(events ?? []));
  }
  if (rightsRows.length !== eventIds.length || eventRows.length !== eventIds.length) {
    throw new Error("STRUCTURED_EVIDENCE_PHASE_B_RIGHTS_INCOMPLETE");
  }
  const rightsById = new Map(rightsRows.map((row) => [String(row.event_id), row]));
  const eventsById = new Map(eventRows.map((row) => [String(row.id), row]));
  return eventIds.map((id) => {
    const rights = rightsById.get(id);
    const event = eventsById.get(id);
    return [id, {
      evaluated_status: String(rights?.evaluated_status ?? ""),
      reason_codes: normalizeList(rights?.reason_codes),
      source_keys: normalizeList(rights?.source_keys),
      event_status: String(event?.commercial_eligibility_status ?? ""),
      event_reason_codes: normalizeList(event?.commercial_eligibility_reason_codes),
    }];
  });
}

async function currentBridges(items) {
  const eventIds = [...new Set(items.map((item) => String(item.event_id)))];
  const found = [];
  for (const part of chunks(eventIds, DB_CHUNK)) {
    const { data, error } = await db.from("live_structured_event_archived_sources")
      .select("event_id,source_key").in("event_id", part);
    if (error) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_BRIDGE_READ_FAILED_${error.code ?? "unknown"}`);
    found.push(...(data ?? []));
  }
  return new Set(found.map((row) => bridgeKey(String(row.event_id), String(row.source_key))));
}

async function insertMissingBridges(items) {
  const existing = await currentBridges(items);
  const unique = new Map();
  for (const item of items) unique.set(bridgeKey(item.event_id, item.source_key), { event_id: item.event_id, source_key: item.source_key });
  const missing = [...unique.entries()].filter(([key]) => !existing.has(key)).map(([, row]) => row);
  if (!missing.length) return [];
  for (const part of chunks(missing, DB_CHUNK)) {
    const { error } = await db.from("live_structured_event_archived_sources").insert(part);
    if (error) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_BRIDGE_INSERT_FAILED_${error.code ?? "unknown"}`);
  }
  return missing;
}

async function removeOwnedBridges(bridges) {
  for (const part of chunks(bridges, DELETE_CHUNK)) {
    const filter = part.map((row) => `and(event_id.eq.${row.event_id},source_key.eq.${row.source_key})`).join(",");
    const { data, error } = await db.from("live_structured_event_archived_sources")
      .delete().or(filter).select("event_id,source_key");
    if (error || (data ?? []).length !== part.length) {
      throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_BRIDGE_ROLLBACK_FAILED_${error?.code ?? "count"}`);
    }
  }
}

async function readCurrentEvidence(items) {
  const rows = [];
  for (const part of chunks(items, DELETE_CHUNK)) {
    const filter = part.map((item) => `and(event_id.eq.${item.event_id},fingerprint.eq.${item.fingerprint})`).join(",");
    const { data, error } = await db.from("live_structured_event_evidence").select("*").or(filter);
    if (error) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_SOURCE_READ_FAILED_${error.code ?? "unknown"}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function deleteExactEvidence(items) {
  const deleted = [];
  for (const part of chunks(items, DELETE_CHUNK)) {
    const filter = part.map((item) => `and(event_id.eq.${item.event_id},fingerprint.eq.${item.fingerprint})`).join(",");
    const { data, error } = await db.from("live_structured_event_evidence")
      .delete().or(filter).select("event_id,fingerprint");
    if (error) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_DELETE_FAILED_${error.code ?? "unknown"}`);
    deleted.push(...(data ?? []));
  }
  if (deleted.length !== items.length) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_DELETE_COUNT_MISMATCH");
  return deleted;
}

async function restoreEvidence(items) {
  const current = await readCurrentEvidence(items);
  const currentByKey = new Map(current.map((row) => [keyOf(row), row]));
  for (const row of current) {
    const wanted = items.find((item) => keyOf(item) === keyOf(row));
    if (!wanted || !sameJson(row, wanted.row_json)) {
      throw new Error("STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_SOURCE_CHANGED");
    }
  }
  const missingRows = items.filter((item) => !currentByKey.has(keyOf(item))).map((item) => item.row_json);
  for (const part of chunks(missingRows, DB_CHUNK)) {
    const { error } = await db.from("live_structured_event_evidence").insert(part);
    if (error) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_INSERT_FAILED_${error.code ?? "unknown"}`);
  }
  if (await countPresent(items) !== items.length) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_VERIFY_FAILED");
}

async function rollback(items, insertedBridges, beforeRights) {
  await restoreEvidence(items);
  if (insertedBridges.length) await removeOwnedBridges(insertedBridges);
  const restoredRights = await rightsSnapshot(items);
  if (!same(beforeRights, restoredRights)) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_RIGHTS_FAILED");
}

let totalDeleted = 0;
let completedRounds = 0;

for (; completedRounds < rounds; completedRounds += 1) {
  const candidates = await loadCandidates();
  if (!candidates.length) break;

  for (const item of candidates) {
    if (
      !/^[0-9a-f-]{36}$/i.test(String(item?.event_id ?? "")) ||
      !/^[0-9a-f]{64}$/i.test(String(item?.fingerprint ?? "")) ||
      !/^[0-9a-f]{64}$/i.test(String(item?.bundle_sha256 ?? "")) ||
      !/^[0-9a-f]{64}$/i.test(String(item?.row_sha256 ?? "")) ||
      !/^geomacro-evidence\/v1\/structured-event-evidence-bundles\/[A-Za-z0-9_./-]+\.json\.gz$/.test(String(item?.bundle_key ?? "")) ||
      !String(item?.source_key ?? "").trim() || !item?.row_json || typeof item.row_json !== "object"
    ) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_CANDIDATE_INVALID");
  }

  const bundleKey = candidates[0].bundle_key;
  const firstReadback = await b2.get(bundleKey);
  verifyArchiveBundle(firstReadback, candidates);

  const beforeRights = await rightsSnapshot(candidates);
  let insertedBridges = [];
  let mutationStarted = false;
  let finalized = false;

  try {
    insertedBridges = await insertMissingBridges(candidates);
    mutationStarted = insertedBridges.length > 0;

    const rightsWithBridges = await rightsSnapshot(candidates);
    if (!same(beforeRights, rightsWithBridges)) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_BRIDGE_RIGHTS_CHANGED");

    const currentRows = await readCurrentEvidence(candidates);
    if (currentRows.length !== candidates.length) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_SOURCE_COUNT_CHANGED");
    const wantedByKey = new Map(candidates.map((item) => [keyOf(item), item]));
    for (const row of currentRows) {
      const wanted = wantedByKey.get(keyOf(row));
      if (!wanted || !sameJson(row, wanted.row_json)) {
        throw new Error("STRUCTURED_EVIDENCE_PHASE_B_SOURCE_CHANGED");
      }
    }

    await deleteExactEvidence(candidates);
    mutationStarted = true;
    if (await countPresent(candidates) !== 0) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_SOURCE_STILL_PRESENT");

    const afterRights = await rightsSnapshot(candidates);
    if (!same(beforeRights, afterRights)) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_DELETE_RIGHTS_CHANGED");

    const secondReadback = await b2.get(bundleKey);
    verifyArchiveBundle(secondReadback, candidates);

    const proofKey = `geomacro-evidence/v1/index/structured-event-evidence-phase-b/${candidates[0].bundle_sha256}-${candidates[0].fingerprint}.json`;
    await b2.put(proofKey, Buffer.from(JSON.stringify({
      schema: "geomacro.structured-event-evidence-phase-b-proof.v1",
      archive_bucket: ARCHIVE_BUCKET,
      bundle_key: bundleKey,
      bundle_sha256: candidates[0].bundle_sha256,
      deleted_rows: candidates.length,
      rights_unchanged: true,
      full_b2_readback_verified_before_delete: true,
      full_b2_readback_verified_after_delete: true,
      exact_hot_rows_verified_before_delete: true,
      rollback_copy_retained_until_finalize: true,
      verified_at: new Date().toISOString(),
      members: candidates.map(({ event_id, fingerprint, source_key, row_sha256 }) => ({ event_id, fingerprint, source_key, row_sha256 })),
    })));

    const rpcItems = candidates.map(({ event_id, fingerprint, source_key, bundle_key, bundle_sha256, row_sha256 }) => ({
      event_id, fingerprint, source_key, bundle_key, bundle_sha256, row_sha256,
    }));
    const { data: finalizedCount, error: finalizeError } = await db.rpc("geomacro_finalize_verified_structured_evidence", { p_items: rpcItems });
    if (finalizeError) throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_FINALIZE_FAILED_${finalizeError.code ?? "unknown"}`);
    if (Number(finalizedCount) !== candidates.length) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_FINALIZE_COUNT_UNEXPECTED");
    finalized = true;

    totalDeleted += candidates.length;
    console.log(JSON.stringify({
      ok: true,
      status: "progress",
      deleted: candidates.length,
      total_deleted: totalDeleted,
      bundle_key: bundleKey,
      inserted_source_bridges: insertedBridges.length,
      full_b2_readback_verified_before_delete: true,
      full_b2_readback_verified_after_delete: true,
      rights_unchanged: true,
      archive_index_compacted_after_verification: true,
      b2: b2.usage(),
    }));
  } catch (cause) {
    if (mutationStarted && !finalized) {
      try {
        await rollback(candidates, insertedBridges, beforeRights);
      } catch (rollbackCause) {
        throw new Error("STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_FATAL", { cause: rollbackCause });
      }
    }
    throw cause;
  }
}

console.log(JSON.stringify({
  ok: true,
  status: totalDeleted === 0 ? "complete" : "bounded_complete",
  total_deleted: totalDeleted,
  rounds_completed: completedRounds,
  batch_limit: batchLimit,
  max_rounds: rounds,
  b2: b2.usage(),
}));
