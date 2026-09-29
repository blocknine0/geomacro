#!/usr/bin/env bun
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { canonicalRiskObjectJson, verifyRiskObjectSignature, type RiskObjectVerificationKeys } from "../../src/lib/risk-object-signing.server";

const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_READ_STATUSES = new Set([429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const MAX_COMPRESSED_BYTES = 18_000_000;
const MAX_RAW_BUNDLE_BYTES = 40_000_000;

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
let signingKeyId = String(process.env.RISK_OBJECT_SIGNING_KEY_ID ?? "").trim();
const allSigningKeys = process.env.GRO_ARCHIVE_ALL_KEYS === "true";
const suffix = String(process.env.GRO_ARCHIVE_SUFFIX ?? "").trim().toLowerCase();
const limit = Number(process.env.GRO_BUNDLE_LIMIT ?? 50);
if (url !== "https://ldpwajisioljyjtojvfx.supabase.co" || !role || (!allSigningKeys && !signingKeyId) ||
    !/^[0-9a-f]$/.test(suffix) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
  throw new Error("GRO_BUNDLE_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID, secretKey: process.env.B2_APPLICATION_KEY,
  bucket: "geomacro-private-archive" });

// Trust only keys published by the production registry. Historical keys that
// are absent or revoked remain untouched; never derive authority from a
// payload's embedded public key.
const keyResponse = await fetch("https://geomacro.live/api/risk-object-keys", { signal: AbortSignal.timeout(15_000) });
if (!keyResponse.ok) throw new Error("GRO_BUNDLE_KEYS_UNAVAILABLE");
const keyBody = await keyResponse.json() as { keys?: Array<{ key_id: string; public_key_spki_b64: string; status: "active" | "retired" | "revoked"; not_before?: string | null; not_after?: string | null }> };
const keys: RiskObjectVerificationKeys = Object.fromEntries((keyBody.keys ?? []).map(({ key_id, ...record }) => [key_id, record]));

// In all-keys mode, pick the oldest eligible object whose key is actually
// published and not revoked. Unpublished historical rows remain intact.
if (allSigningKeys) {
  const publishedIds = (keyBody.keys ?? []).filter((key) => key.status !== "revoked").map((key) => key.key_id);
  if (!publishedIds.length) {
    console.log(JSON.stringify({ ok: true, status: "complete", processed: 0, shard_suffix: suffix, reason: "no_published_signing_keys" }));
    process.exit(0);
  }
  const { data: next, error: nextError } = await db.from("geomacro_risk_objects")
    .select("signing_key_id")
    .is("archive_key", null)
    .not("payload", "is", null)
    .not("signature", "is", null)
    .lt("expires_at", new Date(Date.now() - 6 * 3_600_000).toISOString())
    .like("object_id", `%${suffix}`)
    .in("signing_key_id", publishedIds)
    .order("generated_at", { ascending: true })
    .limit(1);
  if (nextError) throw nextError;
  if (!next?.length) {
    console.log(JSON.stringify({ ok: true, status: "complete", processed: 0, shard_suffix: suffix, reason: "no_eligible_published_key" }));
    process.exit(0);
  }
  signingKeyId = String(next[0].signing_key_id ?? "");
  if (!signingKeyId) throw new Error("GRO_BUNDLE_SIGNING_KEY_MISSING");
}
if (!keys[signingKeyId]) throw new Error("GRO_BUNDLE_ACTIVE_KEY_NOT_PUBLISHED");

const { data: candidates, error } = await db.rpc("geomacro_next_gro_archive_candidates", {
  p_suffix: suffix, p_signing_key_id: signingKeyId, p_limit: limit,
});
if (error) throw error;
if (!candidates?.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0, shard_suffix: suffix }));
  process.exit(0);
}

