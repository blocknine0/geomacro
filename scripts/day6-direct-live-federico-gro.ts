#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { assertFedericoPublicationReady } from "../src/lib/federico-publication-policy";
import { withRiskObjectObservationTimestamp } from "../src/lib/risk-object-observation";
import {
  canonicalRiskObjectJson,
  signRiskObject,
  verifyRiskObjectSignature,
} from "../src/lib/risk-object-signing.server";
import {
  loadPublicRiskObjectVerificationKeys,
} from "../src/lib/d1-country-gro-hot.server";
import { createB2Client } from "./ops/b2-s3-client.mjs";

const B2_BUCKET = "geomacro-private-archive";
const D1_DATABASE_NAME = "geomacro-control-plane";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const PARTNER = "federico";

const RISK_OBJECT_OUT =
  process.env.DAY6_RISK_OBJECT_OUT?.trim() || "/tmp/day6-risk-object.json";
const EVIDENCE_OUT =
  process.env.DAY6_DIRECT_EVIDENCE_OUT?.trim() || "/tmp/day6-direct-evidence.json";
const COUNTRY_ISO3 = String(
  process.argv[2] ?? process.env.DAY6_COUNTRY_ISO3 ?? "",
).trim().toUpperCase();

if (!/^[A-Z]{3}$/.test(COUNTRY_ISO3)) {
  throw new Error("DAY6_COUNTRY_ISO3 must be exactly three uppercase letters");
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

const cloudflareToken = requireEnv("CLOUDFLARE_API_TOKEN");
const cloudflareAccountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");

async function cloudflareJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${cloudflareToken}`,
      accept: "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.success !== true) {
    const detail =
      payload?.errors?.[0]?.message ??
      payload?.errors?.[0]?.code ??
      response.status;
    throw new Error(`DAY6_CLOUDFLARE_API_FAILED:${String(detail)}`);
  }
  return payload;
}

async function resolveD1DatabaseId() {
  const url = new URL(
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(cloudflareAccountId)}/d1/database`,
  );
  url.searchParams.set("name", D1_DATABASE_NAME);
  url.searchParams.set("per_page", "10");
  const payload = await cloudflareJson(url.toString());
  const matches = Array.isArray(payload.result)
    ? payload.result.filter((row: any) =>
        String(row?.name ?? "") === D1_DATABASE_NAME)
    : [];
  const databaseId = String(matches[0]?.uuid ?? "");
  if (matches.length !== 1 || !/^[0-9a-f-]{20,}$/i.test(databaseId)) {
    throw new Error("DAY6_D1_DATABASE_NOT_FOUND");
  }
  return databaseId;
}

type D1Query = {
  sql: string;
  params?: Array<string | number | null>;
};

async function d1Batch(
  databaseId: string,
  batch: D1Query[],
) {
  const endpoint =
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(cloudflareAccountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const payload = await cloudflareJson(
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch }),
    },
    60_000,
  );
  if (!Array.isArray(payload.result) || payload.result.length !== batch.length) {
    throw new Error("DAY6_D1_QUERY_RESULT_INVALID");
  }
  for (const result of payload.result) {
    if (result?.success !== true) {
      const detail =
        result?.error ??
        result?.errors?.[0]?.message ??
        "unknown_d1_query_error";
      throw new Error(`DAY6_D1_QUERY_FAILED:${String(detail)}`);
    }
  }
  return payload.result as Array<{
    success: boolean;
    results?: Array<Record<string, unknown>>;
  }>;
}

async function waitForPartnerAssuranceTable(databaseId: string) {
  let lastError = "";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      await d1Batch(databaseId, [{
        sql: "SELECT object_id FROM partner_assurance_gro_verified LIMIT 1",
      }]);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 18) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }
  throw new Error(`DAY6_D1_PARTNER_TABLE_UNAVAILABLE:${lastError}`);
}

const now = new Date();

const dryRun = await dryRunCountryRiskObject({
  country_iso3: COUNTRY_ISO3,
  as_of: now.toISOString(),
  delivery_profile: "FEDERICO_STRICT",
});

// The same publication policy is applied for every ISO3. Missing or weak
// evidence remains a hard fail and never becomes synthetic freshness.
assertFedericoPublicationReady(dryRun.object);

