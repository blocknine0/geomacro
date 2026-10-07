import type { GeomacroRiskObject } from "./risk-object-contract";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
} from "./risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
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

type Config = { accessKey: string; secretKey: string; role: "read" | "primary" };
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

async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, encoder.encode(value)),
  );
}

function config(): Config[] | null {
  if (typeof window !== "undefined" || typeof process === "undefined") return null;
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  const dedicatedAccessKey = String(process.env.B2_ARCHIVE_READ_KEY_ID ?? "").trim();
  const dedicatedSecretKey = String(process.env.B2_ARCHIVE_READ_APPLICATION_KEY ?? "").trim();
  const primaryAccessKey = String(process.env.B2_KEY_ID ?? "").trim();
  const primarySecretKey = String(process.env.B2_APPLICATION_KEY ?? "").trim();
  if (Boolean(dedicatedAccessKey) !== Boolean(dedicatedSecretKey)) return null;
  if (Boolean(primaryAccessKey) !== Boolean(primarySecretKey)) return null;
  if (endpoint !== B2_ENDPOINT) return null;

  const candidates: Config[] = [];
  if (dedicatedAccessKey && dedicatedSecretKey) {
    candidates.push({ accessKey: dedicatedAccessKey, secretKey: dedicatedSecretKey, role: "read" });
  }
  if (
    primaryAccessKey &&
    primarySecretKey &&
    (primaryAccessKey !== dedicatedAccessKey || primarySecretKey !== dedicatedSecretKey)
  ) {
    candidates.push({ accessKey: primaryAccessKey, secretKey: primarySecretKey, role: "primary" });
  }
  return candidates.length > 0 ? candidates : null;
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
  const candidates = config();
  if (!candidates || !allowedKey(key)) return null;

  const path = `/${[B2_BUCKET, ...key.split("/")].map(encodeURIComponent).join("/")}`;
  const host = new URL(B2_ENDPOINT).host;
  for (let index = 0; index < candidates.length; index += 1) {
    const cfg = candidates[index];
    try {
      const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const day = timestamp.slice(0, 8);
      const emptyHash = await sha256("");
      const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
      const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${timestamp}\n`;
      const canonical = ["GET", path, "", canonicalHeaders, signedHeaders, emptyHash].join("\n");
      const scope = `${day}/us-east-005/s3/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, await sha256(canonical)].join("\n");
      const signingKey = await hmac(
        await hmac(
          await hmac(await hmac(`AWS4${cfg.secretKey}`, day), "us-east-005"),
          "s3",
        ),
        "aws4_request",
      );
      const signature = hex(await hmac(signingKey, stringToSign));
      const response = await fetch(`${B2_ENDPOINT}${path}`, {
        method: "GET",
        headers: {
          "x-amz-content-sha256": emptyHash,
          "x-amz-date": timestamp,
          Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        if (response.status === 403 && index < candidates.length - 1) continue;
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) return null;
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, bytes });
      return bytes;
    } catch {
      if (index < candidates.length - 1) continue;
      return null;
    }
  }
  return null;
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
