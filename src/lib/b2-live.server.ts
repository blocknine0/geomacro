import {fetchWithoutRedirect} from "./fetch-without-redirect";
import { createPerKeySingleFlight } from "./b2-single-flight";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";
import type { GlobalRisk } from "./global-risk.types";
import { readGlobalRiskEdge } from "./global-risk-edge.server";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const PUBLIC_INTELLIGENCE_EDGE_URL =
  "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence";
const PUBLIC_INTELLIGENCE_EDGE_AUTHORITY = "backblaze-b2-intelligence-edge";
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
/**
 * Dedicated canonical Global Risk continuity object. Unlike the legacy
 * risk-indices object below, this key is not coupled to the four-object live
 * snapshot proof and can therefore be promoted independently from direct
 * Postgres during a Supabase REST egress restriction.
 */
export const B2_PUBLIC_GLOBAL_RISK_KEY =
  "geomacro-evidence/v1/live/global-risk/latest.json.gz";
export const B2_PUBLIC_GLOBAL_RISK_PROOF_KEY =
  "geomacro-evidence/v1/live/global-risk/latest-proof.json";
/** Legacy compatibility key retained until every consumer has migrated. */
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
// Prevent one public traffic burst from spawning concurrent B2 Class-B GETs.
const shareSignedB2Read = createPerKeySingleFlight<string, Uint8Array | null>();
let failureCount = 0;
let circuitOpenedAt = 0;
// Local backoff supplements the account-wide D1 reservation; it never grants
// permission for a B2 request or extends a cached artifact's acceptance TTL.
let providerQuotaCooldownUntil = 0;
const B2_COLD_READ_BACKOFF_MS = 15 * 60_000;
function nextUtcDay(nowMs: number): number {
  const day = new Date(nowMs);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
}
function noteProviderReadDenial(status: number, errorBody: string) {
  const nowMs = Date.now();
  const providerCap = status === 403 &&
    /(?:transaction_cap_exceeded|download_cap_exceeded)/i.test(errorBody.slice(0, 4_096));
  if (providerCap) providerQuotaCooldownUntil = Math.max(
    providerQuotaCooldownUntil, nextUtcDay(nowMs));
  else if (status === 403 || status === 429)
    providerQuotaCooldownUntil = Math.max(
      providerQuotaCooldownUntil, nowMs + B2_COLD_READ_BACKOFF_MS);
}

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

function config(): B2Config | null {
  // This module is referenced only from server-function handlers, but the
  // TanStack client compiler still traverses imports. Fail closed in a browser
  // build/runtime without importing any Node builtin or exposing secret values.
  if (typeof window !== "undefined" || typeof process === "undefined") return null;
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  const dedicatedAccessKey = String(
    process.env.B2_ARCHIVE_READ_KEY_ID ?? "",
  ).trim();
  const dedicatedSecretKey = String(
    process.env.B2_ARCHIVE_READ_APPLICATION_KEY ?? "",
  ).trim();
  if (Boolean(dedicatedAccessKey) !== Boolean(dedicatedSecretKey)) return null;
  const accessKey = dedicatedAccessKey || String(process.env.B2_KEY_ID ?? "").trim();
  const secretKey = dedicatedSecretKey || String(process.env.B2_APPLICATION_KEY ?? "").trim();
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
  // Only an in-flight de-duplication. No stale/error-cache promotion.
  return shareSignedB2Read(key, () => signedGetOnce(key));
}

/**
 * Private rights/status reads share the SAME atomic D1 quota ledger as the
 * three public Cloudflare Workers and GitHub producers. Previously these two
 * app-serving fallbacks could perform signed S3 GET without a reservation.
 *
 * A missing token, exhausted D1 quota, rejected reservation, or upstream
 * outage NEVER authorizes a B2 request. Cached previously accepted metadata
 * may still be reused within its existing two-minute in-memory TTL.
 */
const B2_QUOTA_WORKER =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/b2-quota/reserve";

