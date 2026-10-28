import { createPerKeySingleFlight } from "./b2-single-flight";
import { reservePrivateB2Read } from "./b2-live.server";
import type {
  StructuralCoverage,
  StructuralObservation,
} from "./structural-context.server";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_PREFIX = "geomacro-evidence/v1/structural/serving";
const SNAPSHOT_KEY = `${LIVE_PREFIX}/latest.json.gz`;
const PROOF_KEY = `${LIVE_PREFIX}/latest-proof.json`;
const HISTORICAL_PROJECT_REF = "nqvpcbnnvjsrlvyxxevk";
const MAX_COMPRESSED_BYTES = 12_000_000;
const MAX_DECOMPRESSED_BYTES = 40_000_000;
const REQUEST_TIMEOUT_MS = 3_500;
// A pair of SHA-bound, immutable-in-request original bytes are reused within
// one server isolate for at most 15 minutes. Full proof validation, expiry,
// source identity and country rights gates below still run on EVERY read.
// This increases effective queries/GET without raising any provider cap.
const CACHE_TTL_MS = 15 * 60_000;
const PROVIDER_TRANSIENT_BACKOFF_MS = 15 * 60_000;
let providerQuotaCooldownUntil = 0;
export function structuralB2ProviderDenialPolicy(
  status: number, errorBody: string, nowMs: number,
): { providerHardCap: boolean; cooldownUntil: number; mayTryOtherCredential: boolean } {
  if (!Number.isFinite(nowMs)) throw Error("STRUCTURAL_PROVIDER_CLOCK_INVALID");
  const hardCap = status === 403 &&
    /(?:transaction_cap_exceeded|download_cap_exceeded)/i.test(errorBody.slice(0,4096));
  const nextUtc = Date.UTC(new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),new Date(nowMs).getUTCDate()+1);
  return {
    providerHardCap: hardCap,
    cooldownUntil: hardCap ? nextUtc
      : status === 429 ? nowMs + PROVIDER_TRANSIENT_BACKOFF_MS : 0,
    mayTryOtherCredential: status === 403 && !hardCap,
  };
}
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
export const STRUCTURAL_B2_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type B2Config = { accessKey: string; secretKey: string; role: "read" | "primary" };
type CacheEntry = { expiresAt: number; bytes: Uint8Array };
const cache = new Map<string, CacheEntry>();
// Collapse concurrent buyer preflight reads into a single account-governed B2
// request per key, without extending cache lifetime or overriding freshness.
const shareStructuralB2Read = createPerKeySingleFlight<string, Uint8Array | null>();
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
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))));
}

async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : Uint8Array.from(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", imported, encoder.encode(value)),
  );
}

function config(): B2Config[] | null {
  if (typeof window !== "undefined" || typeof process === "undefined") return null;
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  const dedicatedAccessKey = String(
    process.env.B2_ARCHIVE_READ_KEY_ID ?? "",
  ).trim();
  const dedicatedSecretKey = String(
    process.env.B2_ARCHIVE_READ_APPLICATION_KEY ?? "",
  ).trim();
  const primaryAccessKey = String(process.env.B2_KEY_ID ?? "").trim();
  const primarySecretKey = String(process.env.B2_APPLICATION_KEY ?? "").trim();
  if (Boolean(dedicatedAccessKey) !== Boolean(dedicatedSecretKey)) return null;
  if (Boolean(primaryAccessKey) !== Boolean(primarySecretKey)) return null;
  if (endpoint !== B2_ENDPOINT) return null;

  const candidates: B2Config[] = [];
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

async function signedGet(key: string): Promise<Uint8Array | null> {
  return shareStructuralB2Read(key, () => signedGetOnce(key));
}

async function signedGetOnce(key: string): Promise<Uint8Array | null> {
  const candidates = config();
  if (!candidates || circuitOpen() || providerQuotaCooldownUntil > Date.now()) return null;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;

  const path = `/${[B2_BUCKET, ...key.split("/")].map(encodeURIComponent).join("/")}`;
  const host = new URL(B2_ENDPOINT).host;
  for (let index = 0; index < candidates.length; index++) {
    const cfg = candidates[index];
    // One durable D1 reservation for EVERY attempted B2 Class-B GET,
    // including a secondary credential retry. A missing/failed ticket blocks
    // the network call even if a local credential and HTTP endpoint exist.
    if (!(await reservePrivateB2Read(key))) return null;
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
        // An account-wide provider cap cannot be evaded using a second
        // credential on that SAME account. Avoid wasting the next D1 ticket.
        if (response.status === 403 || response.status === 429) {
          const message=(await response.text().catch(()=>"")).slice(0,4096);
          const policy=structuralB2ProviderDenialPolicy(response.status,message,Date.now());
          providerQuotaCooldownUntil=Math.max(
            providerQuotaCooldownUntil,policy.cooldownUntil);
          if(policy.providerHardCap) { noteFailure(); return null; }
          if(policy.mayTryOtherCredential && index<candidates.length-1)continue;
        }
        noteFailure();
        return null;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) {
        noteFailure();
        return null;
      }
      noteSuccess();
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, bytes });
      return bytes;
    } catch {
      if (index < candidates.length - 1) continue;
      noteFailure();
      return null;
    }
  }
  noteFailure();
  return null;
}

async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
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

/** Proof-level country identity: country profiles may not contain foreign
 * observations even if every record is otherwise individually well-formed. */
export function verifiedStructuralCountryProfileRows(
  countryIso3: unknown,
  rows: unknown,
): rows is StructuralObservation[] {
  return iso3(countryIso3) &&
    Array.isArray(rows) &&
    rows.length <= 250 &&
    rows.every((item) => observation(item) && item.country_iso3 === countryIso3);
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
  const [compressed, proofBytes] = await Promise.all([
    signedGet(SNAPSHOT_KEY),
    signedGet(PROOF_KEY),
  ]);
  if (!compressed || !proofBytes) return null;
  try {
    const proof = JSON.parse(decoder.decode(proofBytes)) as Record<string, unknown>;
    if (
      proof.schema !== "geomacro.structural-serving-snapshot-proof.v2" ||
      proof.source_project !== HISTORICAL_PROJECT_REF ||
      proof.snapshot_key !== SNAPSHOT_KEY ||
      !recentEnough(proof.generated_at) ||
      !/^[a-f0-9]{64}$/i.test(String(proof.compressed_sha256 ?? "")) ||
      Number(proof.compressed_bytes) !== compressed.length ||
      (await sha256(compressed)) !== String(proof.compressed_sha256)
    ) return null;

    const raw = await gunzip(compressed);
    const payload = JSON.parse(decoder.decode(raw)) as Record<string, unknown>;
    if (
      payload.schema !== "geomacro.structural-serving-snapshot.v1" ||
      payload.source_project !== HISTORICAL_PROJECT_REF ||
      payload.generated_at !== proof.generated_at ||
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
      // The archive's compressed SHA is necessary but not sufficient:
      // every source observation must be bound to this exact country.
      if (!verifiedStructuralCountryProfileRows(
        row.country_iso3, row.latest_observations
      )) return null;
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
