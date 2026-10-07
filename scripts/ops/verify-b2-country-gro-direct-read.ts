#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createB2Client } from "./b2-s3-client.mjs";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const BUNDLE_PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v2";
const LEGACY_PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v1";
const LOCAL_PROOF_READBACK = String(
  process.env.GLOBAL_GRO_PROOF_READBACK_FILE ??
    join(process.cwd(), "artifacts", "global-gro-continuity", "continuity-proof-readback.json"),
).trim();

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

let proofBytes: Buffer;
let proofSource: "publisher_readback" | "b2";
if (existsSync(LOCAL_PROOF_READBACK)) {
  proofBytes = readFileSync(LOCAL_PROOF_READBACK);
  proofSource = "publisher_readback";
} else {
  proofBytes = await b2.get(PROOF_KEY);
  proofSource = "b2";
}

const proof = JSON.parse(Buffer.from(proofBytes).toString("utf8"));
let countryIso3 = "";
let expectedObjectId = "";

if (proof?.schema === BUNDLE_PROOF_SCHEMA) {
  if (
    !Array.isArray(proof.members) ||
    proof.members.length < 1 ||
    proof.full_b2_bundle_readback_verified !== true ||
    proof.all_member_hashes_verified !== true ||
    proof.all_member_signatures_verified !== true
  ) {
    throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_BUNDLE_PROOF_INVALID");
  }
  const member = proof.members.find(
    (value: unknown) =>
      /^[A-Z]{3}$/.test(String((value as { country_iso3?: unknown })?.country_iso3 ?? "")) &&
      /^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(
        String((value as { object_id?: unknown })?.object_id ?? ""),
      ),
  );
  if (!member) throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_BUNDLE_MEMBER_MISSING");
  countryIso3 = String(member.country_iso3);
  expectedObjectId = String(member.object_id);
} else if (proof?.schema === LEGACY_PROOF_SCHEMA) {
  if (!Array.isArray(proof.entries) || proof.entries.length < 2) {
    throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_LEGACY_PROOF_INVALID");
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
  countryIso3 = match?.[1] ?? "";
  expectedObjectId = String(latestEntry.object_id ?? "");
} else {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_PROOF_INVALID");
}

if (
  !/^[A-Z]{3}$/.test(countryIso3) ||
  !/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(expectedObjectId)
) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_SUBJECT_INVALID");
}

// Prove that the production reader does not require any Supabase URL/key. In a
// successful bundle-v2 publication cycle the proof selection above reuses the
// publisher's independently verified proof bytes, so the only B2 reads here are
// the runtime reader's own proof + bundle reads.
delete process.env.APP_SUPABASE_URL;
delete process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_DB_URL;

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
  object.object_id !== expectedObjectId
) {
  throw new Error("B2_COUNTRY_GRO_DIRECT_CANARY_OBJECT_MISMATCH");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-direct-read-canary.v2",
  proof_schema: proof.schema,
  proof_source: proofSource,
  bundle_mode: proof.schema === BUNDLE_PROOF_SCHEMA,
  country_iso3: countryIso3,
  object_id: object.object_id,
  generated_at: object.generated_at,
  expires_at: object.expires_at,
  verification_status: object.verification?.status ?? null,
  commercial_eligibility_status: object.commercial_eligibility?.status ?? null,
  proof_selection_b2_gets: proofSource === "b2" ? 1 : 0,
  expected_runtime_b2_gets_when_bundle_v2: proof.schema === BUNDLE_PROOF_SCHEMA ? 2 : null,
  supabase_credentials_present: Boolean(
    process.env.APP_SUPABASE_URL ||
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_DB_URL
  ),
  payment_performed: false,
  execution_authorized: false,
}));