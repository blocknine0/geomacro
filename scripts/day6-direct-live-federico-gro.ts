#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { dryRunCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { assertFedericoPublicationReady } from "../src/lib/federico-publication-policy";
import { withRiskObjectObservationTimestamp } from "../src/lib/risk-object-observation";
import {
  canonicalRiskObjectJson,
  signRiskObject,
  verifyRiskObjectSignature,
} from "../src/lib/risk-object-signing.server";
import { createB2Client } from "./ops/b2-s3-client.mjs";

const B2_BUCKET = "geomacro-private-archive";
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
const raw = Buffer.from(JSON.stringify(signed));
const compressed = gzipSync(raw, { level: 9 });
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

await b2.put(archiveKey, compressed);
const readback = await b2.get(archiveKey);
if (sha256(readback) !== sha256(compressed)) {
  throw new Error("DAY6_B2_READBACK_HASH_MISMATCH");
}
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (canonicalRiskObjectJson(restored) !== canonicalRecord) {
  throw new Error("DAY6_B2_CANONICAL_READBACK_MISMATCH");
}
const restoredVerification = verifyRiskObjectSignature(restored);
if (!restoredVerification.valid) {
  throw new Error(
    `DAY6_B2_SIGNATURE_READBACK_FAILED:${restoredVerification.reason}`,
  );
}

const recordSha256 = sha256(canonicalRecord);
const proof = {
  schema: "geomacro.day6-global-partner-gro-b2-proof.v2",
  country_iso3: COUNTRY_ISO3,
  object_id: signed.object_id,
  archive_key: archiveKey,
  payload_hash: signed.integrity.payload_hash,
  signing_key_id: signed.integrity.signing_key_id,
  canonical_record_sha256: recordSha256,
  compressed_sha256: sha256(compressed),
  generated_at: signed.generated_at,
  observed_at: signed.observed_at,
  expires_at: signed.expires_at,
  verified_at: new Date().toISOString(),
  calculation_namespace:
    signed.provenance?.reproducibility?.calculation_namespace ?? null,
  evidence_summary: signed.evidence_summary,
  b2_readback_verified: true,
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
      schema: "geomacro.day6-global-strict-evidence.v2",
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
      b2_readback_verified: true,
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
      schema: "geomacro.day6-global-strict-gro-result.v2",
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
        archive_key: archiveKey,
        proof_key: proofKey,
        readback_verified: true,
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