const selected: Array<any> = [];
let rawBundleBytes = 0;
for (const row of candidates) {
  if (!/^gro_[A-Za-z0-9_]+$/.test(String(row.object_id ?? "")) ||
      !String(row.object_id).toLowerCase().endsWith(suffix) || !row.payload ||
      row.payload?.object_id !== row.object_id || row.payload_hash !== row.payload?.integrity?.payload_hash ||
      row.signing_key_id !== signingKeyId || row.payload?.integrity?.signing_key_id !== signingKeyId ||
      !verifyRiskObjectSignature(row.payload, keys).valid || Date.parse(row.expires_at) > Date.now() - 6 * 3_600_000) {
    throw new Error("GRO_BUNDLE_SOURCE_INVALID");
  }
  const raw = Buffer.from(JSON.stringify(row.payload));
  const memberGzip = gzipSync(raw, { level: 9 });
  if (raw.length > 4_000_000 || memberGzip.length > 2_000_000) throw new Error("GRO_BUNDLE_MEMBER_TOO_LARGE");
  if (selected.length > 0 && rawBundleBytes + memberGzip.length > MAX_RAW_BUNDLE_BYTES) break;
  selected.push({
    object_id: row.object_id,
    payload: row.payload,
    payload_hash: row.payload_hash,
    signature: row.signature,
    signing_key_id: row.signing_key_id,
    expires_at: row.expires_at,
    archive_sha256: sha(memberGzip),
    archive_gzip_b64: memberGzip.toString("base64"),
  });
  rawBundleBytes += memberGzip.length;
}
if (!selected.length) throw new Error("GRO_BUNDLE_EMPTY");

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const bundleId = `${stamp}-${suffix}-${randomUUID()}`;
const archiveKey = `geomacro-evidence/v1/gro-bundles/${bundleId}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/gro-bundles/${bundleId}.json`;

let bundle: any;
let compressed: Buffer | undefined;
while (selected.length) {
  bundle = { schema: "geomacro.gro-bundle.v1", bundle_id: bundleId, shard_suffix: suffix,
    created_at: new Date().toISOString(), entries: selected };
  compressed = gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
  if (compressed.length <= MAX_COMPRESSED_BYTES) break;
  selected.pop();
}
if (!selected.length || !compressed) throw new Error("GRO_BUNDLE_CANNOT_FIT");

// The production reader is bundle-pointer native. Preserve the legacy
// individual-object path only for the one-object canary, where it explicitly
// exercises both restore representations. Bulk batches write only the bundle,
// reducing B2 Class-A operations from O(members) to O(bundles).
if (limit === 1) {
  const entry = selected[0];
  await b2.put(`geomacro-evidence/v1/gro/${entry.object_id}.json.gz`, Buffer.from(entry.archive_gzip_b64, "base64"));
}
await b2.put(archiveKey, compressed);

async function archiveRead(): Promise<Buffer> {
  // The canary probes the deployed Edge restore bridge. Bulk verification
  // reads B2 directly, then checks every signed member before DB cleanup.
  if (limit > 1) {
    const bytes = await b2.get(archiveKey);
    if (bytes.length > 20_000_000) throw new Error("GRO_BUNDLE_VERIFY_READ_TOO_LARGE");
    return bytes;
  }
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${url}/functions/v1/archive-verify-read`, {
        method: "POST",
        headers: { authorization: `Bearer ${role}`, "content-type": "application/json" },
        body: JSON.stringify({ kind: "gro-bundle", id: bundleId, part: "archive" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (!TRANSIENT_READ_STATUSES.has(response.status) || attempt === READ_ATTEMPTS) throw new Error(`GRO_BUNDLE_VERIFY_READ_FAILED_${response.status}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/^GRO_BUNDLE_VERIFY_READ_FAILED_\d+$/.test(message) || attempt === READ_ATTEMPTS) throw cause;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error("GRO_BUNDLE_VERIFY_READ_RETRY_EXHAUSTED");
}

