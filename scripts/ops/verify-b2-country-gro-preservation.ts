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
const HASH_RE = /^[a-f0-9]{64}$/;
const OBJECT_ID_RE = /^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/;
const LATEST_RE = /^geomacro-evidence\/v1\/live\/country-gro\/([A-Z]{3})\/latest\.json\.gz$/;
const BY_ID_RE = /^geomacro-evidence\/v1\/live\/country-gro\/by-id\/(gro_country_[A-Z]{3}_[A-Za-z0-9]+)\.json\.gz$/;

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
  !Number.isInteger(Number(proof?.countries_published)) ||
  Number(proof?.countries_published) < 1
) {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_PROOF_INVALID");
}

type Entry = {
  key: string;
  sha256: string;
  bytes: number;
  object_id: string;
  country_iso3: string | null;
  kind: "latest" | "by-id";
};

const entries: Entry[] = [];
const latestByCountry = new Map<string, Entry>();
const byIdByObject = new Map<string, Entry>();

for (const value of proof.entries) {
  const key = String(value?.key ?? "");
  const expectedSha = String(value?.sha256 ?? "").toLowerCase();
  const expectedBytes = Number(value?.bytes ?? 0);
  const expectedObjectId = String(value?.object_id ?? "");
  const latestMatch = key.match(LATEST_RE);
  const byIdMatch = key.match(BY_ID_RE);

  if (
    (!latestMatch && !byIdMatch) ||
    !HASH_RE.test(expectedSha) ||
    !Number.isInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    expectedBytes > MAX_OBJECT_BYTES ||
    !OBJECT_ID_RE.test(expectedObjectId) ||
    (byIdMatch && byIdMatch[1] !== expectedObjectId)
  ) {
    throw new Error(`B2_COUNTRY_GRO_PRESERVATION_ENTRY_INVALID:${key || "missing"}`);
  }

  const entry: Entry = {
    key,
    sha256: expectedSha,
    bytes: expectedBytes,
    object_id: expectedObjectId,
    country_iso3: latestMatch?.[1] ?? null,
    kind: latestMatch ? "latest" : "by-id",
  };
  entries.push(entry);

  if (entry.kind === "latest") {
    const iso3 = entry.country_iso3!;
    if (latestByCountry.has(iso3)) {
      throw new Error(`B2_COUNTRY_GRO_PRESERVATION_DUPLICATE_LATEST:${iso3}`);
    }
    latestByCountry.set(iso3, entry);
  } else {
    if (byIdByObject.has(entry.object_id)) {
      throw new Error(`B2_COUNTRY_GRO_PRESERVATION_DUPLICATE_BY_ID:${entry.object_id}`);
    }
    byIdByObject.set(entry.object_id, entry);
  }
}

const countriesPublished = Number(proof.countries_published);
if (
  latestByCountry.size !== countriesPublished ||
  byIdByObject.size !== countriesPublished ||
  entries.length !== countriesPublished * 2
) {
  throw new Error("B2_COUNTRY_GRO_PRESERVATION_POINTER_SET_INVALID");
}

for (const [iso3, latest] of latestByCountry) {
  const byId = byIdByObject.get(latest.object_id);
  if (!byId || !byId.key.includes(`/by-id/${latest.object_id}.json.gz`)) {
    throw new Error(`B2_COUNTRY_GRO_PRESERVATION_PAIR_MISSING:${iso3}`);
  }
}

// Preservation is a no-mutation path. The package was fully byte/hash/signature
// verified before its proof was published. Re-reading every member on each
// failed refresh needlessly spends hundreds of Class-B transactions without
// increasing deletion safety. Revalidate the proof contract plus one stable,
// deterministic latest/by-id pair. Full readback remains mandatory on new
// publication and before destructive cleanup.
const sampleCountry = [...latestByCountry.keys()].sort()[0];
const sampleLatest = latestByCountry.get(sampleCountry)!;
const sampleById = byIdByObject.get(sampleLatest.object_id)!;

async function verifySample(entry: Entry) {
  const compressed = await b2.get(entry.key);
  if (
    compressed.length !== entry.bytes ||
    sha256(compressed) !== entry.sha256
  ) {
    throw new Error(`B2_COUNTRY_GRO_PRESERVATION_HASH_INVALID:${entry.key}`);
  }

  const restored = JSON.parse(gunzipSync(compressed).toString("utf8"));
  const object = restored?.object;
  if (
    restored?.schema !== ENVELOPE_SCHEMA ||
    restored?.source_project !== SOURCE_PROJECT ||
    restored?.country_iso3 !== sampleCountry ||
    object?.object_id !== entry.object_id ||
    object?.subject?.type !== "country" ||
    object?.subject?.id !== sampleCountry ||
    object?.verification?.status !== "VERIFIED" ||
    object?.commercial_eligibility?.status !== "VERIFIED" ||
    !verifyRiskObjectSignature(object).valid
  ) {
    throw new Error(`B2_COUNTRY_GRO_PRESERVATION_RESTORE_INVALID:${entry.key}`);
  }
}

await verifySample(sampleLatest);
await verifySample(sampleById);

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-preservation.v2",
  maintenance_mode: "verified_preserved_country_gro_noop",
  reason: "no_new_commercially_verified_country_gro",
  proof_generated_at: proof.generated_at,
  countries_preserved: countriesPublished,
  proof_entries_validated: entries.length,
  deterministic_sample_country: sampleCountry,
  deterministic_sample_object_id: sampleLatest.object_id,
  b2_objects_reverified: 3,
  full_package_readback_reused_from_publication_proof: true,
  destructive_change: false,
  wrote_new_snapshot: false,
  freshness_advanced: false,
  payment_performed: false,
  execution_authorized: false,
  b2: b2.usage(),
}));
