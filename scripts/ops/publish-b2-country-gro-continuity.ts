#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { verifyRiskObjectSignature } from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import { PUBLIC_DEMO_RISK_PROFILE_REASON } from "../../src/lib/public-demo-risk-profile";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const SCHEMA = "geomacro.country-gro-continuity.v1";
const BUNDLE_SCHEMA = "geomacro.country-gro-continuity-bundle.v1";
const PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v1";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const MAX_CURRENT_ROWS = 1000;
const MAX_BUNDLE_BYTES = 40_000_000;
const MAX_BUNDLE_OUTPUT_BYTES = 100_000_000;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

if (
  process.env.APP_SUPABASE_URL !== `https://${SOURCE_PROJECT}.supabase.co` ||
  !process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
  String(process.env.B2_S3_ENDPOINT ?? ENDPOINT).trim() !== ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) throw new Error("B2_COUNTRY_GRO_PUBLISH_CONFIG_REQUIRED");

const db = createClient(
  process.env.APP_SUPABASE_URL,
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } },
);
const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

const evaluatedAt = new Date().toISOString();
const { data: candidates, error: candidateError, count } = await db
  .from("geomacro_risk_objects")
  .select(
    "subject_id,payload,generated_at,expires_at,commercial_eligibility_reason_codes",
    { count: "exact" },
  )
  .eq("subject_type", "country")
  .eq("verification_status", "VERIFIED")
  .eq("commercial_eligibility_status", "VERIFIED")
  .gt("expires_at", evaluatedAt)
  .not("payload", "is", null)
  .order("generated_at", { ascending: false })
  .limit(MAX_CURRENT_ROWS);

if (candidateError || count === null || count > MAX_CURRENT_ROWS || !Array.isArray(candidates)) {
  throw new Error("B2_COUNTRY_GRO_CANDIDATE_QUERY_INVALID");
}

const currentByCountry = new Map<string, any>();
for (const row of candidates as Array<Record<string, unknown>>) {
  const iso3 = String(row.subject_id ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3) || currentByCountry.has(iso3)) continue;

  const reasons = Array.isArray(row.commercial_eligibility_reason_codes)
    ? row.commercial_eligibility_reason_codes.map(String)
    : [];
  if (reasons.includes(PUBLIC_DEMO_RISK_PROFILE_REASON)) continue;

  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    continue;
  }

  currentByCountry.set(iso3, row.payload);
}

const countries = [...currentByCountry.keys()].sort();
if (!countries.length) throw new Error("B2_COUNTRY_GRO_NO_CURRENT_CANONICAL_OBJECTS");

type BundleEntry = {
  country_iso3: string;
  object_id: string;
  envelope_gzip_b64: string;
  envelope_sha256: string;
  envelope_bytes: number;
};

const proofEntries: Array<Record<string, unknown>> = [];
const bundleEntries: BundleEntry[] = [];
let published = 0;

for (const countryIso3 of countries) {
  const object = currentByCountry.get(countryIso3);
  if (!object) continue;
  if (
    object.subject.type !== "country" ||
    object.subject.id !== countryIso3 ||
    object.commercial_eligibility.reason_codes.includes(PUBLIC_DEMO_RISK_PROFILE_REASON) ||
    !verifyRiskObjectSignature(object).valid ||
    !verifyCommercialRiskObjectArtifact(object, { now: new Date(evaluatedAt) }).deliverable
  ) continue;

  const envelope = {
    schema: SCHEMA,
    published_at: evaluatedAt,
    source_project: SOURCE_PROJECT,
    country_iso3: countryIso3,
    object,
  };
  const packed = gzipSync(Buffer.from(JSON.stringify(envelope)), { level: 9 });
  const digest = sha256(packed);
  const byIdKey = `geomacro-evidence/v1/live/country-gro/by-id/${object.object_id}.json.gz`;
  const latestKey = `geomacro-evidence/v1/live/country-gro/${countryIso3}/latest.json.gz`;

  // Individual keys are serving projections. The independently verified
  // durable publication unit is the bundle below, so we do not spend one
  // Class-B readback per projection.
  await b2.put(byIdKey, packed);
  await b2.put(latestKey, packed);

  proofEntries.push(
    { key: byIdKey, sha256: digest, bytes: packed.length, object_id: object.object_id },
    { key: latestKey, sha256: digest, bytes: packed.length, object_id: object.object_id },
  );
  bundleEntries.push({
    country_iso3: countryIso3,
    object_id: object.object_id,
    envelope_gzip_b64: packed.toString("base64"),
    envelope_sha256: digest,
    envelope_bytes: packed.length,
  });
  published += 1;
}

