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
const olderDays = Number(process.env.STRUCTURED_EVIDENCE_DELETE_OLDER_DAYS ?? 7);

if (
  url !== PROJECT_URL ||
  !role ||
  !Number.isInteger(olderDays) ||
  olderDays < 7 ||
  olderDays > 3650
) {
  throw new Error("STRUCTURED_EVIDENCE_DELETE_CONFIG_INVALID");
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

const EVIDENCE_COLUMNS = "event_id,fingerprint,fragment_id,fragment_ordinal,source_domain,source_url,evidence_title,evidence_published_at,country_iso3,country_confidence,country_method,created_at";
const normalizeList = (value) => Array.isArray(value) ? [...value].map(String).sort() : [];
const stableRights = (value) => ({
  event_status: String(value?.event_status ?? ""),
  event_reasons: normalizeList(value?.event_reasons),
  evaluated_status: String(value?.evaluated_status ?? ""),
  evaluated_reasons: normalizeList(value?.evaluated_reasons),
  source_keys: normalizeList(value?.source_keys),
});
const sameRights = (a, b) => JSON.stringify(stableRights(a)) === JSON.stringify(stableRights(b));

async function readRights(eventId) {
  const [eventResult, rightsResult] = await Promise.all([
    db
      .from("live_structured_events")
      .select("id,commercial_eligibility_status,commercial_eligibility_reason_codes")
      .eq("id", eventId)
      .single(),
    db
      .from("live_structured_event_commercial_rights_evaluation")
      .select("event_id,evaluated_status,reason_codes,source_keys")
      .eq("event_id", eventId)
      .single(),
  ]);
  if (eventResult.error || rightsResult.error) {
    throw new Error("STRUCTURED_EVIDENCE_RIGHTS_READ_FAILED");
  }
  return stableRights({
    event_status: eventResult.data.commercial_eligibility_status,
    event_reasons: eventResult.data.commercial_eligibility_reason_codes,
    evaluated_status: rightsResult.data.evaluated_status,
    evaluated_reasons: rightsResult.data.reason_codes,
    source_keys: rightsResult.data.source_keys,
  });
}

async function restoreArchive(pointer, eventId, fingerprint) {
  const readback = await b2.get(pointer.archiveKey);
  if (readback.length !== pointer.compressedLength || sha256(readback) !== pointer.archiveSha256) {
    throw new Error("STRUCTURED_EVIDENCE_DELETE_READBACK_HASH_INVALID");
  }
  const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  if (
    restored?.schema !== "geomacro.structured-event-evidence-archive.v1" ||
    restored?.row?.event_id !== eventId ||
    restored?.row?.fingerprint !== fingerprint ||
    sha256(Buffer.from(JSON.stringify(restored))) !== pointer.envelopeSha256 ||
    sha256(Buffer.from(JSON.stringify(restored.row))) !== pointer.sourceRowSha256
  ) {
    throw new Error("STRUCTURED_EVIDENCE_DELETE_RESTORE_INVALID");
  }
  return restored.row;
}

const cutoff = new Date(Date.now() - olderDays * 86_400_000).toISOString();
const { data: parentRows, error: parentError } = await db
  .from("live_structured_events")
  .select("id,last_seen_at,structured_payload")
  .lt("last_seen_at", cutoff)
  .order("last_seen_at", { ascending: true })
  .limit(100);
if (parentError) throw new Error(`STRUCTURED_EVIDENCE_DELETE_PARENT_QUERY_FAILED_${parentError.code ?? "unknown"}`);

const eligibleParentIds = (parentRows ?? [])
  .filter((row) => row?.structured_payload?._archive?.v === 2)
  .map((row) => row.id)
  .filter(Boolean);
if (!eligibleParentIds.length) {
  console.log(JSON.stringify({ ok: true, status: "no_candidate", deleted: 0, older_days: olderDays }));
  process.exit(0);
}

const { data: evidenceRows, error: evidenceError } = await db
  .from("live_structured_event_evidence")
  .select(EVIDENCE_COLUMNS)
  .in("event_id", eligibleParentIds)
  .lt("created_at", cutoff)
  .order("created_at", { ascending: true })
  .limit(1);
if (evidenceError) throw new Error(`STRUCTURED_EVIDENCE_DELETE_QUERY_FAILED_${evidenceError.code ?? "unknown"}`);

const row = evidenceRows?.[0];
if (!row) {
  console.log(JSON.stringify({ ok: true, status: "no_candidate", deleted: 0, older_days: olderDays }));
  process.exit(0);
}
if (
  !/^[0-9a-f-]{36}$/i.test(String(row.event_id ?? "")) ||
  !/^[0-9a-f]{64}$/i.test(String(row.fingerprint ?? "")) ||
  !/^[0-9a-f-]{36}$/i.test(String(row.fragment_id ?? "")) ||
  Date.now() - Date.parse(row.created_at) < olderDays * 86_400_000
) {
  throw new Error("STRUCTURED_EVIDENCE_DELETE_SOURCE_INVALID");
}

const { data: fragment, error: fragmentError } = await db
  .from("live_fragment_manifest")
  .select("id,source_key")
  .eq("id", row.fragment_id)
  .single();
if (fragmentError || fragment?.id !== row.fragment_id || !String(fragment?.source_key ?? "").trim()) {
  throw new Error("STRUCTURED_EVIDENCE_DELETE_SOURCE_KEY_UNRESOLVED");
}
const sourceKey = String(fragment.source_key).trim();

// Fail closed if the rights-preservation migration has not reached production.
const { data: existingBridge, error: bridgeReadError } = await db
  .from("live_structured_event_archived_sources")
  .select("event_id,source_key,last_verified_at")
  .eq("event_id", row.event_id)
  .eq("source_key", sourceKey)
  .maybeSingle();
if (bridgeReadError) throw new Error("STRUCTURED_EVIDENCE_DELETE_RIGHTS_BRIDGE_UNAVAILABLE");
const bridgeExistedBefore = Boolean(existingBridge);

const beforeRights = await readRights(row.event_id);
if (!beforeRights.source_keys.includes(sourceKey)) {
  throw new Error("STRUCTURED_EVIDENCE_DELETE_SOURCE_KEY_NOT_IN_RIGHTS_GRAPH");
}

const envelope = {
  schema: "geomacro.structured-event-evidence-archive.v1",
  source_table: "public.live_structured_event_evidence",
  row,
};
const raw = Buffer.from(JSON.stringify(envelope));
if (raw.length > 1_000_000) throw new Error("STRUCTURED_EVIDENCE_DELETE_ARCHIVE_TOO_LARGE");
const compressed = gzipSync(raw, { level: 9 });
const rowKey = `${row.event_id}/${row.fingerprint}`;
const archiveKey = `geomacro-evidence/v1/structured-event-evidence/${rowKey}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/structured-event-evidence/${rowKey}.cleanup.json`;
const pointer = {
  archiveKey,
  archiveSha256: sha256(compressed),
  compressedLength: compressed.length,
  envelopeSha256: sha256(raw),
  sourceRowSha256: sha256(Buffer.from(JSON.stringify(row))),
};

await b2.put(archiveKey, compressed);
await restoreArchive(pointer, row.event_id, row.fingerprint);

// Source must still be byte-identical immediately before any control-plane or
// destructive mutation.
const { data: current, error: currentError } = await db
  .from("live_structured_event_evidence")
  .select(EVIDENCE_COLUMNS)
  .eq("event_id", row.event_id)
  .eq("fingerprint", row.fingerprint)
  .single();
if (currentError || sha256(Buffer.from(JSON.stringify(current))) !== pointer.sourceRowSha256) {
  throw new Error("STRUCTURED_EVIDENCE_DELETE_SOURCE_CHANGED");
}

let bridgeInserted = false;
let sourceDeleted = false;
try {
  const { error: bridgeUpsertError } = await db
    .from("live_structured_event_archived_sources")
    .upsert({
      event_id: row.event_id,
      source_key: sourceKey,
      last_verified_at: new Date().toISOString(),
    }, { onConflict: "event_id,source_key" });
  if (bridgeUpsertError) throw new Error("STRUCTURED_EVIDENCE_DELETE_RIGHTS_BRIDGE_WRITE_FAILED");
  bridgeInserted = !bridgeExistedBefore;

  const afterBridgeRights = await readRights(row.event_id);
  if (!sameRights(beforeRights, afterBridgeRights)) {
    throw new Error("STRUCTURED_EVIDENCE_DELETE_RIGHTS_CHANGED_AFTER_BRIDGE");
  }

  const { data: deletedRows, error: deleteError } = await db
    .from("live_structured_event_evidence")
    .delete()
    .eq("event_id", row.event_id)
    .eq("fingerprint", row.fingerprint)
    .select(EVIDENCE_COLUMNS);
  if (deleteError || deletedRows?.length !== 1) {
    throw new Error("STRUCTURED_EVIDENCE_DELETE_UNCONFIRMED");
  }
  if (sha256(Buffer.from(JSON.stringify(deletedRows[0]))) !== pointer.sourceRowSha256) {
    throw new Error("STRUCTURED_EVIDENCE_DELETE_RETURNED_ROW_MISMATCH");
  }
  sourceDeleted = true;

  const { data: absent, error: absentError } = await db
    .from("live_structured_event_evidence")
    .select("event_id,fingerprint")
    .eq("event_id", row.event_id)
    .eq("fingerprint", row.fingerprint)
    .maybeSingle();
  if (absentError || absent) throw new Error("STRUCTURED_EVIDENCE_DELETE_SOURCE_STILL_PRESENT");

  await restoreArchive(pointer, row.event_id, row.fingerprint);
  const afterDeleteRights = await readRights(row.event_id);
  if (!sameRights(beforeRights, afterDeleteRights)) {
    throw new Error("STRUCTURED_EVIDENCE_DELETE_RIGHTS_CHANGED_AFTER_DELETE");
  }

  const proof = {
    schema: "geomacro.structured-event-evidence-cleanup-proof.v1",
    event_id: row.event_id,
    fingerprint: row.fingerprint,
    fragment_id: row.fragment_id,
    source_key: sourceKey,
    archive_bucket: ARCHIVE_BUCKET,
    archive_key: archiveKey,
    archive_sha256: pointer.archiveSha256,
    source_row_sha256: pointer.sourceRowSha256,
    full_b2_readback_verified: true,
    json_restore_verified: true,
    archived_source_rights_preserved: true,
    source_row_deleted: true,
    rollback_performed: false,
    verified_at: new Date().toISOString(),
  };
  await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

  console.log(JSON.stringify({
    ok: true,
    deleted: 1,
    event_id: row.event_id,
    fingerprint: row.fingerprint,
    fragment_id: row.fragment_id,
    source_key: sourceKey,
    archive_key: archiveKey,
    archive_sha256: pointer.archiveSha256,
    source_row_sha256: pointer.sourceRowSha256,
    full_b2_readback_verified: true,
    json_restore_verified: true,
    archived_source_rights_preserved: true,
    source_row_deleted: true,
    rollback_performed: false,
    older_days: olderDays,
  }));
} catch (cause) {
  let rollbackFailure = null;
  try {
    if (sourceDeleted) {
      const { error: restoreError } = await db
        .from("live_structured_event_evidence")
        .insert(row);
      if (restoreError) throw new Error("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_SOURCE_RESTORE_FAILED");
    }

    if (bridgeInserted) {
      const { error: bridgeDeleteError } = await db
        .from("live_structured_event_archived_sources")
        .delete()
        .eq("event_id", row.event_id)
        .eq("source_key", sourceKey);
      if (bridgeDeleteError) throw new Error("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_BRIDGE_REMOVE_FAILED");
    }

    const { data: restoredSource, error: restoredSourceError } = await db
      .from("live_structured_event_evidence")
      .select(EVIDENCE_COLUMNS)
      .eq("event_id", row.event_id)
      .eq("fingerprint", row.fingerprint)
      .single();
    if (
      restoredSourceError ||
      sha256(Buffer.from(JSON.stringify(restoredSource))) !== pointer.sourceRowSha256
    ) {
      throw new Error("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_SOURCE_VERIFY_FAILED");
    }
    const rollbackRights = await readRights(row.event_id);
    if (!sameRights(beforeRights, rollbackRights)) {
      throw new Error("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_RIGHTS_VERIFY_FAILED");
    }
  } catch (rollbackCause) {
    rollbackFailure = rollbackCause;
  }

  if (rollbackFailure) {
    throw new Error("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_FAILED", { cause: rollbackFailure });
  }
  throw cause;
}
