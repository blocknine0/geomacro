import type { PublicIntelligenceRow } from "./public-intelligence.functions";
import type { GlobalRisk } from "./global-risk.types";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const CACHE_TTL_MS = 120_000;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_COMPRESSED_BYTES = 12_000_000;
const MAX_DECOMPRESSED_BYTES = 40_000_000;
// Public records carry their own event/snapshot timestamps and the UI labels
// stale-but-verified recovery data explicitly. Keep the last verified public
// package readable for a bounded 30-day continuity window so a paused/restricted
// ingestion database cannot become a customer-facing website outage.
const PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const PUBLIC_RISK_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCE_NETWORK_FALLBACK_MAX_AGE_MS = 90 * 60 * 1000;
// Commercial rights can change independently of evidence freshness. A B2 copy
// is outage continuity only, never an indefinite authorization cache.
export const COMMERCIAL_SOURCE_RIGHTS_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const B2_PUBLIC_INTELLIGENCE_KEY =
  "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
export const B2_PUBLIC_RISK_KEY =
  "geomacro-evidence/v1/live/risk-indices/latest.json.gz";
export const B2_SOURCE_NETWORK_STATUS_KEY =
  "geomacro-evidence/v1/live/source-network-status/latest.json.gz";
export const B2_COMMERCIAL_SOURCE_RIGHTS_KEY =
  "geomacro-evidence/v1/live/commercial-source-rights/latest.json.gz";

export type B2SourceNetworkStatus = {
  source_network_100_complete: boolean;
  gdelt_gal_freshness_complete: boolean;
  source_network_launch_complete: boolean;
};

export type B2CommercialSourceRight = {
  source_id: string;
  category: string | null;
  certification_state: string | null;
  commercial_usage_status: string | null;
  enabled_for_ingestion: boolean;
  enabled_for_commercial_signals: boolean;
  raw_redistribution_allowed: boolean;
  attribution_required: boolean;
  licence_name: string | null;
};

type B2Config = { accessKey: string; secretKey: string };
type CacheEntry = { expiresAt: number; bytes: Uint8Array };

const cache = new Map<string, CacheEntry>();
let failureCount = 0;
let circuitOpenedAt = 0;

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
  // This module is referenced only from server-function handlers, but the
  // TanStack client compiler still traverses imports. Fail closed in a browser
  // build/runtime without importing any Node builtin or exposing secret values.
  if (typeof window !== "undefined" || typeof process === "undefined") return null;
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  const accessKey = String(process.env.B2_KEY_ID ?? "").trim();
  const secretKey = String(process.env.B2_APPLICATION_KEY ?? "").trim();
  if (endpoint !== B2_ENDPOINT || !accessKey || !secretKey) return null;
  return { accessKey, secretKey };
}

export function b2PublicRuntimeConfigured(): boolean {
  return config() !== null;
}

function allowedKey(key: string): boolean {
  return /^geomacro-evidence\/v1\/live\/[A-Za-z0-9_./-]+$/.test(key) && !key.includes("..");
}

function circuitOpen(now = Date.now()): boolean {
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
  const cfg = config();
  if (!cfg || !allowedKey(key) || circuitOpen()) return null;

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
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timestamp,
      scope,
      await sha256(canonical),
    ].join("\n");
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
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, bytes });
    return bytes;
  } catch {
    noteFailure();
    return null;
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) {
    throw new Error("B2_LIVE_DECOMPRESSED_SIZE_INVALID");
  }
  return raw;
}

async function readJsonGzip<T>(key: string): Promise<T | null> {
  const compressed = await signedGet(key);
  if (!compressed) return null;
  try {
    const raw = await gunzip(compressed);
    return JSON.parse(decoder.decode(raw)) as T;
  } catch {
    return null;
  }
}

function recentEnough(value: unknown, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && parsed <= Date.now() + 5 * 60_000 && Date.now() - parsed <= maxAgeMs;
}

export async function readB2PublicIntelligence(): Promise<PublicIntelligenceRow[] | null> {
  const payload = await readJsonGzip<{
    schema?: string;
    generated_at?: string;
    rows?: PublicIntelligenceRow[];
  }>(B2_PUBLIC_INTELLIGENCE_KEY);
  if (
    payload?.schema !== "geomacro.public-intelligence-live.v1" ||
    !recentEnough(payload.generated_at, PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS) ||
    !Array.isArray(payload.rows) ||
    payload.rows.length === 0 ||
    payload.rows.length > 300
  ) return null;
  const categories = new Set(payload.rows.map((row) => String(row.category ?? "").toLowerCase()));
  if (!["geopolitics", "macro", "rare_earth"].every((category) => categories.has(category))) return null;
  return payload.rows;
}

