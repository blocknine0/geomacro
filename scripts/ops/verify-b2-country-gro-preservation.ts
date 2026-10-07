#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
} from "../../src/lib/risk-object-signing.server";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const LEGACY_ENVELOPE_SCHEMA = "geomacro.country-gro-continuity.v1";
const LEGACY_PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v1";
const BUNDLE_SCHEMA = "geomacro.country-gro-bundle.v2";
const BUNDLE_PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v2";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const MAX_PROOF_BYTES = 4_000_000;
const MAX_OBJECT_BYTES = 2_000_000;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_BUNDLE_RAW_BYTES = 192 * 1024 * 1024;

const sha256 = (bytes: Uint8Array | string) =>
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
  proof?.source_project !== SOURCE_PROJECT ||
  !Number.isFinite(Date.parse(String(proof?.generated_at ?? "")))
) {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_PROOF_INVALID");
}

let countriesPreserved = 0;
let b2ObjectsReverified = 1;
let auditMode = "";

if (proof?.schema === BUNDLE_PROOF_SCHEMA) {
  const bundleKey = String(proof?.bundle_key ?? "");
  const bundleSha = String(proof?.bundle_sha256 ?? "").toLowerCase();
  const bundleBytes = Number(proof?.bundle_bytes ?? 0);
  if (
    !/^geomacro-evidence\/v1\/live\/country-gro\/bundles\/[a-f0-9]{64}\.json\.gz$/.test(bundleKey) ||
    !/^[a-f0-9]{64}$/.test(bundleSha) ||
    !Number.isInteger(bundleBytes) ||
    bundleBytes <= 0 ||
    bundleBytes > MAX_BUNDLE_BYTES ||
    proof?.full_b2_bundle_readback_verified !== true ||
    proof?.all_member_hashes_verified !== true ||
    proof?.all_member_signatures_verified !== true ||
    !Array.isArray(proof?.members) ||
    proof.members.length !== Number(proof?.countries_published ?? -1)
  ) {
    throw new Error("B2_COUNTRY_GRO_PRESERVATION_BUNDLE_PROOF_INVALID");
  }

  const packed = await b2.get(bundleKey);
  b2ObjectsReverified += 1;
  if (packed.length !== bundleBytes || sha256(packed) !== bundleSha) {
    throw new Error("B2_COUNTRY_GRO_PRESERVATION_BUNDLE_HASH_INVALID");
  }

  const bundle = JSON.parse(
    gunzipSync(packed, { maxOutputLength: MAX_BUNDLE_RAW_BYTES }).toString("utf8"),
  );
  if (
    bundle?.schema !== BUNDLE_SCHEMA ||
    bundle?.source_project !== SOURCE_PROJECT ||
    bundle?.generated_at !== proof.generated_at ||
    !Array.isArray(bundle?.members) ||
    bundle.members.length !== proof.members.length
  ) {
    throw new Error("B2_COUNTRY_GRO_PRESERVATION_BUNDLE_INVALID");
  }

  const proofById = new Map(
    proof.members.map((member: any) => [
      String(member?.object_id ?? ""),
      {
        country_iso3: String(member?.country_iso3 ?? ""),
        record_sha256: String(member?.record_sha256 ?? ""),
      },
    ]),
  );
  const countries = new Set<string>();
  for (const member of bundle.members) {
    const countryIso3 = String(member?.country_iso3 ?? "");
    const objectId = String(member?.object_id ?? "");
    const recordSha = String(member?.record_sha256 ?? "");
    const object = member?.object;
    const expected = proofById.get(objectId) as
      | { country_iso3: string; record_sha256: string }
      | undefined;
    if (
      !/^[A-Z]{3}$/.test(countryIso3) ||
      !/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(objectId) ||
      !/^[a-f0-9]{64}$/.test(recordSha) ||
      !expected ||
      expected.country_iso3 !== countryIso3 ||
      expected.record_sha256 !== recordSha ||
      object?.object_id !== objectId ||
      object?.subject?.type !== "country" ||
      object?.subject?.id !== countryIso3 ||
      object?.verification?.status !== "VERIFIED" ||
      object?.commercial_eligibility?.status !== "VERIFIED" ||
      sha256(canonicalRiskObjectJson(object)) !== recordSha ||
      !verifyRiskObjectSignature(object).valid
    ) {
      throw new Error(`B2_COUNTRY_GRO_PRESERVATION_BUNDLE_MEMBER_INVALID:${countryIso3 || "missing"}`);
    }
    if (countries.has(countryIso3)) {
      throw new Error(`B2_COUNTRY_GRO_PRESERVATION_BUNDLE_DUPLICATE:${countryIso3}`);
    }
    countries.add(countryIso3);
  }

  countriesPreserved = countries.size;
  auditMode = "single-bundle-full-member-integrity";
} else if (proof?.schema === LEGACY_PROOF_SCHEMA) {
  if (
    !Array.isArray(proof?.entries) ||
    proof.entries.length < 2 ||
    Number(proof?.countries_published ?? 0) < 1
  ) {
    throw new Error("B2_COUNTRY_GRO_PRESERVATION_LEGACY_PROOF_INVALID");
  }

  const latestEntries = proof.entries
    .filter((entry: any) =>
      /^geomacro-evidence\/v1\/live\/country-gro\/[A-Z]{3}\/latest\.json\.gz$/.test(
        String(entry?.key ?? ""),
      ),
    )
    .sort((a: any, b: any) => String(a.key).localeCompare(String(b.key)));
  if (!latestEntries.length) {
    throw new Error("B2_COUNTRY_GRO_PRESERVATION_LEGACY_LATEST_MISSING");
  }

  // Legacy v1 stored two B2 objects per country. Re-reading the entire set every
  // hour was the Class-B amplification bug. Rotate one country per UTC hour and
  // verify both of its v1 mirrors. The preserved proof never advances freshness,
  // and customer reads still verify the exact signed object they consume.
  const hourNumber = Math.floor(Date.now() / 3_600_000);
  const latest = latestEntries[hourNumber % latestEntries.length];
  const expectedObjectId = String(latest?.object_id ?? "");
  const byId = proof.entries.find(
    (entry: any) =>
      String(entry?.object_id ?? "") === expectedObjectId &&
      /^geomacro-evidence\/v1\/live\/country-gro\/by-id\/gro_country_[A-Z]{3}_[A-Za-z0-9]+\.json\.gz$/.test(
        String(entry?.key ?? ""),
      ),
  );
  if (!byId) throw new Error("B2_COUNTRY_GRO_PRESERVATION_LEGACY_PAIR_MISSING");

  const sample = [latest, byId];
  const sampledCountries = new Set<string>();
  for (const entry of sample) {
    const key = String(entry?.key ?? "");
    const expectedSha = String(entry?.sha256 ?? "").toLowerCase();
    const expectedBytes = Number(entry?.bytes ?? 0);
    const objectId = String(entry?.object_id ?? "");
    if (
      !/^[a-f0-9]{64}$/.test(expectedSha) ||
      !Number.isInteger(expectedBytes) ||
      expectedBytes <= 0 ||
      expectedBytes > MAX_OBJECT_BYTES ||
      !/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(objectId)
    ) {
      throw new Error(`B2_COUNTRY_GRO_PRESERVATION_LEGACY_ENTRY_INVALID:${key || "missing"}`);
    }

    const compressed = await b2.get(key);
    b2ObjectsReverified += 1;
    if (compressed.length !== expectedBytes || sha256(compressed) !== expectedSha) {
      throw new Error(`B2_COUNTRY_GRO_PRESERVATION_LEGACY_HASH_INVALID:${key}`);
    }
    const restored = JSON.parse(
      gunzipSync(compressed, { maxOutputLength: 4_000_000 }).toString("utf8"),
    );
    const object = restored?.object;
    if (
      restored?.schema !== LEGACY_ENVELOPE_SCHEMA ||
      restored?.source_project !== SOURCE_PROJECT ||
      !/^[A-Z]{3}$/.test(String(restored?.country_iso3 ?? "")) ||
      object?.object_id !== objectId ||
      object?.subject?.type !== "country" ||
      object?.subject?.id !== restored.country_iso3 ||
      object?.verification?.status !== "VERIFIED" ||
      object?.commercial_eligibility?.status !== "VERIFIED" ||
      !verifyRiskObjectSignature(object).valid
    ) {
      throw new Error(`B2_COUNTRY_GRO_PRESERVATION_LEGACY_RESTORE_INVALID:${key}`);
    }
    sampledCountries.add(restored.country_iso3);
  }

  countriesPreserved = Number(proof.countries_published ?? sampledCountries.size);
  auditMode = "rotating-bounded-legacy-pair";
} else {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_PROOF_SCHEMA_UNSUPPORTED");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-preservation.v2",
  maintenance_mode: "verified_preserved_country_gro_noop",
  reason: "no_new_commercially_verified_country_gro",
  proof_schema: proof.schema,
  proof_generated_at: proof.generated_at,
  countries_preserved: countriesPreserved,
  audit_mode: auditMode,
  b2_objects_reverified: b2ObjectsReverified,
  max_b2_gets_per_preservation_cycle: proof.schema === LEGACY_PROOF_SCHEMA ? 3 : 2,
  wrote_new_snapshot: false,
  freshness_advanced: false,
  payment_performed: false,
  execution_authorized: false,
  destructive_change: false,
  b2: b2.usage(),
}));
