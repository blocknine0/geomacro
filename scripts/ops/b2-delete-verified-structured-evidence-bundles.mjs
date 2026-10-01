#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const REQUIRED_ACK = "I_ACCEPT_VERIFIED_EVIDENCE_COLD_DELETE";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const rowHash = (row) => sha256(Buffer.from(JSON.stringify(row)));

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
      rowHash(member.row) !== item.row_sha256 || rowHash(item.row_json) !== item.row_sha256 ||
      JSON.stringify(member.row) !== JSON.stringify(item.row_json)
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

async function rollback(items, insertedBridges) {
  const { data, error } = await db.rpc("geomacro_restore_verified_structured_evidence", {
    p_items: items.map(({ event_id, fingerprint, source_key, bundle_key, bundle_sha256, row_sha256 }) => ({
      event_id, fingerprint, source_key, bundle_key, bundle_sha256, row_sha256,
    })),
    p_inserted_bridges: insertedBridges,
  });
  if (error || Number(data) !== items.length) {
    throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_FAILED_${error?.code ?? "count"}`);
  }
  if (await countPresent(items) !== items.length) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_VERIFY_FAILED");
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

  const rpcItems = candidates.map(({ event_id, fingerprint, source_key, bundle_key, bundle_sha256, row_sha256 }) => ({
    event_id, fingerprint, source_key, bundle_key, bundle_sha256, row_sha256,
  }));
  let sourceDeleted = false;
  let insertedBridges = [];

  try {
    const { data: deleted, error: deleteError } = await db.rpc("geomacro_delete_verified_structured_evidence", {
      p_items: rpcItems,
    });
    if (deleteError || Number(deleted?.deleted) !== candidates.length || deleted?.rights_unchanged !== true || !Array.isArray(deleted?.inserted_bridges)) {
      throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_DELETE_FAILED_${deleteError?.code ?? "count"}`);
    }
    sourceDeleted = true;
    insertedBridges = deleted.inserted_bridges;

    if (await countPresent(candidates) !== 0) throw new Error("STRUCTURED_EVIDENCE_PHASE_B_SOURCE_STILL_PRESENT");

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
      rollback_copy_retained_until_finalize: true,
      verified_at: new Date().toISOString(),
      members: candidates.map(({ event_id, fingerprint, source_key, row_sha256 }) => ({ event_id, fingerprint, source_key, row_sha256 })),
    })));

    const { data: finalized, error: finalizeError } = await db.rpc("geomacro_finalize_verified_structured_evidence", {
      p_items: rpcItems,
    });
    if (finalizeError || Number(finalized) !== candidates.length) {
      throw new Error(`STRUCTURED_EVIDENCE_PHASE_B_FINALIZE_FAILED_${finalizeError?.code ?? "count"}`);
    }

    totalDeleted += candidates.length;
    console.log(JSON.stringify({
      ok: true,
      status: "progress",
      deleted: candidates.length,
      total_deleted: totalDeleted,
      bundle_key: bundleKey,
      full_b2_readback_verified_before_delete: true,
      full_b2_readback_verified_after_delete: true,
      rights_unchanged: true,
      archive_index_compacted_after_verification: true,
      b2: b2.usage(),
    }));
    sourceDeleted = false;
  } catch (cause) {
    if (sourceDeleted) {
      try {
        await rollback(rpcItems, insertedBridges);
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
