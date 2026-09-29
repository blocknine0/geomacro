#!/usr/bin/env bun
// Archive up to 100 expired signed GRO payloads in one B2 bundle. One full B2
// readback restores and verifies every signed member before any DB payload is cleared.
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { canonicalRiskObjectJson, verifyRiskObjectSignature, type RiskObjectVerificationKeys } from "../../src/lib/risk-object-signing.server";

const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_READ_STATUSES = new Set([429, 500, 502, 503, 504]);
const READ_ATTEMPTS = 4;
const MAX_BUNDLE_BYTES = 18_000_000;
const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const activeSigningKeyId = String(process.env.RISK_OBJECT_SIGNING_KEY_ID ?? "").trim();
const suffix = String(process.env.GRO_ARCHIVE_SUFFIX ?? "").trim().toLowerCase();
const limit = Number(process.env.GRO_BUNDLE_LIMIT ?? 100);
if (url !== "https://ldpwajisioljyjtojvfx.supabase.co" || !role || !activeSigningKeyId ||
    !/^[0-9a-f]$/.test(suffix) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("GRO_BUNDLE_CONFIG_INVALID");
}
const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({ endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID, secretKey: process.env.B2_APPLICATION_KEY,
  bucket: "geomacro-private-archive" });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const bundleId = `${stamp}-${suffix}-${randomUUID()}`;
const bundleKey = `geomacro-evidence/v1/gro-bundles/${bundleId}.json.gz`;
const proofKey = `geomacro-evidence/v1/index/gro-bundles/${bundleId}.json`;