if (!published) throw new Error("B2_COUNTRY_GRO_NO_DELIVERABLE_OBJECTS_PUBLISHED");

const bundleId = evaluatedAt.replace(/[-:.]/g, "");
const bundleKey = `geomacro-evidence/v1/live/country-gro/bundles/${bundleId}.json.gz`;
const bundleRaw = Buffer.from(JSON.stringify({
  schema: BUNDLE_SCHEMA,
  generated_at: evaluatedAt,
  source_project: SOURCE_PROJECT,
  countries_published: published,
  entries: bundleEntries,
}));
const bundlePacked = gzipSync(bundleRaw, { level: 9 });
if (!bundlePacked.length || bundlePacked.length > MAX_BUNDLE_BYTES) {
  throw new Error("B2_COUNTRY_GRO_BUNDLE_SIZE_INVALID");
}
const bundleSha = sha256(bundlePacked);
await b2.put(bundleKey, bundlePacked);
const bundleReadback = await b2.get(bundleKey);
if (
  bundleReadback.length !== bundlePacked.length ||
  sha256(bundleReadback) !== bundleSha
) {
  throw new Error("B2_COUNTRY_GRO_BUNDLE_READBACK_HASH_INVALID");
}

const restoredBundle = JSON.parse(
  gunzipSync(bundleReadback, { maxOutputLength: MAX_BUNDLE_OUTPUT_BYTES }).toString("utf8"),
) as {
  schema?: string;
  generated_at?: string;
  source_project?: string;
  countries_published?: number;
  entries?: BundleEntry[];
};
if (
  restoredBundle.schema !== BUNDLE_SCHEMA ||
  restoredBundle.generated_at !== evaluatedAt ||
  restoredBundle.source_project !== SOURCE_PROJECT ||
  restoredBundle.countries_published !== published ||
  !Array.isArray(restoredBundle.entries) ||
  restoredBundle.entries.length !== published
) {
  throw new Error("B2_COUNTRY_GRO_BUNDLE_CONTRACT_INVALID");
}

for (const entry of restoredBundle.entries) {
  if (
    !/^[A-Z]{3}$/.test(entry.country_iso3) ||
    !/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(entry.object_id) ||
    !/^[a-f0-9]{64}$/.test(entry.envelope_sha256) ||
    !Number.isInteger(entry.envelope_bytes) ||
    entry.envelope_bytes <= 0 ||
    typeof entry.envelope_gzip_b64 !== "string"
  ) {
    throw new Error("B2_COUNTRY_GRO_BUNDLE_ENTRY_INVALID");
  }
  const compressed = Buffer.from(entry.envelope_gzip_b64, "base64");
  if (
    compressed.length !== entry.envelope_bytes ||
    sha256(compressed) !== entry.envelope_sha256
  ) {
    throw new Error(`B2_COUNTRY_GRO_BUNDLE_MEMBER_HASH_INVALID:${entry.object_id}`);
  }
  const restored = JSON.parse(gunzipSync(compressed).toString("utf8"));
  const object = restored?.object;
  if (
    restored?.schema !== SCHEMA ||
    restored?.source_project !== SOURCE_PROJECT ||
    restored?.country_iso3 !== entry.country_iso3 ||
    object?.object_id !== entry.object_id ||
    object?.subject?.type !== "country" ||
    object?.subject?.id !== entry.country_iso3 ||
    !verifyRiskObjectSignature(object).valid ||
    !verifyCommercialRiskObjectArtifact(object, { now: new Date(evaluatedAt) }).deliverable
  ) {
    throw new Error(`B2_COUNTRY_GRO_BUNDLE_MEMBER_RESTORE_INVALID:${entry.object_id}`);
  }
}

const proof = Buffer.from(JSON.stringify({
  schema: PROOF_SCHEMA,
  generated_at: evaluatedAt,
  source_project: SOURCE_PROJECT,
  countries_published: published,
  bundle_schema: BUNDLE_SCHEMA,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_bytes: bundlePacked.length,
  entries: proofEntries,
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (proofReadback.length !== proof.length || sha256(proofReadback) !== sha256(proof)) {
  throw new Error("B2_COUNTRY_GRO_PROOF_READBACK_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-continuity-publish.v2",
  evaluated_at: evaluatedAt,
  candidate_countries: countries.length,
  countries_published: published,
  serving_projection_objects_written: proofEntries.length,
  bundle_members_verified: restoredBundle.entries.length,
  b2_full_readback_objects_verified: 2,
  class_b_readback_design_count: 2,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  proof_key: PROOF_KEY,
  payment_performed: false,
  execution_authorized: false,
  b2: b2.usage(),
}));
