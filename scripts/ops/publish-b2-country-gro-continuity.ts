#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { getLatestCompatibleCountryRiskObjectAtOrBefore } from "../../src/lib/risk-object-store.server";
import { verifyRiskObjectSignature } from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import { PUBLIC_DEMO_RISK_PROFILE_REASON } from "../../src/lib/public-demo-risk-profile";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const SCHEMA = "geomacro.country-gro-continuity.v1";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const MAX_CURRENT_ROWS = 1000;
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
  .select("subject_id", { count: "exact" })
  .eq("subject_type", "country")
  .eq("verification_status", "VERIFIED")
  .eq("commercial_eligibility_status", "VERIFIED")
  .gt("expires_at", evaluatedAt)
  .order("generated_at", { ascending: false })
  .limit(MAX_CURRENT_ROWS);

if (candidateError || count === null || count > MAX_CURRENT_ROWS || !Array.isArray(candidates)) {
  throw new Error("B2_COUNTRY_GRO_CANDIDATE_QUERY_INVALID");
}

const countries = [
  ...new Set(
    candidates
      .map((row) => String(row.subject_id ?? "").trim().toUpperCase())
      .filter((value) => /^[A-Z]{3}$/.test(value)),
  ),
].sort();
if (!countries.length) throw new Error("B2_COUNTRY_GRO_NO_CURRENT_CANONICAL_OBJECTS");

const proofEntries: Array<Record<string, unknown>> = [];
let published = 0;

async function putVerified(key: string, envelope: Record<string, unknown>, expectedObjectId: string) {
  const packed = gzipSync(Buffer.from(JSON.stringify(envelope)), { level: 9 });
  const digest = sha256(packed);
  await b2.put(key, packed);
  const readback = await b2.get(key);
  if (readback.length !== packed.length || sha256(readback) !== digest) {
    throw new Error(`B2_COUNTRY_GRO_READBACK_HASH_INVALID:${key}`);
  }
  const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
  const object = restored?.object;
  if (
    restored?.schema !== SCHEMA ||
    restored?.source_project !== SOURCE_PROJECT ||
    object?.object_id !== expectedObjectId ||
    !verifyRiskObjectSignature(object).valid ||
    !verifyCommercialRiskObjectArtifact(object, { now: new Date(evaluatedAt) }).deliverable
  ) throw new Error(`B2_COUNTRY_GRO_RESTORE_INVALID:${key}`);
  proofEntries.push({ key, sha256: digest, bytes: packed.length, object_id: expectedObjectId });
}

for (const countryIso3 of countries) {
  const object = await getLatestCompatibleCountryRiskObjectAtOrBefore(
    countryIso3,
    evaluatedAt,
    "CANONICAL",
  );
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
  const byIdKey = `geomacro-evidence/v1/live/country-gro/by-id/${object.object_id}.json.gz`;
  const latestKey = `geomacro-evidence/v1/live/country-gro/${countryIso3}/latest.json.gz`;
  await putVerified(byIdKey, envelope, object.object_id);
  await putVerified(latestKey, envelope, object.object_id);
  published += 1;
}

if (!published) throw new Error("B2_COUNTRY_GRO_NO_DELIVERABLE_OBJECTS_PUBLISHED");

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.country-gro-continuity-proof.v1",
  generated_at: evaluatedAt,
  source_project: SOURCE_PROJECT,
  countries_published: published,
  entries: proofEntries,
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) {
  throw new Error("B2_COUNTRY_GRO_PROOF_READBACK_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-continuity-publish.v1",
  evaluated_at: evaluatedAt,
  candidate_countries: countries.length,
  countries_published: published,
  b2_objects_verified: proofEntries.length + 1,
  payment_performed: false,
  execution_authorized: false,
}));