const observationBound = withRiskObjectObservationTimestamp(
  dryRun.object,
  now.toISOString(),
);
const signed = signRiskObject(observationBound);
const localVerification = verifyRiskObjectSignature(signed);
if (!localVerification.valid) {
  throw new Error(`DAY6_LOCAL_SIGNATURE_FAILED:${localVerification.reason}`);
}

const canonicalRecord = canonicalRiskObjectJson(signed);
const recordSha256 = sha256(canonicalRecord);
const raw = Buffer.from(JSON.stringify(signed));
const compressed = gzipSync(raw, { level: 9 });
const compressedSha256 = sha256(compressed);
const archiveKey =
  `geomacro-evidence/v1/partner-assurance/federico/${COUNTRY_ISO3}/${signed.object_id}.json.gz`;
const proofKey =
  `geomacro-evidence/v1/partner-assurance/federico/${COUNTRY_ISO3}/${signed.object_id}.proof.json`;

const b2 = createB2Client({
  endpointUrl: requireEnv("B2_S3_ENDPOINT"),
  accessKey: requireEnv("B2_KEY_ID"),
  secretKey: requireEnv("B2_APPLICATION_KEY"),
  bucket: B2_BUCKET,
});

// B2 remains the cold immutable archive. The upload acknowledgement is
// mandatory. A provider download cap must not become a synchronous partner
// assurance outage, so exact same-write verification happens through isolated
// D1 partner-assurance state below.
await b2.put(archiveKey, compressed);

const databaseId = await resolveD1DatabaseId();
await waitForPartnerAssuranceTable(databaseId);

const verifiedAt = new Date().toISOString();
const objectJson = canonicalRecord;
const upsertSql =
  "INSERT INTO partner_assurance_gro_verified (partner,object_id,country_iso3,schema_version,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,archive_readback_verified,object_json,verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(partner,object_id) DO UPDATE SET country_iso3=excluded.country_iso3,schema_version=excluded.schema_version,generated_at=excluded.generated_at,expires_at=excluded.expires_at,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,archive_write_acknowledged=1,archive_readback_verified=0,object_json=excluded.object_json,verified_at=excluded.verified_at,updated_at=excluded.updated_at";
const readbackSql =
  "SELECT partner,object_id,country_iso3,schema_version,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,archive_readback_verified,object_json,verified_at FROM partner_assurance_gro_verified WHERE partner=? AND object_id=? LIMIT 1";

await d1Batch(databaseId, [{
  sql: upsertSql,
  params: [
    PARTNER,
    signed.object_id,
    COUNTRY_ISO3,
    signed.schema_version,
    signed.generated_at,
    signed.expires_at,
    signed.integrity.signing_key_id,
    signed.integrity.payload_hash,
    recordSha256,
    archiveKey,
    compressedSha256,
    1,
    0,
    objectJson,
    verifiedAt,
    verifiedAt,
  ],
}]);

const readbackResult = await d1Batch(databaseId, [{
  sql: readbackSql,
  params: [PARTNER, signed.object_id],
}]);
const rows = readbackResult[0]?.results ?? [];
if (rows.length !== 1) {
  throw new Error("DAY6_D1_READBACK_ROW_INVALID");
}
const row = rows[0];
if (
  String(row.partner ?? "") !== PARTNER ||
  String(row.object_id ?? "") !== signed.object_id ||
  String(row.country_iso3 ?? "") !== COUNTRY_ISO3 ||
  String(row.schema_version ?? "") !== signed.schema_version ||
  String(row.signing_key_id ?? "") !== signed.integrity.signing_key_id ||
  String(row.payload_hash ?? "") !== signed.integrity.payload_hash ||
  String(row.record_sha256 ?? "") !== recordSha256 ||
  String(row.archive_key ?? "") !== archiveKey ||
  String(row.archive_sha256 ?? "") !== compressedSha256 ||
  Number(row.archive_write_acknowledged) !== 1 ||
  Number(row.archive_readback_verified) !== 0
) {
  throw new Error("DAY6_D1_READBACK_BINDING_MISMATCH");
}

const readbackJson = String(row.object_json ?? "");
if (sha256(readbackJson) !== recordSha256 || readbackJson !== canonicalRecord) {
  throw new Error("DAY6_D1_CANONICAL_READBACK_MISMATCH");
}
const restored = JSON.parse(readbackJson);
if (canonicalRiskObjectJson(restored) !== canonicalRecord) {
  throw new Error("DAY6_D1_CANONICAL_REENCODE_MISMATCH");
}

