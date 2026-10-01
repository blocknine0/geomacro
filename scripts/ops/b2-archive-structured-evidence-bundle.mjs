#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const MAX_BUNDLE_RAW_BYTES = 12_000_000;
const MAX_BUNDLE_COMPRESSED_BYTES = 6_000_000;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const olderDays = Number(process.env.STRUCTURED_EVIDENCE_ARCHIVE_OLDER_DAYS ?? 7);
const limit = Number(process.env.STRUCTURED_EVIDENCE_ARCHIVE_LIMIT ?? 100);
if (
  url !== PROJECT_URL || !role || !Number.isInteger(olderDays) || olderDays < 7 || olderDays > 3650 ||
  !Number.isInteger(limit) || limit < 1 || limit > 1000
) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_CONFIG_INVALID");

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

const rowHash = (row) => sha256(Buffer.from(JSON.stringify(row)));

function verifyBundle(readback, expectedSha, expectedMembers) {
  if (readback.length > MAX_BUNDLE_COMPRESSED_BYTES || sha256(readback) !== expectedSha) {
    throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_READBACK_HASH_INVALID");
  }
  let restored;
  try {
    restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  } catch {
    throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_RESTORE_INVALID");
  }
  if (
    restored?.schema !== "geomacro.structured-event-evidence-bundle.v1" ||
    !Array.isArray(restored.members) || restored.members.length !== expectedMembers.length
  ) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_RESTORE_INVALID");

  const expected = new Map(expectedMembers.map((m) => [`${m.event_id}:${m.fingerprint}`, m]));
  const seen = new Set();
  for (const member of restored.members) {
    const key = `${member?.event_id ?? ""}:${member?.fingerprint ?? ""}`;
    const wanted = expected.get(key);
    if (!wanted || seen.has(key)) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_MEMBER_INVALID");
    seen.add(key);
    if (
      member.source_key !== wanted.source_key || member.row_sha256 !== wanted.row_sha256 ||
      !member.row || typeof member.row !== "object" || Array.isArray(member.row) ||
      rowHash(member.row) !== wanted.row_sha256
    ) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_MEMBER_HASH_INVALID");
  }
  if (seen.size !== expectedMembers.length) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_MEMBER_INVALID");
}

const { data: candidates, error: candidateError } = await db.rpc("geomacro_structured_evidence_archive_candidates", {
  p_older_days: olderDays,
  p_limit: limit,
});
if (candidateError) throw new Error(`STRUCTURED_EVIDENCE_ARCHIVE_QUERY_FAILED_${candidateError.code ?? "unknown"}`);
if (!candidates?.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", archived: 0, older_days: olderDays, limit, b2: b2.usage() }));
  process.exit(0);
}

const members = [];
for (const candidate of candidates) {
  const row = candidate?.row_json;
  if (
    !/^[0-9a-f-]{36}$/i.test(String(candidate?.event_id ?? "")) ||
    !/^[0-9a-f]{64}$/i.test(String(candidate?.fingerprint ?? "")) ||
    !String(candidate?.source_key ?? "").trim() ||
    !row || typeof row !== "object" || Array.isArray(row)
  ) continue;
  const member = {
    event_id: candidate.event_id,
    fingerprint: candidate.fingerprint,
    source_key: String(candidate.source_key).trim(),
    row_sha256: rowHash(row),
    row,
  };
  const projected = Buffer.byteLength(JSON.stringify({
    schema: "geomacro.structured-event-evidence-bundle.v1",
    created_at: new Date(0).toISOString(),
    members: [...members, member],
  }));
  if (projected > MAX_BUNDLE_RAW_BYTES) break;
  members.push(member);
}
if (!members.length) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_NO_VALID_CANDIDATES");

const envelope = {
  schema: "geomacro.structured-event-evidence-bundle.v1",
  created_at: new Date().toISOString(),
  source_table: "public.live_structured_event_evidence",
  members,
};
const raw = Buffer.from(JSON.stringify(envelope));
if (raw.length > MAX_BUNDLE_RAW_BYTES) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_TOO_LARGE");
const compressed = gzipSync(raw, { level: 9 });
if (compressed.length > MAX_BUNDLE_COMPRESSED_BYTES) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_COMPRESSED_TOO_LARGE");
const bundleSha = sha256(compressed);
const day = new Date().toISOString().slice(0, 10);
const bundleKey = `geomacro-evidence/v1/structured-event-evidence-bundles/${day}/${bundleSha}.json.gz`;
const preflightKey = `geomacro-evidence/v1/health/evidence-read-preflight/${day}/${bundleSha}.missing`;
const proofKey = `geomacro-evidence/v1/index/structured-event-evidence-bundles/${bundleSha}.archive-proof.json`;

const preflight = await b2.getOptional(preflightKey);
if (preflight !== null) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_READ_PREFLIGHT_COLLISION");
await b2.put(bundleKey, compressed);
const firstReadback = await b2.get(bundleKey);
verifyBundle(firstReadback, bundleSha, members);

const verifiedAt = new Date().toISOString();
const indexRows = members.map((m) => ({
  event_id: m.event_id,
  fingerprint: m.fingerprint,
  source_key: m.source_key,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  row_sha256: m.row_sha256,
  row_json: m.row,
  verified_at: verifiedAt,
}));
const { error: indexError } = await db.from("live_structured_event_evidence_archive_index").upsert(indexRows, {
  onConflict: "event_id,fingerprint",
  ignoreDuplicates: false,
});
if (indexError) throw new Error(`STRUCTURED_EVIDENCE_ARCHIVE_INDEX_FAILED_${indexError.code ?? "unknown"}`);

const secondReadback = await b2.get(bundleKey);
verifyBundle(secondReadback, bundleSha, members);
const proof = {
  schema: "geomacro.structured-event-evidence-archive-proof.v1",
  archive_bucket: ARCHIVE_BUCKET,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_compressed_bytes: compressed.length,
  bundle_raw_bytes: raw.length,
  archived_member_count: members.length,
  member_row_hashes: Object.fromEntries(members.map((m) => [`${m.event_id}:${m.fingerprint}`, m.row_sha256])),
  pre_write_b2_read_preflight_verified: true,
  full_b2_readback_verified_before_index: true,
  full_b2_readback_verified_after_index: true,
  json_restore_verified: true,
  source_rows_retained: true,
  verified_at: verifiedAt,
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));
console.log(JSON.stringify({
  ...proof,
  ok: true,
  status: "progress",
  archived: members.length,
  older_days: olderDays,
  limit,
  b2: b2.usage(),
}));
