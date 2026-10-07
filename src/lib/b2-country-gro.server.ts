import type { GeomacroRiskObject } from "./risk-object-contract";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
} from "./risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";
import {
  b2PrivateArchiveReadConfigured,
  readPrivateB2Object,
} from "./b2-private-archive-read.server";

const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const LEGACY_SCHEMA = "geomacro.country-gro-continuity.v1";
const BUNDLE_SCHEMA = "geomacro.country-gro-bundle.v2";
const PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v2";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 192 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type CacheEntry = { expiresAt: number; bytes: Uint8Array };
type CountryGroEnvelope = {
  schema: string;
  published_at: string;
  source_project: string;
  country_iso3: string;
  object: GeomacroRiskObject;
};
type BundleMember = {
  country_iso3: string;
  object_id: string;
  record_sha256: string;
  object: GeomacroRiskObject;
};
type BundleState = {
  expiresAt: number;
  generatedAt: string;
  byCountry: Map<string, BundleMember>;
  byObjectId: Map<string, BundleMember>;
};

const cache = new Map<string, CacheEntry>();
const inFlightGets = new Map<string, Promise<Uint8Array | null>>();
let bundleState: BundleState | null = null;
let inFlightBundle: Promise<BundleState | null> | null = null;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function countryKey(iso3: string) {
  return `geomacro-evidence/v1/live/country-gro/${iso3}/latest.json.gz`;
}

function objectKey(objectId: string) {
  if (!/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(objectId)) return null;
  return `geomacro-evidence/v1/live/country-gro/by-id/${objectId}.json.gz`;
}

function allowedKey(key: string) {
  return /^geomacro-evidence\/v1\/live\/country-gro\/[A-Za-z0-9_./-]+$/.test(key) && !key.includes("..");
}

async function signedGetUncached(key: string): Promise<Uint8Array | null> {
  if (!allowedKey(key) || !b2PrivateArchiveReadConfigured()) return null;
  try {
    const bytes = await readPrivateB2Object(key, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_COMPRESSED_BYTES,
    });
    if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) return null;
    const value = new Uint8Array(bytes);
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, bytes: value });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Provider hard caps are a fail-closed commercial condition. Do not hide
    // them as a cache miss and silently fall through to another data authority.
    if (
      message === "B2_DOWNLOAD_CAP_EXCEEDED" ||
      message === "B2_TRANSACTION_CAP_EXCEEDED"
    ) {
      throw error;
    }
    return null;
  }
}

async function signedGet(key: string): Promise<Uint8Array | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;
  const inFlight = inFlightGets.get(key);
  if (inFlight) return inFlight;
  const promise = signedGetUncached(key).finally(() => inFlightGets.delete(key));
  inFlightGets.set(key, promise);
  return promise;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) {
    throw new Error("B2_COUNTRY_GRO_DECOMPRESSED_SIZE_INVALID");
  }
  return raw;
}

async function readLegacyEnvelope(key: string): Promise<CountryGroEnvelope | null> {
  const compressed = await signedGet(key);
  if (!compressed) return null;
  try {
    const raw = await gunzip(compressed);
    const payload = JSON.parse(decoder.decode(raw)) as Partial<CountryGroEnvelope>;
    if (
      payload.schema !== LEGACY_SCHEMA ||
      payload.source_project !== SOURCE_PROJECT ||
      !/^[A-Z]{3}$/.test(String(payload.country_iso3 ?? "")) ||
      !payload.object ||
      typeof payload.object !== "object"
    ) return null;
    return payload as CountryGroEnvelope;
  } catch {
    return null;
  }
}

function validateObject(
  object: GeomacroRiskObject,
  expectedIso3: string,
  atOrBefore?: string,
): GeomacroRiskObject | null {
  if (
    object.subject?.type !== "country" ||
    object.subject?.id !== expectedIso3 ||
    object.object_id !== String(object.object_id ?? "") ||
    !verifyRiskObjectSignature(object).valid
  ) return null;

  if (atOrBefore) {
    const boundaryMs = Date.parse(atOrBefore);
    const generatedMs = Date.parse(object.generated_at);
    if (!Number.isFinite(boundaryMs) || !Number.isFinite(generatedMs) || generatedMs > boundaryMs) return null;
    if (!verifyCommercialRiskObjectArtifact(object, { now: new Date(boundaryMs) }).deliverable) return null;
  }
  return object;
}