async function archiveRead() {
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${url}/functions/v1/archive-verify-read`, {
        method: "POST",
        headers: { authorization: `Bearer ${role}`, "content-type": "application/json" },
        body: JSON.stringify({ kind: "gro-bundle", id: bundleId, part: "archive" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 20_000_000) throw new Error("GRO_BUNDLE_VERIFY_READ_TOO_LARGE");
        return bytes;
      }
      if (!TRANSIENT_READ_STATUSES.has(response.status) || attempt === READ_ATTEMPTS) {
        throw new Error(`GRO_BUNDLE_VERIFY_READ_FAILED_${response.status}`);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message === "GRO_BUNDLE_VERIFY_READ_TOO_LARGE" || /^GRO_BUNDLE_VERIFY_READ_FAILED_\d+$/.test(message) || attempt === READ_ATTEMPTS) throw cause;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error("GRO_BUNDLE_VERIFY_READ_RETRY_EXHAUSTED");
}

const keyResponse = await fetch("https://geomacro.live/api/risk-object-keys", { signal: AbortSignal.timeout(15_000) });
if (!keyResponse.ok) throw new Error("GRO_BUNDLE_KEYS_UNAVAILABLE");
const keyBody = await keyResponse.json() as { keys?: Array<{ key_id: string; public_key_spki_b64: string; status: "active" | "retired" | "revoked"; not_before?: string | null; not_after?: string | null }> };
const keys: RiskObjectVerificationKeys = Object.fromEntries((keyBody.keys ?? []).map(({ key_id, ...record }) => [key_id, record]));
if (!keys[activeSigningKeyId]) throw new Error("GRO_BUNDLE_ACTIVE_KEY_NOT_PUBLISHED");

const { data: rows, error } = await db.rpc("geomacro_next_gro_archive_candidates", {
  p_suffix: suffix,
  p_signing_key_id: activeSigningKeyId,
  p_limit: limit,
});
if (error) throw error;
if (!rows?.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", processed: 0,
    signing_key_id: activeSigningKeyId, shard_suffix: suffix }));
  process.exit(0);
}

const members: Array<any> = [];
for (const row of rows) {
  if (!/^gro_[A-Za-z0-9_]+$/.test(row.object_id) || !row.object_id.toLowerCase().endsWith(suffix) ||
      row.payload?.object_id !== row.object_id || row.payload?.integrity?.payload_hash !== row.payload_hash ||
      row.payload?.integrity?.signing_key_id !== row.signing_key_id || row.signing_key_id !== activeSigningKeyId ||
      !verifyRiskObjectSignature(row.payload, keys).valid) {
    throw new Error(`GRO_BUNDLE_SOURCE_INVALID_${String(row.object_id ?? "unknown")}`);
  }
  const raw = Buffer.from(JSON.stringify(row.payload));
  const compressed = gzipSync(raw, { level: 9 });
  if (compressed.length > 2_000_000 || raw.length > 4_000_000) throw new Error(`GRO_BUNDLE_MEMBER_TOO_LARGE_${row.object_id}`);
  members.push({
    object_id: row.object_id,
    payload: row.payload,
    payload_hash: row.payload_hash,
    signature: row.signature,
    signing_key_id: row.signing_key_id,
    expires_at: row.expires_at,
    member_compressed_sha256: sha(compressed),
    payload_sha256: sha(raw),
    compressed_b64: compressed.toString("base64"),
  });
}

let selected = members;
let bundle: any;
let packed: Buffer;
while (selected.length) {
  bundle = { schema: "geomacro.gro-bundle.v1", bundle_id: bundleId, shard_suffix: suffix,
    created_at: new Date().toISOString(), entries: selected };
  packed = gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 });
  if (packed.length <= MAX_BUNDLE_BYTES) break;
  selected = selected.slice(0, -1);
}
if (!selected.length || !bundle! || !packed!) throw new Error("GRO_BUNDLE_CANNOT_FIT");

await b2.put(bundleKey, packed!);
const readback = await archiveRead();
const bundleSha = sha(packed!);
if (readback.length !== packed!.length || sha(readback) !== bundleSha) throw new Error("GRO_BUNDLE_READBACK_HASH_INVALID");
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (restored?.schema !== "geomacro.gro-bundle.v1" || restored?.bundle_id !== bundleId ||
    restored?.shard_suffix !== suffix || !Array.isArray(restored?.entries) || restored.entries.length !== selected.length) {
  throw new Error("GRO_BUNDLE_RESTORE_INVALID");
}
const restoredById = new Map(restored.entries.map((entry: any) => [entry.object_id, entry]));
for (const source of selected) {
  const entry: any = restoredById.get(source.object_id);
  if (!entry || entry.payload_hash !== source.payload_hash || entry.signature !== source.signature ||
      entry.signing_key_id !== source.signing_key_id || entry.member_compressed_sha256 !== source.member_compressed_sha256 ||
      typeof entry.compressed_b64 !== "string") throw new Error(`GRO_BUNDLE_MEMBER_METADATA_INVALID_${source.object_id}`);
  const memberCompressed = Buffer.from(entry.compressed_b64, "base64");
  if (sha(memberCompressed) !== source.member_compressed_sha256) throw new Error(`GRO_BUNDLE_MEMBER_COMPRESSED_HASH_INVALID_${source.object_id}`);
  const restoredPayload = JSON.parse(gunzipSync(memberCompressed).toString("utf8"));
  if (canonicalRiskObjectJson(restoredPayload) !== canonicalRiskObjectJson(source.payload) ||
      restoredPayload?.integrity?.payload_hash !== source.payload_hash || !verifyRiskObjectSignature(restoredPayload, keys).valid) {
    throw new Error(`GRO_BUNDLE_MEMBER_SIGNATURE_INVALID_${source.object_id}`);
  }
}

await b2.put(proofKey, Buffer.from(JSON.stringify({
  schema: "geomacro.gro-bundle-proof.v1", bundle_id: bundleId, archive_key: bundleKey,
  bundle_sha256: bundleSha, bundle_bytes: packed!.length, member_count: selected.length,
  signing_key_id: activeSigningKeyId, verified_at: new Date().toISOString(),
  members: selected.map(({ object_id, payload_hash, member_compressed_sha256, payload_sha256, expires_at }) => ({
    object_id, payload_hash, member_compressed_sha256, payload_sha256, expires_at,
  })),
})));

const { data: updated, error: updateError } = await db.rpc("geomacro_externalize_verified_gro_bundle", {
  p_bundle_key: bundleKey,
  p_bundle_sha256: bundleSha,
  p_items: selected.map(({ object_id, payload, payload_hash, signature, signing_key_id, member_compressed_sha256 }) => ({
    object_id, payload, payload_hash, signature, signing_key_id, member_compressed_sha256,
  })),
});
if (updateError || !Array.isArray(updated) || updated.length !== selected.length) throw updateError ?? new Error("GRO_BUNDLE_UPDATE_UNCONFIRMED");
const updatedIds = new Set(updated.map((row: any) => String(row.object_id)));
if (selected.some((entry) => !updatedIds.has(entry.object_id))) throw new Error("GRO_BUNDLE_UPDATE_SET_MISMATCH");

console.log(JSON.stringify({ ok: true, status: "progress", bundle_id: bundleId, processed: selected.length,
  signed_restore_verified: true, b2_full_gets: 1, gro_objects_per_b2_get: selected.length,
  b2_puts_per_bundle: 2, source_rows_retained: true, signing_key_id: activeSigningKeyId,
  shard_suffix: suffix, verification_mode: "one-full-bundle-readback-and-all-signatures-before-atomic-cleanup" }));
