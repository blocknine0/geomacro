import type {
  StructuralCoverage,
  StructuralObservation,
} from "./structural-context.server";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const B2_KEY = "geomacro-evidence/v1/structural/serving/latest.json.gz";
const HISTORICAL_PROJECT_REF = "nqvpcbnnvjsrlvyxxevk";
const MAX_COMPRESSED_BYTES = 12_000_000;
const MAX_DECOMPRESSED_BYTES = 40_000_000;
const REQUEST_TIMEOUT_MS = 3_500;
const CACHE_TTL_MS = 120_000;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
export const STRUCTURAL_B2_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type B2Config = { accessKey: string; secretKey: string };
type CacheEntry = { expiresAt: number; bytes: Uint8Array };
const cache = new Map<string, CacheEntry>();
let failureCount = 0;
let circuitOpenedAt = 0;

export type B2StructuralCountryProfile = {
  country_iso3: string;
  latest_observations: StructuralObservation[];
};

export type B2StructuralServingSnapshot = {
  generated_at: string;
  country_profiles: B2StructuralCountryProfile[];
  coverage: StructuralCoverage[];
  direct_observations: StructuralObservation[];
};

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

function config(): B2Config | null {
  if (typeof window !== "undefined" || typeof process === "undefined") return null;
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  const accessKey = String(process.env.B2_KEY_ID ?? "").trim();
  const secretKey = String(process.env.B2_APPLICATION_KEY ?? "").trim();
  if (endpoint !== B2_ENDPOINT || !accessKey || !secretKey) return null;
  return { accessKey, secretKey };
}

function circuitOpen(now = Date.now()) {
  if (!circuitOpenedAt) return false;
  if (now - circuitOpenedAt >= CIRCUIT_OPEN_MS) {
    circuitOpenedAt = 0;
    failureCount = 0;
    return false;
  }
  return true;
}

function noteSuccess() {
  failureCount = 0;
  circuitOpenedAt = 0;
}

function noteFailure() {
  failureCount += 1;
  if (failureCount >= FAILURE_THRESHOLD && !circuitOpenedAt) circuitOpenedAt = Date.now();
}

async function signedGet(): Promise<Uint8Array | null> {
  const cfg = config();
  if (!cfg || circuitOpen()) return null;
  const cached = cache.get(B2_KEY);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;

  const path = `/${[B2_BUCKET, ...B2_KEY.split("/")].map(encodeURIComponent).join("/")}`;
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
    if (!response.ok) {
      noteFailure();
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) {
      noteFailure();
      return null;
    }
    noteSuccess();
    cache.set(B2_KEY, { expiresAt: Date.now() + CACHE_TTL_MS, bytes });
    return bytes;
  } catch {
    noteFailure();
    return null;
  }
}

async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) {
    throw new Error("B2_STRUCTURAL_DECOMPRESSED_SIZE_INVALID");
  }
  return raw;
}

function recentEnough(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return (
    Number.isFinite(parsed) &&
    parsed <= Date.now() + 5 * 60_000 &&
    Date.now() - parsed <= STRUCTURAL_B2_MAX_AGE_MS
  );
}

function iso3(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function observation(value: unknown): value is StructuralObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.observation_id === "string" &&
    row.observation_id.length > 0 &&
    typeof row.source_id === "string" &&
    row.source_id.length > 0 &&
    typeof row.dimension === "string" &&
    row.dimension.length > 0 &&
    typeof row.metric === "string" &&
    row.metric.length > 0 &&
    typeof row.normalized_hash === "string" &&
    /^[a-f0-9]{64}$/i.test(row.normalized_hash) &&
    (row.country_iso3 === null || iso3(row.country_iso3)) &&
    (row.partner_country_iso3 === null || iso3(row.partner_country_iso3))
  );
}

function coverageRow(value: unknown): value is StructuralCoverage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.source_id === "string" &&
    row.source_id.length > 0 &&
    typeof row.dimension === "string" &&
    row.dimension.length > 0 &&
    iso3(row.country_iso3) &&
    Number.isInteger(Number(row.coverage_year)) &&
    typeof row.coverage_status === "string" &&
    Number.isFinite(Number(row.observation_count)) &&
    typeof row.updated_at === "string"
  );
}

export async function readB2StructuralServingSnapshot(): Promise<B2StructuralServingSnapshot | null> {
  const compressed = await signedGet();
  if (!compressed) return null;
  try {
    const raw = await gunzip(compressed);
    const payload = JSON.parse(decoder.decode(raw)) as Record<string, unknown>;
    if (
      payload.schema !== "geomacro.structural-serving-snapshot.v1" ||
      payload.source_project !== HISTORICAL_PROJECT_REF ||
      !recentEnough(payload.generated_at) ||
      !Array.isArray(payload.country_profiles) ||
      payload.country_profiles.length === 0 ||
      payload.country_profiles.length > 500 ||
      !Array.isArray(payload.coverage) ||
      payload.coverage.length > 20_000 ||
      !Array.isArray(payload.direct_observations) ||
      payload.direct_observations.length > 20_000
    ) return null;

    const seenCountries = new Set<string>();
    const countryProfiles: B2StructuralCountryProfile[] = [];
    for (const value of payload.country_profiles) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const row = value as Record<string, unknown>;
      if (!iso3(row.country_iso3) || seenCountries.has(row.country_iso3)) return null;
      if (!Array.isArray(row.latest_observations) || row.latest_observations.length > 250) return null;
      if (!row.latest_observations.every(observation)) return null;
      seenCountries.add(row.country_iso3);
      countryProfiles.push({
        country_iso3: row.country_iso3,
        latest_observations: row.latest_observations,
      });
    }

    if (!payload.coverage.every(coverageRow)) return null;
    if (!payload.direct_observations.every(observation)) return null;
    for (const row of payload.direct_observations as StructuralObservation[]) {
      if (!iso3(row.country_iso3) || !iso3(row.partner_country_iso3) || row.country_iso3 === row.partner_country_iso3) {
        return null;
      }
    }

    return {
      generated_at: String(payload.generated_at),
      country_profiles: countryProfiles,
      coverage: payload.coverage as StructuralCoverage[],
      direct_observations: payload.direct_observations as StructuralObservation[],
    };
  } catch {
    return null;
  }
}