const publicKeys = await loadPublicRiskObjectVerificationKeys();
if (!publicKeys) {
  throw new Error("DAY6_PUBLIC_TRUST_REGISTRY_UNAVAILABLE");
}
const restoredVerification = verifyRiskObjectSignature(restored, publicKeys);
if (!restoredVerification.valid) {
  throw new Error(
    `DAY6_D1_SIGNATURE_READBACK_FAILED:${restoredVerification.reason}`,
  );
}
assertFedericoPublicationReady(restored);

const proof = {
  schema: "geomacro.day6-global-partner-gro-durable-proof.v3",
  country_iso3: COUNTRY_ISO3,
  object_id: signed.object_id,
  archive_key: archiveKey,
  payload_hash: signed.integrity.payload_hash,
  signing_key_id: signed.integrity.signing_key_id,
  canonical_record_sha256: recordSha256,
  compressed_sha256: compressedSha256,
  generated_at: signed.generated_at,
  observed_at: signed.observed_at,
  expires_at: signed.expires_at,
  verified_at: verifiedAt,
  calculation_namespace:
    signed.provenance?.reproducibility?.calculation_namespace ?? null,
  evidence_summary: signed.evidence_summary,
  archive_store: "backblaze-b2",
  archive_write_acknowledged: true,
  b2_readback_verified: false,
  b2_readback_deferred: true,
  b2_get_required_for_assurance: false,
  hot_verification_store: "cloudflare-d1",
  d1_readback_verified: true,
  d1_exact_canonical_record_verified: true,
  d1_signature_verified: true,
  raw_source_payload_stored: false,
  partner_review_attempted: false,
  partner_allowance_spent: false,
  payment_performed: false,
  execution_authorized: false,
};

await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

await writeFile(
  RISK_OBJECT_OUT,
  JSON.stringify(signed, null, 2) + "\n",
  { mode: 0o600 },
);
await writeFile(
  EVIDENCE_OUT,
  JSON.stringify(
    {
      ok: true,
      schema: "geomacro.day6-global-strict-evidence.v3",
      evaluated_at: now.toISOString(),
      country_iso3: COUNTRY_ISO3,
      profile: "FEDERICO_STRICT",
      calculation_namespace:
        signed.provenance?.reproducibility?.calculation_namespace ?? null,
      decision_readiness: signed.decision_readiness,
      commercial_eligibility: signed.commercial_eligibility,
      verification: signed.verification,
      evidence_summary: signed.evidence_summary,
      object_id: signed.object_id,
      canonical_record_sha256: recordSha256,
      b2_archive_key: archiveKey,
      b2_proof_key: proofKey,
      archive_write_acknowledged: true,
      b2_readback_verified: false,
      b2_readback_deferred: true,
      b2_get_required_for_assurance: false,
      d1_partner_assurance_readback_verified: true,
      raw_source_payload_stored: false,
      threshold_weakening: false,
      fake_freshness: false,
      partner_review_attempted: false,
      partner_allowance_spent: false,
      payment_performed: false,
      execution_authorized: false,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);

console.log(
  JSON.stringify(
    {
      ok: true,
      schema: "geomacro.day6-global-strict-gro-result.v3",
      country_iso3: COUNTRY_ISO3,
      object_id: signed.object_id,
      schema_version: signed.schema_version,
      calculation_namespace:
        signed.provenance?.reproducibility?.calculation_namespace ?? null,
      decision_readiness: signed.decision_readiness,
      commercial_eligibility: signed.commercial_eligibility,
      verification: signed.verification,
      integrity: {
        signing_key_id: signed.integrity.signing_key_id,
        signature_present: Boolean(signed.integrity.signature),
        signature_valid: true,
        payload_hash: signed.integrity.payload_hash,
        canonical_record_sha256: recordSha256,
      },
      evidence_summary: signed.evidence_summary,
      persistence: {
        authority: "b2",
        archive_authority: "backblaze-b2",
        hot_verification_authority: "cloudflare-d1",
        archive_key: archiveKey,
        proof_key: proofKey,
        archive_write_acknowledged: true,
        b2_readback_verified: false,
        b2_readback_deferred: true,
        b2_get_required_for_assurance: false,
        d1_readback_verified: true,
        d1_exact_canonical_record_verified: true,
        d1_signature_verified: true,
      },
      partner_review_attempted: false,
      partner_allowance_spent: false,
      payment_performed: false,
      execution_authorized: false,
    },
    null,
    2,
  ),
);
