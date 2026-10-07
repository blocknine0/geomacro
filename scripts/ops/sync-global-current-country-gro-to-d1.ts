#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import { createB2Client } from "./b2-s3-client.mjs";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v1";
const BUNDLE_SCHEMA = "geomacro.country-gro-continuity-bundle.v1";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const WRANGLER_VERSION = String(process.env.WRANGLER_VERSION ?? "4.136.3").trim();
const D1_DATABASE_NAME = String(process.env.D1_DATABASE_NAME ?? "geomacro-control-plane").trim();
const MIN_INDEXED = Math.max(1, Number(process.env.GLOBAL_GRO_D1_MIN_INDEXED ?? 195));
const OUT_DIR = join(process.cwd(), "artifacts", "global-gro-continuity");
const SQL_FILE = join(OUT_DIR, "verified-current-country-gro-index.sql");
const D1_CONFIG = join(OUT_DIR, "wrangler.runtime.jsonc");
const HASH_RE = /^[a-f0-9]{64}$/;
const ISO3_RE = /^[A-Z]{3}$/;
const OBJECT_RE = /^gro_[A-Za-z0-9_]+$/;
const BUNDLE_KEY_RE = /^geomacro-evidence\/v1\/live\/country-gro\/bundles\/[0-9TZ]+\.json\.gz$/;
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const sqlText = (value: unknown) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

if (
  String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) {
  throw new Error("GLOBAL_GRO_D1_B2_CONFIG_INVALID");
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("GLOBAL_GRO_D1_CLOUDFLARE_CONFIG_INVALID");
}
if (!Number.isInteger(MIN_INDEXED) || MIN_INDEXED < 1) {
  throw new Error("GLOBAL_GRO_D1_MIN_INDEXED_INVALID");
}

