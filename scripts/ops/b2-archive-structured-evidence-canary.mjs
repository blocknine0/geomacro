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
const olderDays = Number(process.env.STRUCTURED_EVIDENCE_ARCHIVE_OLDER_DAYS ?? 7);

if (
  url !== PROJECT_URL ||
  !role ||
  !Number.isInteger(olderDays) ||
  olderDays < 7 ||
  olderDays > 3650
) {
  throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_CONFIG_INVALID");
}

const db = createClient(url, role, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

const cutoff = new Date(Date.now() - olderDays * 86_400_000).toISOString();
const { data: parentRows, error: parentError } = await db
  .from("live_structured_events")
  .select("id,last_seen_at,structured_payload")
  .lt("last_seen_at", cutoff)
  .order("last_seen_at", { ascending: true })
  .limit(100);
if (parentError) throw new Error(`STRUCTURED_EVIDENCE_PARENT_QUERY_FAILED_${parentError.code ?? "unknown"}`);

const eligibleParentIds = (parentRows ?? [])
  .filter((row) => row?.structured_payload?._archive?.v === 2)
  .map((row) => row.id)
  .filter(Boolean);
if (!eligibleParentIds.length) {
  console.log(JSON.stringify({ ok: true, status: "no_candidate", archived: 0, older_days: olderDays }));
  process.exit(0);
}

const { data: evidenceRows, error: evidenceError } = await db
  .from("live_structured_event_evidence")
  .select("event_id,fingerprint,fragment_id,fragment_ordinal,source_domain,source_url,evidence_title,evidence_published_at,country_iso3,country_confidence,country_method,created_at")
  .in("event_id", eligibleParentIds)
  .lt("created_at", cutoff)
  .order("created_at", { ascending: true })
  .limit(1);
if (evidenceError) throw new Error(`STRUCTURED_EVIDENCE_QUERY_FAILED_${evidenceError.code ?? "unknown"}`);

const row = evidenceRows?.[0];
if (!row) {
  console.log(JSON.stringify({ ok: true, status: "no_candidate", archived: 0, older_days: olderDays }));
  process.exit(0);
}
if (
  !/^[0-9a-f-]{36}$/i.test(String(row.event_id ?? "")) ||
  !/^[0-9a-f]{64}$/i.test(String(row.fingerprint ?? "")) ||
  !/^[0-9a-f-]{36}$/i.test(String(row.fragment_id ?? "")) ||
  Date.now() - Date.parse(row.created_at) < olderDays * 86_400_000
) {
  throw new Error("STRUCTURED_EVIDENCE_SOURCE_INVALID");
}

const envelope = {
  schema: "geomacro.structured-event-evidence-archive.v1",
  source_table: "public.live_structured_event_evidence",
  row,
};
const raw = Buffer.from(JSON.stringify(envelope));
if (raw.length > 1_000_000) throw new Error("STRUCTURED_EVIDENCE_ARCHIVE_TOO_LARGE");
const compressed = gzipSync(raw, { level: 9 });
const rowKey = `${row.event_id}/${row.fingerprint}`;
const archiveKey = `geomacro-evidence/v1/structured-event-evidence/${rowKey}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/structured-event-evidence/${rowKey}.json`;

await b2.put(archiveKey, compressed);
const readback = await b2.get(archiveKey);
if (readback.length !== compressed.length || sha256(readback) !== sha256(compressed)) {
  throw new Error("STRUCTURED_EVIDENCE_READBACK_HASH_INVALID");
}
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (
  restored?.schema !== envelope.schema ||
  sha256(Buffer.from(JSON.stringify(restored))) !== sha256(raw) ||
  restored?.row?.event_id !== row.event_id ||
  restored?.row?.fingerprint !== row.fingerprint
) {
  throw new Error("STRUCTURED_EVIDENCE_RESTORE_INVALID");
}

const proof = {
  schema: "geomacro.structured-event-evidence-archive-proof.v1",
  event_id: row.event_id,
  fingerprint: row.fingerprint,
  fragment_id: row.fragment_id,
  archive_bucket: ARCHIVE_BUCKET,
  archive_key: archiveKey,
  source_row_sha256: sha256(Buffer.from(JSON.stringify(row))),
  archive_sha256: sha256(compressed),
  full_b2_readback_verified: true,
  json_restore_verified: true,
  destructive_cleanup_performed: false,
  verified_at: new Date().toISOString(),
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

const { data: current, error: currentError } = await db
  .from("live_structured_event_evidence")
  .select("event_id,fingerprint,fragment_id,fragment_ordinal,source_domain,source_url,evidence_title,evidence_published_at,country_iso3,country_confidence,country_method,created_at")
  .eq("event_id", row.event_id)
  .eq("fingerprint", row.fingerprint)
  .single();
if (
  currentError ||
  sha256(Buffer.from(JSON.stringify(current))) !== proof.source_row_sha256
) {
  throw new Error("STRUCTURED_EVIDENCE_SOURCE_CHANGED");
}

console.log(JSON.stringify({
  ok: true,
  archived: 1,
  event_id: row.event_id,
  fingerprint: row.fingerprint,
  fragment_id: row.fragment_id,
  archive_key: archiveKey,
  archive_sha256: proof.archive_sha256,
  source_row_sha256: proof.source_row_sha256,
  full_b2_readback_verified: true,
  json_restore_verified: true,
  source_row_retained: true,
  destructive_cleanup_performed: false,
  older_days: olderDays,
}));
