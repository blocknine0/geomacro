#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import { verifyRiskObjectSignature } from "../../src/lib/risk-object-signing.server";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const ENVELOPE_SCHEMA = "geomacro.country-gro-continuity.v1";
const PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v1";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const MAX_PROOF_BYTES = 2_000_000;
const MAX_OBJECT_BYTES = 2_000_000;

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

if (
  String(process.env.B2_S3_ENDPOINT ?? ENDPOINT).trim() !== ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_CONFIG_REQUIRED");
}

const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

const proofBytes = await b2.get(PROOF_KEY);
if (!proofBytes.length || proofBytes.length > MAX_PROOF_BYTES) {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_PROOF_SIZE_INVALID");
}

const proof = JSON.parse(Buffer.from(proofBytes).toString("utf8"));
if (
  proof?.schema !== PROOF_SCHEMA ||
  proof?.source_project !== SOURCE_PROJECT ||
  !Number.isFinite(Date.parse(String(proof?.generated_at ?? ""))) ||
  !Array.isArray(proof?.entries) ||
  proof.entries.length < 2 ||
  Number(proof?.countries_published ?? 0) < 1
) {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_PROOF_INVALID");
}

let verifiedObjects = 0;
let latestPointers = 0;
let byIdObjects = 0;
const countries = new Set<string>();

for (const entry of proof.entries) {
  const key = String(entry?.key ?? "");
  const expectedSha = String(entry?.sha256 ?? "").toLowerCase();
  const expectedBytes = Number(entry?.bytes ?? 0);
  const expectedObjectId = String(entry?.object_id ?? "");

  if (
    !/^geomacro-evidence\/v1\/live\/country-gro\/(?:by-id\/gro_country_[A-Z]{3}_[A-Za-z0-9]+|[A-Z]{3}\/latest)\.json\.gz$/.test(key) ||
    !/^[a-f0-9]{64}$/.test(expectedSha) ||
    !Number.isInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    expectedBytes > MAX_OBJECT_BYTES ||
    !/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(expectedObjectId)
  ) {
    throw new Error(`B2_COUNTRY_GRO_PRESERVATION_ENTRY_INVALID:${key || "missing"}`);
  }

  const compressed = await b2.get(key);
  if (
    compressed.length !== expectedBytes ||
    sha256(compressed) !== expectedSha
  ) {
    throw new Error(`B2_COUNTRY_GRO_PRESERVATION_HASH_INVALID:${key}`);
  }

  const restored = JSON.parse(gunzipSync(compressed).toString("utf8"));
  const object = restored?.object;
  if (
    restored?.schema !== ENVELOPE_SCHEMA ||
    restored?.source_project !== SOURCE_PROJECT ||
    !/^[A-Z]{3}$/.test(String(restored?.country_iso3 ?? "")) ||
    object?.object_id !== expectedObjectId ||
    object?.subject?.type !== "country" ||
    object?.subject?.id !== restored.country_iso3 ||
    object?.verification?.status !== "VERIFIED" ||
    object?.commercial_eligibility?.status !== "VERIFIED" ||
    !verifyRiskObjectSignature(object).valid
  ) {
    throw new Error(`B2_COUNTRY_GRO_PRESERVATION_RESTORE_INVALID:${key}`);
  }

  countries.add(restored.country_iso3);
  verifiedObjects += 1;
  if (/\/[A-Z]{3}\/latest\.json\.gz$/.test(key)) latestPointers += 1;
  if (/\/by-id\//.test(key)) byIdObjects += 1;
}

if (!latestPointers || !byIdObjects || latestPointers !== byIdObjects) {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_POINTER_SET_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-preservation.v1",
  maintenance_mode: "verified_preserved_country_gro_noop",
  reason: "no_new_commercially_verified_country_gro",
  proof_generated_at: proof.generated_at,
  countries_preserved: countries.size,
  b2_objects_reverified: verifiedObjects + 1,
  wrote_new_snapshot: false,
  freshness_advanced: false,
  payment_performed: false,
  execution_authorized: false,
}));
