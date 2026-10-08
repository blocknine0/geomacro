#!/usr/bin/env bun
import { verifyRiskObjectSignature, canonicalRiskObjectJson } from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import { fetchPublicRiskObjectVerificationKeys, readD1VerifiedHotCountryGro } from "../../src/lib/d1-country-gro-hot.server";
import { createHash } from "node:crypto";

const iso3 = String(process.env.GRO_CONTINUITY_COUNTRY_ISO3 ?? "USA").trim().toUpperCase();
if (!/^[A-Z]{3}$/.test(iso3)) throw new Error("COUNTRY_GRO_HOT_CANARY_ISO3_INVALID");

delete process.env.B2_KEY_ID;
delete process.env.B2_APPLICATION_KEY;
delete process.env.B2_ARCHIVE_READ_KEY_ID;
delete process.env.B2_ARCHIVE_READ_APPLICATION_KEY;
delete process.env.APP_SUPABASE_URL;
delete process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_DB_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const at = new Date().toISOString();
const object = await readD1VerifiedHotCountryGro(iso3, at);
if (!object) throw new Error("COUNTRY_GRO_HOT_CANARY_UNAVAILABLE");
const verificationKeys = await fetchPublicRiskObjectVerificationKeys();
if (!verificationKeys) throw new Error("COUNTRY_GRO_HOT_CANARY_TRUST_REGISTRY_UNAVAILABLE");
const signature = verifyRiskObjectSignature(object, verificationKeys);
const commercial = verifyCommercialRiskObjectArtifact(object, {
  now: new Date(at),
  verification_keys: verificationKeys,
});
if (!signature.valid || !commercial.deliverable) throw new Error("COUNTRY_GRO_HOT_CANARY_VERIFY_FAILED");
const recordSha256 = createHash("sha256").update(canonicalRiskObjectJson(object), "utf8").digest("hex");

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-d1-hot-canary.v1",
  country_iso3: iso3,
  object_id: object.object_id,
  record_sha256: recordSha256,
  payload_hash: object.integrity.payload_hash,
  signing_key_id: object.integrity.signing_key_id,
  signature_valid: true,
  commercial_eligibility_verified: true,
  trust_registry: "https://geomacro.live/api/risk-object-keys",
  trust_registry_key_count: Object.keys(verificationKeys).length,
  serving_store: "cloudflare-d1",
  archive_store: "backblaze-b2",
  b2_credentials_present: false,
  b2_network_read_required: false,
  supabase_credentials_present: false,
  external_payment_performed: false,
  execution_authorized: false,
}));