function wrangler(args: string[]) {
  return execFileSync("npx", ["-y", `wrangler@${WRANGLER_VERSION}`, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
}

function parseD1(raw: string) {
  const parsed = JSON.parse(raw);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  return envelopes.flatMap((entry) =>
    Array.isArray(entry?.results) ? entry.results : [],
  ) as Array<Record<string, unknown>>;
}

const registryResponse = await fetch("https://geomacro.live/api/risk-object-keys", {
  headers: { accept: "application/json", "cache-control": "no-cache" },
  signal: AbortSignal.timeout(15_000),
});
if (!registryResponse.ok) {
  throw new Error(`GLOBAL_GRO_D1_TRUST_REGISTRY_${registryResponse.status}`);
}
const registry = (await registryResponse.json()) as {
  keys?: Array<{
    key_id: string;
    public_key_spki_b64: string;
    status: "active" | "retired" | "revoked";
    not_before?: string | null;
    not_after?: string | null;
  }>;
};
const keys: RiskObjectVerificationKeys = Object.fromEntries(
  (registry.keys ?? []).map(({ key_id, ...record }) => [key_id, record]),
);
if (!Object.keys(keys).length) throw new Error("GLOBAL_GRO_D1_TRUST_REGISTRY_EMPTY");

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

const proofBytes = await b2.get(PROOF_KEY);
if (proofBytes.length > 4_000_000) throw new Error("GLOBAL_GRO_D1_PROOF_TOO_LARGE");
const proof = JSON.parse(proofBytes.toString("utf8")) as {
  schema?: string;
  generated_at?: string;
  source_project?: string;
  countries_published?: number;
  bundle_schema?: string;
  bundle_key?: string;
  bundle_sha256?: string;
  bundle_bytes?: number;
  entries?: Array<{
    key?: string;
    sha256?: string;
    bytes?: number;
    object_id?: string;
  }>;
};
if (
  proof.schema !== PROOF_SCHEMA ||
  proof.source_project !== SOURCE_PROJECT ||
  proof.bundle_schema !== BUNDLE_SCHEMA ||
  !BUNDLE_KEY_RE.test(String(proof.bundle_key ?? "")) ||
  !HASH_RE.test(String(proof.bundle_sha256 ?? "")) ||
  !Number.isInteger(Number(proof.bundle_bytes)) ||
  Number(proof.bundle_bytes) <= 0 ||
  !Array.isArray(proof.entries)
) {
  throw new Error("GLOBAL_GRO_D1_PROOF_CONTRACT_INVALID");
}

const byIdEntries = proof.entries
  .filter((entry) =>
    /^geomacro-evidence\/v1\/live\/country-gro\/by-id\/gro_[A-Za-z0-9_]+\.json\.gz$/.test(
      String(entry.key ?? ""),
    ),
  )
  .sort((a, b) => String(a.key).localeCompare(String(b.key)));

const uniqueIds = new Set(byIdEntries.map((entry) => String(entry.object_id ?? "")));
if (
  byIdEntries.length !== uniqueIds.size ||
  byIdEntries.length !== Number(proof.countries_published ?? -1)
) {
  throw new Error("GLOBAL_GRO_D1_PROOF_CARDINALITY_INVALID");
}

const bundleBytes = await b2.get(String(proof.bundle_key));
if (
  bundleBytes.length !== Number(proof.bundle_bytes) ||
  sha256(bundleBytes) !== String(proof.bundle_sha256)
) {
  throw new Error("GLOBAL_GRO_D1_BUNDLE_HASH_INVALID");
}
const bundle = JSON.parse(
  gunzipSync(bundleBytes, { maxOutputLength: 100_000_000 }).toString("utf8"),
) as {
  schema?: string;
  generated_at?: string;
  source_project?: string;
  countries_published?: number;
  entries?: Array<{
    country_iso3?: string;
    object_id?: string;
    envelope_gzip_b64?: string;
    envelope_sha256?: string;
    envelope_bytes?: number;
  }>;
};
if (
  bundle.schema !== BUNDLE_SCHEMA ||
  bundle.generated_at !== proof.generated_at ||
  bundle.source_project !== SOURCE_PROJECT ||
  bundle.countries_published !== proof.countries_published ||
  !Array.isArray(bundle.entries) ||
  bundle.entries.length !== Number(proof.countries_published)
) {
  throw new Error("GLOBAL_GRO_D1_BUNDLE_CONTRACT_INVALID");
}

const bundleByObjectId = new Map(
  bundle.entries.map((entry) => [String(entry.object_id ?? ""), entry]),
);
if (bundleByObjectId.size !== bundle.entries.length) {
  throw new Error("GLOBAL_GRO_D1_BUNDLE_DUPLICATE_OBJECT_ID");
}

const rows: Array<Record<string, string>> = [];
for (const entry of byIdEntries) {
  const expectedObjectId = String(entry.object_id ?? "");
  const expectedEnvelopeSha = String(entry.sha256 ?? "");
  const expectedEnvelopeBytes = Number(entry.bytes ?? 0);
  if (
    !OBJECT_RE.test(expectedObjectId) ||
    !HASH_RE.test(expectedEnvelopeSha) ||
    !Number.isInteger(expectedEnvelopeBytes) ||
    expectedEnvelopeBytes <= 0
  ) {
    throw new Error(`GLOBAL_GRO_D1_PROOF_ENTRY_INVALID:${expectedObjectId}`);
  }

  const member = bundleByObjectId.get(expectedObjectId);
  if (
    !member ||
    !ISO3_RE.test(String(member.country_iso3 ?? "")) ||
    member.envelope_sha256 !== expectedEnvelopeSha ||
    Number(member.envelope_bytes) !== expectedEnvelopeBytes ||
    typeof member.envelope_gzip_b64 !== "string"
  ) {
    throw new Error(`GLOBAL_GRO_D1_BUNDLE_MEMBER_INVALID:${expectedObjectId}`);
  }

  const packedEnvelope = Buffer.from(member.envelope_gzip_b64, "base64");
  if (
    packedEnvelope.length !== expectedEnvelopeBytes ||
    packedEnvelope.length > 2_000_000 ||
    sha256(packedEnvelope) !== expectedEnvelopeSha
  ) {
    throw new Error(`GLOBAL_GRO_D1_ENVELOPE_HASH_INVALID:${expectedObjectId}`);
  }

  const envelope = JSON.parse(
    gunzipSync(packedEnvelope, { maxOutputLength: 4_000_000 }).toString("utf8"),
  );
  const object = envelope?.object;
  const iso3 = String(envelope?.country_iso3 ?? "").trim().toUpperCase();
  if (
    envelope?.schema !== "geomacro.country-gro-continuity.v1" ||
    envelope?.source_project !== SOURCE_PROJECT ||
    !ISO3_RE.test(iso3) ||
    iso3 !== String(member.country_iso3) ||
    object?.object_id !== expectedObjectId ||
    object?.subject?.type !== "country" ||
    object?.subject?.id !== iso3 ||
    object?.verification?.status !== "VERIFIED" ||
    object?.commercial_eligibility?.status !== "VERIFIED"
  ) {
    throw new Error(`GLOBAL_GRO_D1_OBJECT_CONTRACT_INVALID:${expectedObjectId}`);
  }
  if (!verifyRiskObjectSignature(object, keys).valid) {
    throw new Error(`GLOBAL_GRO_D1_SIGNATURE_INVALID:${expectedObjectId}`);
  }
  if (!verifyCommercialRiskObjectArtifact(object, { now: new Date() }).deliverable) {
    throw new Error(`GLOBAL_GRO_D1_NOT_DELIVERABLE:${expectedObjectId}`);
  }
  const expiresMs = Date.parse(String(object.expires_at ?? ""));
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now() + 15 * 60_000) {
    throw new Error(`GLOBAL_GRO_D1_FRESHNESS_HEADROOM_INVALID:${expectedObjectId}`);
  }

  // The continuity bundle has already been independently read back and every
  // member is hash/signature verified above. Generic per-object archives are a
  // serving projection. PUT acknowledgement is sufficient here; consumers
  // independently verify archive_sha256 + signature on read. This removes one
  // Class-B GET per country without weakening fail-closed consumption.
  const raw = Buffer.from(JSON.stringify(object));
  const genericPacked = gzipSync(raw, { level: 9 });
  const genericKey = `geomacro-evidence/v1/gro/${expectedObjectId}.json.gz`;
  const genericSha = sha256(genericPacked);
  await b2.put(genericKey, genericPacked);

  const recordSha = sha256(Buffer.from(canonicalRiskObjectJson(object), "utf8"));
  const payloadHash = String(object?.integrity?.payload_hash ?? "");
  const signingKeyId = String(object?.integrity?.signing_key_id ?? "");
  if (!HASH_RE.test(recordSha) || !HASH_RE.test(payloadHash) || !signingKeyId) {
    throw new Error(`GLOBAL_GRO_D1_INDEX_HASH_INVALID:${expectedObjectId}`);
  }

  rows.push({
    object_id: expectedObjectId,
    schema_version: String(object.schema_version),
    subject_type: "country",
    subject_id: iso3,
    generated_at: String(object.generated_at),
    expires_at: String(object.expires_at),
    verification_status: "VERIFIED",
    commercial_eligibility_status: "VERIFIED",
    signing_key_id: signingKeyId,
    payload_hash: payloadHash,
    record_sha256: recordSha,
    archive_key: genericKey,
    archive_sha256: genericSha,
  });
}

if (rows.length < MIN_INDEXED) {
  throw new Error(
    `GLOBAL_GRO_D1_READY_FLOOR_BREACH:indexed=${rows.length}:required=${MIN_INDEXED}`,
  );
}

rows.sort((a, b) => a.subject_id.localeCompare(b.subject_id));
const list = JSON.parse(wrangler(["d1", "list", "--json"])) as Array<{
  name?: string;
  uuid?: string;
  id?: string;
}>;
const databaseId = String(
  list.find((row) => row.name === D1_DATABASE_NAME)?.uuid ??
    list.find((row) => row.name === D1_DATABASE_NAME)?.id ??
    "",
);
if (!/^[0-9a-f-]{20,}$/i.test(databaseId)) {
  throw new Error("GLOBAL_GRO_D1_DATABASE_NOT_FOUND");
}

mkdirSync(OUT_DIR, { recursive: true });
const exampleText = await Bun.file("workers/control-plane/wrangler.example.jsonc").text();
writeFileSync(
  D1_CONFIG,
  exampleText.replace("REPLACE_WITH_D1_DATABASE_ID", databaseId),
  { encoding: "utf8", mode: 0o600 },
);

const now = new Date().toISOString();
const statements = rows.map(
  (row) =>
    `INSERT INTO risk_object_index (object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,updated_at) VALUES (${sqlText(row.object_id)},${sqlText(row.schema_version)},'country',${sqlText(row.subject_id)},${sqlText(row.generated_at)},${sqlText(row.expires_at)},'VERIFIED','VERIFIED',${sqlText(row.signing_key_id)},${sqlText(row.payload_hash)},${sqlText(row.record_sha256)},${sqlText(row.archive_key)},${sqlText(row.archive_sha256)},${sqlText(now)}) ON CONFLICT(object_id) DO UPDATE SET schema_version=excluded.schema_version,subject_type=excluded.subject_type,subject_id=excluded.subject_id,generated_at=excluded.generated_at,expires_at=excluded.expires_at,verification_status=excluded.verification_status,commercial_eligibility_status=excluded.commercial_eligibility_status,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,updated_at=excluded.updated_at;`,
);
writeFileSync(SQL_FILE, `${statements.join("\n")}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
wrangler([
  "d1",
  "execute",
  "DB",
  "--remote",
  "--yes",
  "--config",
  D1_CONFIG,
  "--file",
  SQL_FILE,
]);

const readbackRaw = wrangler([
  "d1",
  "execute",
  "DB",
  "--remote",
  "--json",
  "--config",
  D1_CONFIG,
  "--command",
  "SELECT object_id,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,record_sha256,archive_key,archive_sha256 FROM risk_object_index WHERE subject_type='country' ORDER BY subject_id,generated_at DESC;",
]);
const expected = new Map(rows.map((row) => [row.object_id, row]));
const actual = parseD1(readbackRaw).filter((row) => expected.has(String(row.object_id)));
if (actual.length !== rows.length) {
  throw new Error(
    `GLOBAL_GRO_D1_READBACK_CARDINALITY_INVALID:expected=${rows.length}:actual=${actual.length}`,
  );
}
for (const row of actual) {
  const exp = expected.get(String(row.object_id))!;
  for (const key of [
    "subject_id",
    "verification_status",
    "commercial_eligibility_status",
    "record_sha256",
    "archive_key",
    "archive_sha256",
  ]) {
    if (String(row[key] ?? "") !== exp[key]) {
      throw new Error(`GLOBAL_GRO_D1_READBACK_MISMATCH:${exp.object_id}:${key}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      schema: "geomacro.global-current-country-gro-d1-sync.v2",
      proof_key: PROOF_KEY,
      proof_generated_at: proof.generated_at ?? null,
      bundle_key: proof.bundle_key ?? null,
      bundle_sha256: proof.bundle_sha256 ?? null,
      indexed_country_count: rows.length,
      minimum_indexed_required: MIN_INDEXED,
      threshold_satisfied: rows.length >= MIN_INDEXED,
      subjects: rows.map((row) => row.subject_id),
      b2_readback_verified: true,
      b2_readback_scope: "continuity_proof_and_bundle",
      b2_class_b_source_reads: 2,
      bundle_readback_verified: true,
      bundle_members_verified: rows.length,
      generic_archive_writes_acknowledged: rows.length,
      generic_archive_readback_deferred_to_runtime: true,
      signature_verified: true,
      commercial_eligibility_verified: true,
      d1_readback_verified: true,
      supabase_payload_used_for_d1_record: false,
      external_payment_performed: false,
      execution_authorized: false,
      destructive_b2_change: false,
      generated_at: now,
      b2: b2.usage(),
    },
    null,
    2,
  ),
);
