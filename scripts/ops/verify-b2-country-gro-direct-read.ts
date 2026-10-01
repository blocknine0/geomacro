#!/usr/bin/env bun
import { createB2Client } from "./b2-s3-client.mjs";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";

if (
  String(process.env.B2_S3_ENDPOINT ?? ENDPOINT).trim() !== ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_CONFIG_REQUIRED");
}

const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

const proofBytes = await b2.get(PROOF_KEY);
const proof = JSON.parse(Buffer.from(proofBytes).toString("utf8"));
if (
  proof?.schema !== "geomacro.country-gro-continuity-proof.v1" ||
  !Array.isArray(proof.entries) ||
  proof.entries.length < 2
) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_PROOF_INVALID");
}

const latestEntry = proof.entries.find((entry: unknown) => {
  const key = String((entry as { key?: unknown })?.key ?? "");
  return /^geomacro-evidence\/v1\/live\/country-gro\/[A-Z]{3}\/latest\.json\.gz$/.test(key);
});
if (!latestEntry) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_LATEST_POINTER_MISSING");
}

const key = String(latestEntry.key);
const match = key.match(/\/([A-Z]{3})\/latest\.json\.gz$/);
const countryIso3 = match?.[1] ?? "";
if (!/^[A-Z]{3}$/.test(countryIso3)) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_COUNTRY_INVALID");
}

// Prove that the runtime reader does not require any Supabase URL/key. The B2
// continuity path is deliberately invoked after removing both app and generic
// Supabase credentials from the process environment.
delete process.env.APP_SUPABASE_URL;
delete process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { readB2LatestCanonicalCountryGro } = await import(
  "../../src/lib/b2-country-gro.server"
);
const evaluatedAt = new Date().toISOString();
const object = await readB2LatestCanonicalCountryGro(countryIso3, evaluatedAt);
if (!object) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_READ_FAILED");
}
if (
  object.subject?.type !== "country" ||
  object.subject?.id !== countryIso3 ||
  object.object_id !== String(latestEntry.object_id ?? "")
) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_OBJECT_MISMATCH");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-direct-read-canary.v1",
  country_iso3: countryIso3,
  object_id: object.object_id,
  generated_at: object.generated_at,
  expires_at: object.expires_at,
  verification_status: object.verification?.status ?? null,
  commercial_eligibility_status: object.commercial_eligibility?.status ?? null,
  supabase_credentials_present: Boolean(
    process.env.APP_SUPABASE_URL ||
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  payment_performed: false,
  execution_authorized: false,
}));