async function loadBundleV2Uncached(): Promise<BundleState | null> {
  const proofBytes = await signedGet(PROOF_KEY);
  if (!proofBytes) return null;

  let proof: any;
  try {
    proof = JSON.parse(decoder.decode(proofBytes));
  } catch {
    return null;
  }
  if (proof?.schema !== PROOF_SCHEMA) return null;

  const bundleKey = String(proof?.bundle_key ?? "");
  const bundleSha = String(proof?.bundle_sha256 ?? "").toLowerCase();
  const bundleBytes = Number(proof?.bundle_bytes ?? 0);
  if (
    !/^geomacro-evidence\/v1\/live\/country-gro\/bundles\/[a-f0-9]{64}\.json\.gz$/.test(bundleKey) ||
    !/^[a-f0-9]{64}$/.test(bundleSha) ||
    !Number.isInteger(bundleBytes) ||
    bundleBytes <= 0 ||
    bundleBytes > MAX_COMPRESSED_BYTES ||
    proof?.source_project !== SOURCE_PROJECT ||
    proof?.full_b2_bundle_readback_verified !== true ||
    proof?.all_member_hashes_verified !== true ||
    proof?.all_member_signatures_verified !== true ||
    !Array.isArray(proof?.members)
  ) return null;

  const packed = await signedGet(bundleKey);
  if (!packed || packed.length !== bundleBytes || await sha256(packed) !== bundleSha) return null;

  let bundle: any;
  try {
    bundle = JSON.parse(decoder.decode(await gunzip(packed)));
  } catch {
    return null;
  }
  if (
    bundle?.schema !== BUNDLE_SCHEMA ||
    bundle?.source_project !== SOURCE_PROJECT ||
    bundle?.generated_at !== proof?.generated_at ||
    !Array.isArray(bundle?.members) ||
    bundle.members.length !== Number(proof?.countries_published ?? -1) ||
    bundle.members.length !== proof.members.length
  ) return null;

  const proofById = new Map(
    proof.members.map((member: any) => [
      String(member?.object_id ?? ""),
      {
        country_iso3: String(member?.country_iso3 ?? ""),
        record_sha256: String(member?.record_sha256 ?? ""),
      },
    ]),
  );
  const byCountry = new Map<string, BundleMember>();
  const byObjectId = new Map<string, BundleMember>();

  for (const value of bundle.members as BundleMember[]) {
    const countryIso3 = String(value?.country_iso3 ?? "");
    const objectId = String(value?.object_id ?? "");
    const recordSha = String(value?.record_sha256 ?? "");
    const object = value?.object;
    const proofMember = proofById.get(objectId);
    if (
      !/^[A-Z]{3}$/.test(countryIso3) ||
      !/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(objectId) ||
      !/^[a-f0-9]{64}$/.test(recordSha) ||
      !object ||
      object.object_id !== objectId ||
      object.subject?.type !== "country" ||
      object.subject?.id !== countryIso3 ||
      object.verification?.status !== "VERIFIED" ||
      object.commercial_eligibility?.status !== "VERIFIED" ||
      !proofMember ||
      proofMember.country_iso3 !== countryIso3 ||
      proofMember.record_sha256 !== recordSha ||
      await sha256(canonicalRiskObjectJson(object)) !== recordSha ||
      !verifyRiskObjectSignature(object).valid ||
      byCountry.has(countryIso3) ||
      byObjectId.has(objectId)
    ) return null;

    byCountry.set(countryIso3, value);
    byObjectId.set(objectId, value);
  }

  if (
    byCountry.size !== bundle.members.length ||
    byObjectId.size !== bundle.members.length
  ) return null;

  return {
    expiresAt: Date.now() + CACHE_TTL_MS,
    generatedAt: String(bundle.generated_at ?? ""),
    byCountry,
    byObjectId,
  };
}

async function loadBundleV2(): Promise<BundleState | null> {
  if (bundleState && bundleState.expiresAt > Date.now()) return bundleState;
  if (inFlightBundle) return inFlightBundle;
  inFlightBundle = loadBundleV2Uncached()
    .then((state) => {
      if (state) bundleState = state;
      return state;
    })
    .finally(() => {
      inFlightBundle = null;
    });
  return inFlightBundle;
}

export async function readB2LatestCanonicalCountryGro(
  countryIso3: string,
  atOrBefore: string,
): Promise<GeomacroRiskObject | null> {
  const iso3 = countryIso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) return null;

  const bundle = await loadBundleV2();
  const bundled = bundle?.byCountry.get(iso3)?.object;
  if (bundled) return validateObject(bundled, iso3, atOrBefore);

  const envelope = await readLegacyEnvelope(countryKey(iso3));
  if (!envelope || envelope.country_iso3 !== iso3) return null;
  return validateObject(envelope.object, iso3, atOrBefore);
}

export async function readB2CountryGroByObjectId(
  objectId: string,
): Promise<GeomacroRiskObject | null> {
  if (!/^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/.test(objectId)) return null;

  const bundle = await loadBundleV2();
  const member = bundle?.byObjectId.get(objectId);
  if (member) return validateObject(member.object, member.country_iso3);

  const key = objectKey(objectId);
  if (!key) return null;
  const envelope = await readLegacyEnvelope(key);
  if (!envelope || envelope.object.object_id !== objectId) return null;
  return validateObject(envelope.object, envelope.country_iso3);
}
