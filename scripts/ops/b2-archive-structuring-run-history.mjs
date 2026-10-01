#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const TERMINAL = new Set(["empty", "succeeded", "failed"]);
const MAX_RAW_BYTES = 8_000_000;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const olderHours = Number(process.env.STRUCTURING_RUN_ARCHIVE_OLDER_HOURS ?? 72);
const limit = Number(process.env.STRUCTURING_RUN_ARCHIVE_LIMIT ?? 500);
if (
  url !== PROJECT_URL || !role ||
  !Number.isInteger(olderHours) || olderHours < 72 || olderHours > 24 * 3650 ||
  !Number.isInteger(limit) || limit < 1 || limit > 500
) throw new Error("STRUCTURING_RUN_ARCHIVE_CONFIG_INVALID");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
const stableJson = (value) => JSON.stringify(stable(value));
const rowHash = (row) => sha256(Buffer.from(stableJson(row)));
const cutoff = new Date(Date.now() - olderHours * 3_600_000).toISOString();

function assertRow(row) {
  if (!/^[0-9a-f-]{36}$/i.test(String(row?.id ?? "")) ||
      !TERMINAL.has(String(row?.status ?? "")) ||
      !row?.finished_at || Date.parse(row.finished_at) >= Date.parse(cutoff)) {
    throw new Error("STRUCTURING_RUN_ARCHIVE_ROW_INVALID");
  }
}

function verifyBundle(bytes, expectedSha, expected) {
  if (sha256(bytes) !== expectedSha) throw new Error("STRUCTURING_RUN_ARCHIVE_READBACK_HASH_INVALID");
  let envelope;
  try { envelope = JSON.parse(gunzipSync(bytes).toString("utf8")); }
  catch { throw new Error("STRUCTURING_RUN_ARCHIVE_RESTORE_INVALID"); }
  if (envelope?.schema !== "geomacro.structuring-run-history-bundle.v1" ||
      !Array.isArray(envelope?.members) || envelope.members.length !== expected.length) {
    throw new Error("STRUCTURING_RUN_ARCHIVE_RESTORE_INVALID");
  }
  const wanted = new Map(expected.map((item) => [item.id, item.row_sha256]));
  const seen = new Set();
  for (const member of envelope.members) {
    const id = String(member?.row?.id ?? "");
    if (!wanted.has(id) || seen.has(id) || member?.row_sha256 !== wanted.get(id) || rowHash(member.row) !== wanted.get(id)) {
      throw new Error("STRUCTURING_RUN_ARCHIVE_MEMBER_INVALID");
    }
    seen.add(id);
  }
  if (seen.size !== expected.length) throw new Error("STRUCTURING_RUN_ARCHIVE_MEMBER_INVALID");
  return envelope;
}

async function readByIds(ids) {
  const all = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const { data, error } = await db.from("live_structuring_runs").select("*").in("id", chunk);
    if (error) throw new Error(`STRUCTURING_RUN_ARCHIVE_RECHECK_FAILED_${error.code ?? "unknown"}`);
    all.push(...(data ?? []));
  }
  return all;
}

async function restoreDeleted(rows) {
  if (!rows.length) return;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const chunk = rows.slice(offset, offset + 100);
    const { error } = await db.from("live_structuring_runs").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`STRUCTURING_RUN_ARCHIVE_ROLLBACK_WRITE_FAILED_${error.code ?? "unknown"}`);
  }
  const expected = new Map(rows.map((row) => [row.id, rowHash(row)]));
  const restored = await readByIds(rows.map((row) => row.id));
  if (restored.length !== rows.length || restored.some((row) => expected.get(row.id) !== rowHash(row))) {
    throw new Error("STRUCTURING_RUN_ARCHIVE_ROLLBACK_VERIFY_FAILED");
  }
}

const { data: rows, error: queryError } = await db.from("live_structuring_runs")
  .select("*")
  .in("status", [...TERMINAL])
  .not("finished_at", "is", null)
  .lt("finished_at", cutoff)
  .order("finished_at", { ascending: true })
  .order("id", { ascending: true })
  .limit(limit);
if (queryError) throw new Error(`STRUCTURING_RUN_ARCHIVE_QUERY_FAILED_${queryError.code ?? "unknown"}: ${queryError.message ?? "unknown"}`);

if (!(rows ?? []).length) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0, cutoff, older_hours: olderHours, limit, b2: b2.usage() }));
  process.exit(0);
}

