#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { getLatestCompatibleCountryRiskObjectAtOrBefore } from "../../src/lib/risk-object-store.server";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
} from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import { PUBLIC_DEMO_RISK_PROFILE_REASON } from "../../src/lib/public-demo-risk-profile";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const BUNDLE_SCHEMA = "geomacro.country-gro-bundle.v2";
const PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v2";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const BUNDLE_PREFIX = "geomacro-evidence/v1/live/country-gro/bundles";
const MAX_CURRENT_ROWS = 1000;
const MAX_BUNDLE_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_BUNDLE_DECOMPRESSED_BYTES = 192 * 1024 * 1024;
const OUT_DIR = join(process.cwd(), "artifacts", "global-gro-continuity");
const BUNDLE_READBACK_FILE = String(
  process.env.GLOBAL_GRO_BUNDLE_READBACK_FILE ??
    join(OUT_DIR, "country-gro-bundle-readback.json.gz"),
).trim();
const PROOF_READBACK_FILE = String(
  process.env.GLOBAL_GRO_PROOF_READBACK_FILE ??
    join(OUT_DIR, "continuity-proof-readback.json"),
).trim();
const sha256 = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

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

const members: Array<{
  country_iso3: string;
  object_id: string;
  record_sha256: string;
  object: Record<string, unknown>;
}> = [];

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

  members.push({
    country_iso3: countryIso3,
    object_id: object.object_id,
    record_sha256: sha256(Buffer.from(canonicalRiskObjectJson(object), "utf8")),
    object: object as unknown as Record<string, unknown>,
  });
}

if (!members.length) throw new Error("B2_COUNTRY_GRO_NO_DELIVERABLE_OBJECTS_PUBLISHED");
members.sort((a, b) => a.country_iso3.localeCompare(b.country_iso3));
if (new Set(members.map((member) => member.country_iso3)).size !== members.length) {
  throw new Error("B2_COUNTRY_GRO_BUNDLE_COUNTRY_DUPLICATE");
}
if (new Set(members.map((member) => member.object_id)).size !== members.length) {
  throw new Error("B2_COUNTRY_GRO_BUNDLE_OBJECT_DUPLICATE");
}

const bundle = {
  schema: BUNDLE_SCHEMA,
  generated_at: evaluatedAt,
  source_project: SOURCE_PROJECT,
  member_count: members.length,
  members,
};
const bundleRaw = Buffer.from(JSON.stringify(bundle));
const packed = gzipSync(bundleRaw, { level: 9 });
if (!packed.length || packed.length > MAX_BUNDLE_COMPRESSED_BYTES) {
  throw new Error(`B2_COUNTRY_GRO_BUNDLE_COMPRESSED_SIZE_INVALID:${packed.length}`);
}
if (bundleRaw.length > MAX_BUNDLE_DECOMPRESSED_BYTES) {
  throw new Error(`B2_COUNTRY_GRO_BUNDLE_RAW_SIZE_INVALID:${bundleRaw.length}`);
}

const bundleSha = sha256(packed);
const bundleKey = `${BUNDLE_PREFIX}/${bundleSha}.json.gz`;
await b2.put(bundleKey, packed);
const readback = await b2.get(bundleKey);
if (readback.length !== packed.length || sha256(readback) !== bundleSha) {
  throw new Error("B2_COUNTRY_GRO_BUNDLE_READBACK_HASH_INVALID");
}

const restored = JSON.parse(
  gunzipSync(readback, { maxOutputLength: MAX_BUNDLE_DECOMPRESSED_BYTES }).toString("utf8"),
) as typeof bundle;
if (
  restored?.schema !== BUNDLE_SCHEMA ||
  restored?.source_project !== SOURCE_PROJECT ||
  restored?.generated_at !== evaluatedAt ||
  restored?.member_count !== members.length ||
  !Array.isArray(restored?.members) ||
  restored.members.length !== members.length
) {
  throw new Error("B2_COUNTRY_GRO_BUNDLE_RESTORE_CONTRACT_INVALID");
}

for (const member of restored.members) {
  const object = member?.object as any;
  if (
    !/^[A-Z]{3}$/.test(String(member?.country_iso3 ?? "")) ||
    !/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(String(member?.object_id ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(member?.record_sha256 ?? "")) ||
    object?.object_id !== member.object_id ||
    object?.subject?.type !== "country" ||
    object?.subject?.id !== member.country_iso3 ||
    object?.verification?.status !== "VERIFIED" ||
    object?.commercial_eligibility?.status !== "VERIFIED" ||
    sha256(Buffer.from(canonicalRiskObjectJson(object), "utf8")) !== member.record_sha256 ||
    !verifyRiskObjectSignature(object).valid ||
    !verifyCommercialRiskObjectArtifact(object, { now: new Date(evaluatedAt) }).deliverable
  ) {
    throw new Error(`B2_COUNTRY_GRO_BUNDLE_MEMBER_INVALID:${String(member?.country_iso3 ?? "missing")}`);
  }
}

const proof = Buffer.from(JSON.stringify({
  schema: PROOF_SCHEMA,
  generated_at: evaluatedAt,
  source_project: SOURCE_PROJECT,
  countries_published: members.length,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_bytes: packed.length,
  members: members.map(({ country_iso3, object_id, record_sha256 }) => ({
    country_iso3,
    object_id,
    record_sha256,
  })),
  full_b2_bundle_readback_verified: true,
  all_member_hashes_verified: true,
  all_member_signatures_verified: true,
  commercial_eligibility_verified: true,
  raw_source_material_in_bundle: false,
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) {
  throw new Error("B2_COUNTRY_GRO_PROOF_READBACK_INVALID");
}
const restoredProof = JSON.parse(proofReadback.toString("utf8"));
if (
  restoredProof?.schema !== PROOF_SCHEMA ||
  restoredProof?.bundle_key !== bundleKey ||
  restoredProof?.bundle_sha256 !== bundleSha ||
  restoredProof?.countries_published !== members.length ||
  restoredProof?.full_b2_bundle_readback_verified !== true ||
  restoredProof?.all_member_hashes_verified !== true ||
  restoredProof?.all_member_signatures_verified !== true
) {
  throw new Error("B2_COUNTRY_GRO_PROOF_RESTORE_INVALID");
}

mkdirSync(dirname(BUNDLE_READBACK_FILE), { recursive: true });
mkdirSync(dirname(PROOF_READBACK_FILE), { recursive: true });
writeFileSync(BUNDLE_READBACK_FILE, readback, { mode: 0o600 });
writeFileSync(PROOF_READBACK_FILE, proofReadback, { encoding: "utf8", mode: 0o600 });

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-continuity-publish.v2",
  evaluated_at: evaluatedAt,
  candidate_countries: countries.length,
  countries_published: members.length,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_compressed_bytes: packed.length,
  bundle_decompressed_bytes: bundleRaw.length,
  b2_full_gets: 2,
  gro_objects_per_bundle_get: members.length,
  full_b2_bundle_readback_verified: true,
  all_member_hashes_verified: true,
  all_member_signatures_verified: true,
  local_verified_readback_reuse_enabled: true,
  legacy_per_country_b2_mirrors_written: false,
  raw_source_material_emitted: false,
  payment_performed: false,
  execution_authorized: false,
  destructive_change: false,
  b2: b2.usage(),
}));