export async function readB2PublicRisk(): Promise<GlobalRisk | null> {
  const payload = await readJsonGzip<{
    schema?: string;
    generated_at?: string;
    data?: GlobalRisk;
  }>(B2_PUBLIC_RISK_KEY);
  if (
    payload?.schema !== "geomacro.public-risk-live.v1" ||
    !recentEnough(payload.generated_at, PUBLIC_RISK_FALLBACK_MAX_AGE_MS) ||
    !payload.data ||
    payload.data.verificationStatus !== "verified" ||
    !/^[a-f0-9]{64}$/.test(String(payload.data.proofHash ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(payload.data.calculationHash ?? ""))
  ) return null;
  return payload.data;
}

export async function readB2SourceNetworkStatus(): Promise<B2SourceNetworkStatus | null> {
  const payload = await readJsonGzip<{
    schema?: string;
    generated_at?: string;
    source_project?: string;
    data?: Partial<B2SourceNetworkStatus>;
  }>(B2_SOURCE_NETWORK_STATUS_KEY);
  if (
    payload?.schema !== "geomacro.source-network-live.v1" ||
    payload.source_project !== "ldpwajisioljyjtojvfx" ||
    !recentEnough(payload.generated_at, SOURCE_NETWORK_FALLBACK_MAX_AGE_MS) ||
    typeof payload.data?.source_network_100_complete !== "boolean" ||
    typeof payload.data?.gdelt_gal_freshness_complete !== "boolean" ||
    typeof payload.data?.source_network_launch_complete !== "boolean"
  ) return null;
  return {
    source_network_100_complete: payload.data.source_network_100_complete,
    gdelt_gal_freshness_complete: payload.data.gdelt_gal_freshness_complete,
    source_network_launch_complete: payload.data.source_network_launch_complete,
  };
}

export async function readB2CommercialSourceRights(): Promise<B2CommercialSourceRight[] | null> {
  const payload = await readJsonGzip<{
    schema?: string;
    generated_at?: string;
    source_project?: string;
    rows?: unknown[];
  }>(B2_COMMERCIAL_SOURCE_RIGHTS_KEY);
  if (
    payload?.schema !== "geomacro.commercial-source-rights-live.v2" ||
    payload.source_project !== "ldpwajisioljyjtojvfx" ||
    !recentEnough(payload.generated_at, COMMERCIAL_SOURCE_RIGHTS_FALLBACK_MAX_AGE_MS) ||
    !Array.isArray(payload.rows) ||
    payload.rows.length === 0 ||
    payload.rows.length > 2_000
  ) return null;

  const output: B2CommercialSourceRight[] = [];
  const seen = new Set<string>();
  for (const value of payload.rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const sourceId = typeof row.source_id === "string" ? row.source_id.trim() : "";
    const category = row.category;
    const certificationState = row.certification_state;
    const status = row.commercial_usage_status;
    const licence = row.licence_name;
    if (
      !/^[A-Za-z0-9_.:-]{1,160}$/.test(sourceId) ||
      seen.has(sourceId) ||
      !(category === null || (typeof category === "string" && category.length <= 80)) ||
      !(certificationState === null || (typeof certificationState === "string" && certificationState.length <= 80)) ||
      !(status === null || (typeof status === "string" && status.length <= 80)) ||
      typeof row.enabled_for_ingestion !== "boolean" ||
      typeof row.enabled_for_commercial_signals !== "boolean" ||
      typeof row.raw_redistribution_allowed !== "boolean" ||
      typeof row.attribution_required !== "boolean" ||
      !(licence === null || (typeof licence === "string" && licence.length <= 300))
    ) return null;
    seen.add(sourceId);
    output.push({
      source_id: sourceId,
      category: category as string | null,
      certification_state: certificationState as string | null,
      commercial_usage_status: status as string | null,
      enabled_for_ingestion: row.enabled_for_ingestion,
      enabled_for_commercial_signals: row.enabled_for_commercial_signals,
      raw_redistribution_allowed: row.raw_redistribution_allowed,
      attribution_required: row.attribution_required,
      licence_name: licence as string | null,
    });
  }
  return output;
}