const readback = await archiveRead();
const bundleSha = sha(compressed);
if (sha(readback) !== bundleSha) throw new Error("GRO_BUNDLE_COMPRESSED_HASH_MISMATCH");
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (restored?.schema !== "geomacro.gro-bundle.v1" || restored?.bundle_id !== bundleId ||
    restored?.shard_suffix !== suffix || !Array.isArray(restored?.entries) || restored.entries.length !== selected.length) {
  throw new Error("GRO_BUNDLE_RESTORE_INVALID");
}
const restoredById = new Map(restored.entries.map((entry: any) => [entry.object_id, entry]));
for (const source of selected) {
  const entry: any = restoredById.get(source.object_id);
  if (!entry || entry.payload_hash !== source.payload_hash || entry.signature !== source.signature ||
      entry.signing_key_id !== source.signing_key_id || entry.archive_sha256 !== source.archive_sha256) {
    throw new Error(`GRO_BUNDLE_MEMBER_METADATA_INVALID_${source.object_id}`);
  }
  const memberBytes = Buffer.from(entry.archive_gzip_b64, "base64");
  if (sha(memberBytes) !== source.archive_sha256) throw new Error(`GRO_BUNDLE_MEMBER_HASH_INVALID_${source.object_id}`);
  const object = JSON.parse(gunzipSync(memberBytes).toString("utf8"));
  if (object.object_id !== source.object_id || object.integrity?.payload_hash !== source.payload_hash ||
      canonicalRiskObjectJson(object) !== canonicalRiskObjectJson(source.payload) || !verifyRiskObjectSignature(object, keys).valid) {
    throw new Error(`GRO_BUNDLE_MEMBER_RESTORE_INVALID_${source.object_id}`);
  }
}

await b2.put(proofKey, Buffer.from(JSON.stringify({
  schema: "geomacro.gro-bundle-proof.v1", bundle_id: bundleId, archive_key: archiveKey,
  shard_suffix: suffix, signing_key_id: signingKeyId, member_count: selected.length,
  compressed_sha256: bundleSha, compressed_bytes: compressed.length, verified_at: new Date().toISOString(),
  members: selected.map(({ object_id, payload_hash, archive_sha256, expires_at }) => ({ object_id, payload_hash, archive_sha256, expires_at })),
})));

const { data: cleared, error: clearError } = await db.rpc("geomacro_clear_verified_gro_bundle_v1", {
  p_bundle_key: archiveKey,
  p_bundle_sha256: bundleSha,
  p_items: selected.map(({ object_id, payload, payload_hash, archive_sha256 }) => ({ object_id, payload, payload_hash, archive_sha256 })),
});
if (clearError || !Array.isArray(cleared) || cleared.length !== selected.length) throw clearError ?? new Error("GRO_BUNDLE_CLEAR_UNCONFIRMED");
const clearedIds = new Set(cleared.map((row: any) => row.object_id));
if (selected.some((entry) => !clearedIds.has(entry.object_id))) throw new Error("GRO_BUNDLE_CLEAR_SET_MISMATCH");

// After the one-object canary switches to its archive pointer, exercise the
// actual production restore endpoint and the signed object verifier.
if (limit === 1) {
  const source = selected[0];
  const { data: restoredBlob, error: restoreError } = await db.functions.invoke("gro-archive-read", {
    body: { object_id: source.object_id },
  });
  if (restoreError || !(restoredBlob instanceof Blob)) throw new Error("GRO_BUNDLE_CANARY_RESTORE_FAILED");
  const restoredBytes = Buffer.from(await restoredBlob.arrayBuffer());
  if (sha(restoredBytes) !== source.archive_sha256) throw new Error("GRO_BUNDLE_CANARY_RESTORE_HASH_INVALID");
  const restoredObject = JSON.parse(gunzipSync(restoredBytes).toString("utf8"));
  if (canonicalRiskObjectJson(restoredObject) !== canonicalRiskObjectJson(source.payload) ||
      !verifyRiskObjectSignature(restoredObject, keys).valid) throw new Error("GRO_BUNDLE_CANARY_RESTORE_SIGNATURE_INVALID");
}

console.log(JSON.stringify({ ok: true, status: "progress", bundle_id: bundleId, archived: selected.length,
  shard_suffix: suffix, signing_key_id: signingKeyId, bundle_compressed_bytes: compressed.length,
  b2_full_gets: 1, objects_per_b2_get: selected.length, source_rows_retained: true,
  individual_restore_compatibility: limit === 1, bundle_native_restore: true, signature_verified: true,
  verification_mode: "one-full-bundle-readback-before-atomic-cleanup" }));