for (const row of rows) assertRow(row);
const members = rows.map((row) => ({ id: row.id, row_sha256: rowHash(row), row }));
const envelope = { schema: "geomacro.structuring-run-history-bundle.v1", created_at: new Date().toISOString(), cutoff, members };
const raw = Buffer.from(JSON.stringify(envelope));
if (raw.length > MAX_RAW_BYTES) throw new Error("STRUCTURING_RUN_ARCHIVE_BUNDLE_TOO_LARGE");
const compressed = gzipSync(raw, { level: 9 });
const bundleSha = sha256(compressed);
const day = new Date().toISOString().slice(0, 10);
const bundleKey = `geomacro-evidence/v1/structuring-run-history/${day}/${bundleSha}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/structuring-run-history/${bundleSha}.proof.json`;

await b2.put(bundleKey, compressed);
const firstReadback = await b2.get(bundleKey);
verifyBundle(firstReadback, bundleSha, members);
const proof = {
  schema: "geomacro.structuring-run-history-bundle-proof.v1",
  archive_bucket: ARCHIVE_BUCKET,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  row_count: members.length,
  member_hashes: Object.fromEntries(members.map((item) => [item.id, item.row_sha256])),
  full_b2_readback_verified_before_delete: true,
  json_restore_verified_before_delete: true,
  verified_at: new Date().toISOString(),
};
const proofBytes = Buffer.from(JSON.stringify(proof));
await b2.put(proofKey, proofBytes);
if (sha256(await b2.get(proofKey)) !== sha256(proofBytes)) throw new Error("STRUCTURING_RUN_ARCHIVE_PROOF_READBACK_FAILED");

const rechecked = await readByIds(rows.map((row) => row.id));
const expectedHashes = new Map(members.map((item) => [item.id, item.row_sha256]));
if (rechecked.length !== rows.length) throw new Error("STRUCTURING_RUN_ARCHIVE_SOURCE_CHANGED");
for (const row of rechecked) {
  assertRow(row);
  if (expectedHashes.get(row.id) !== rowHash(row)) throw new Error("STRUCTURING_RUN_ARCHIVE_SOURCE_CHANGED");
}

const deletedRows = [];
let mutationStarted = false;
try {
  for (let offset = 0; offset < rows.length; offset += 100) {
    const chunkIds = rows.slice(offset, offset + 100).map((row) => row.id);
    mutationStarted = true;
    const { data: deleted, error: deleteError } = await db.from("live_structuring_runs")
      .delete().in("id", chunkIds).select("*");
    if (deleteError || (deleted ?? []).length !== chunkIds.length) {
      throw new Error(`STRUCTURING_RUN_ARCHIVE_DELETE_FAILED_${deleteError?.code ?? "count"}`);
    }
    for (const row of deleted ?? []) {
      deletedRows.push(row);
      if (expectedHashes.get(row.id) !== rowHash(row)) throw new Error("STRUCTURING_RUN_ARCHIVE_DELETE_ROW_MISMATCH");
    }
  }

  const residual = await readByIds(rows.map((row) => row.id));
  if (residual.length !== 0) throw new Error("STRUCTURING_RUN_ARCHIVE_SOURCE_STILL_PRESENT");

  const secondReadback = await b2.get(bundleKey);
  verifyBundle(secondReadback, bundleSha, members);

  const deletionProofKey = `geomacro-evidence/v1/index/structuring-run-history-deleted/${bundleSha}.json`;
  const deletionProof = {
    schema: "geomacro.structuring-run-history-source-deletion.v1",
    archive_bucket: ARCHIVE_BUCKET,
    bundle_key: bundleKey,
    archive_proof_key: proofKey,
    bundle_sha256: bundleSha,
    deleted_row_count: deletedRows.length,
    member_hashes: proof.member_hashes,
    full_b2_readback_verified_after_delete: true,
    deleted_at: new Date().toISOString(),
  };
  const deletionBytes = Buffer.from(JSON.stringify(deletionProof));
  await b2.put(deletionProofKey, deletionBytes);
  if (sha256(await b2.get(deletionProofKey)) !== sha256(deletionBytes)) {
    throw new Error("STRUCTURING_RUN_ARCHIVE_DELETION_PROOF_READBACK_FAILED");
  }

  console.log(JSON.stringify({
    ok: true,
    status: "progress",
    processed: deletedRows.length,
    source_rows_deleted: deletedRows.length,
    source_rows_noncanonical_operational_history: true,
    full_b2_readback_verified_before_delete: true,
    full_b2_readback_verified_after_delete: true,
    json_restore_verified: true,
    exact_source_recheck_verified: true,
    rollback_available: true,
    bundle_key: bundleKey,
    bundle_sha256: bundleSha,
    deletion_proof_key: deletionProofKey,
    cutoff,
    b2: b2.usage(),
  }));
} catch (cause) {
  if (mutationStarted) {
    try { await restoreDeleted(deletedRows); }
    catch (rollbackCause) {
      throw new Error("STRUCTURING_RUN_ARCHIVE_ROLLBACK_FATAL", { cause: rollbackCause });
    }
  }
  throw cause;
}