export async function reservePrivateB2Read(key: string): Promise<boolean> {
  if (typeof window !== "undefined" || typeof process === "undefined") return false;
  // Explicit pre-derived credentials retain precedence. An invalid explicit
  // credential fails closed; never silently switch authority after rejection.
  const explicit = String(process.env.GEOMACRO_CONTROL_PLANE_TOKEN ?? "").trim() ||
    String(process.env.CONTROL_PLANE_TOKEN ?? "").trim();
  let token = explicit;
  if (!explicit) {
    const root = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
    if (root.length < 32) return false;
    // Same domain separation as security-budget, hot reads and protected
    // publishers. The root secret itself must never become a bearer token.
    try { token = hex(await hmac(root, "geomacro-control-plane-v1")); }
    catch { return false; }
  }
  if (token.length < 32) return false;
  const workflowId = key === B2_COMMERCIAL_SOURCE_RIGHTS_KEY
    ? "app_private_source_rights"
    : key === B2_SOURCE_NETWORK_STATUS_KEY
      ? "app_private_source_status"
      : key === "geomacro-evidence/v1/structural/serving/latest.json.gz" ||
        key === "geomacro-evidence/v1/structural/serving/latest-proof.json"
        ? "app_private_structural_serving"
        : null;
  if (!workflowId) return false;
  try {
    const res = await fetchWithoutRedirect(B2_QUOTA_WORKER, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({kind:"GET",workflow_id:workflowId}),
      signal: AbortSignal.timeout(2_500),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const proof = await res.json() as {
      ok?:boolean;schema?:string;reserved?:boolean;kind?:string;
      b2_operation_performed?:boolean;chargeable?:boolean;
    };
    return proof?.ok === true &&
      proof.schema === "geomacro.b2-account-request-reservation.v1" &&
      proof.reserved === true && proof.kind === "GET" &&
      proof.b2_operation_performed === false &&
      proof.chargeable === false;
  } catch {
    return false;
  }
}

async function signedGetOnce(key: string): Promise<Uint8Array | null> {
  const cfg = config();
  if (!cfg || !allowedKey(key)) return null;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;
  if (providerQuotaCooldownUntil > Date.now() || circuitOpen()) return null;

  // Must reserve an account-wide Class B GET ticket before any AWS-signed
  // request. If D1's atomic receipt is unavailable, fail closed (no B2).
  if (!(await reservePrivateB2Read(key))) return null;

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

    const response = await fetchWithoutRedirect(`${B2_ENDPOINT}${path}`, {
      method: "GET",
      headers: {
        "x-amz-content-sha256": emptyHash,
        "x-amz-date": timestamp,
        Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        const errorBody = await response.text().catch(() => "");
        noteProviderReadDenial(response.status, errorBody);
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
    noteFailure();
    return null;
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
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

async function readPublicIntelligenceEdge(): Promise<PublicIntelligenceRow[] | null> {
  try {
    const response = await fetchWithoutRedirect(PUBLIC_INTELLIGENCE_EDGE_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_500),
    });
    if (
      !response.ok ||
      response.headers.get("x-geomacro-authority") !== PUBLIC_INTELLIGENCE_EDGE_AUTHORITY
    ) return null;

    const payload = await response.json() as {
      schema?: string;
      generated_at?: string;
      source_project?: string;
      rows?: PublicIntelligenceRow[];
    };
    if (
      payload.schema !== "geomacro.public-intelligence-live.v1" ||
      payload.source_project !== "ldpwajisioljyjtojvfx" ||
      !recentEnough(payload.generated_at, PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS) ||
      !Array.isArray(payload.rows) ||
      payload.rows.length === 0 ||
      payload.rows.length > 300
    ) return null;
    const categories = new Set(
      payload.rows.map((row) => String(row.category ?? "").toLowerCase()),
    );
    if (!["geopolitics", "macro", "rare_earth"].every((category) => categories.has(category))) {
      return null;
    }
    return payload.rows;
  } catch {
    return null;
  }
}

/** Public read must never bypass the shared-account B2 D1 reservation.
 * The verified edge itself follows: D1 hot snapshot -> verified Cloudflare
 * POP cache -> B2 GET only after atomic account-wide D1 quota admission.
 * When both public caches and account quota are unavailable, fail closed:
 * never perform an independent unmetered signed S3 GET here.
 */
export async function readB2PublicIntelligence(): Promise<PublicIntelligenceRow[] | null> {
  return readPublicIntelligenceEdge();
}

/** Public risk read has the same shared-account quota boundary as
 * the intelligence reader. The verified edge, not this app runtime, owns
 * D1 hot / POP cache / quota-governed B2 cold recovery. This removes
 * a second unmetered B2 origin path when the public cold-cache quota
 * or the account-wide D1 quota database has already been exhausted.
 */
export async function readB2PublicRisk(): Promise<GlobalRisk | null> {
  return readGlobalRiskEdge();
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
