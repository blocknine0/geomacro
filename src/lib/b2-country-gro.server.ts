import type { GeomacroRiskObject } from "./risk-object-contract";
import { verifyRiskObjectSignature } from "./risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const SCHEMA = "geomacro.country-gro-continuity.v1";
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_COMPRESSED_BYTES = 2_000_000;
const MAX_DECOMPRESSED_BYTES = 4_000_000;
const CACHE_TTL_MS = 60_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Config = { accessKey: string; secretKey: string };
type CacheEntry = { expiresAt: number; bytes: Uint8Array };
type CountryGroEnvelope = {
  schema: string;
  published_at: string;
  source_project: string;
  country_iso3: string;
  object: GeomacroRiskObject;
};

const cache = new Map<string, CacheEntry>();

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

function config(): Config | null {
  if (typeof window !== "undefined" || typeof process === "undefined") return null;
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  const accessKey = String(process.env.B2_KEY_ID ?? "").trim();
  const secretKey = String(process.env.B2_APPLICATION_KEY ?? "").trim();
  if (endpoint !== B2_ENDPOINT || !accessKey || !secretKey) return null;
  return { accessKey, secretKey };
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

async function signedGet(key: string): Promise<Uint8Array | null> {
  const cfg = config();
  if (!cfg || !allowedKey(key)) return null;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;

  const path = `/${[B2_BUCKET, ...key.split("/")].map(encodeURIComponent).join("/")}`;
  const host = new URL(B2_ENDPOINT).host;
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
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) return null;
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, bytes });
    return bytes;
  } catch {
    return null;
  }
}

async function readEnvelope(key: string): Promise<CountryGroEnvelope | null> {
  const compressed = await signedGet(key);
  if (!compressed) return null;
  try {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const raw = new Uint8Array(await new Response(stream).arrayBuffer());
    if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) return null;
    const payload = JSON.parse(decoder.decode(raw)) as Partial<CountryGroEnvelope>;
    if (
      payload.schema !== SCHEMA ||
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
  envelope: CountryGroEnvelope,
  expectedIso3: string,
  atOrBefore?: string,
): GeomacroRiskObject | null {
  const object = envelope.object;
  if (
    envelope.country_iso3 !== expectedIso3 ||
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

export async function readB2LatestCanonicalCountryGro(
  countryIso3: string,
  atOrBefore: string,
): Promise<GeomacroRiskObject | null> {
  const iso3 = countryIso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) return null;
  const envelope = await readEnvelope(countryKey(iso3));
  if (!envelope) return null;
  return validateObject(envelope, iso3, atOrBefore);
}

export async function readB2CountryGroByObjectId(
  objectId: string,
): Promise<GeomacroRiskObject | null> {
  const key = objectKey(objectId);
  if (!key) return null;
  const envelope = await readEnvelope(key);
  if (!envelope || envelope.object.object_id !== objectId) return null;
  return validateObject(envelope, envelope.country_iso3);
}
