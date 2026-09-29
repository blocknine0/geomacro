import process from "node:process";
import { createHash, createHmac } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";
import type { GlobalRisk } from "./global-risk.types";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const CACHE_TTL_MS = 120_000;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_COMPRESSED_BYTES = 12_000_000;

export const B2_PUBLIC_INTELLIGENCE_KEY =
  "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
export const B2_PUBLIC_RISK_KEY =
  "geomacro-evidence/v1/live/risk-indices/latest.json.gz";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();

type B2Config = { accessKey: string; secretKey: string };
type CacheEntry = { expiresAt: number; bytes: Buffer };

const cache = new Map<string, CacheEntry>();
let failureCount = 0;
let circuitOpenedAt = 0;

function config(): B2Config | null {
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  const accessKey = String(process.env.B2_KEY_ID ?? "").trim();
  const secretKey = String(process.env.B2_APPLICATION_KEY ?? "").trim();
  if (endpoint !== B2_ENDPOINT || !accessKey || !secretKey) return null;
  return { accessKey, secretKey };
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

async function signedGet(key: string): Promise<Buffer | null> {
  const cfg = config();
  if (!cfg || !allowedKey(key) || circuitOpen()) return null;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;

  const path = `/${[B2_BUCKET, ...key.split("/")].map(encodeURIComponent).join("/")}`;
  const host = new URL(B2_ENDPOINT).host;
  const emptyHash = sha256(Buffer.alloc(0));

  try {
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const day = timestamp.slice(0, 8);
    const headers = { host, "x-amz-content-sha256": emptyHash, "x-amz-date": timestamp };
    const names = Object.keys(headers).sort() as Array<keyof typeof headers>;
    const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join("");
    const signedHeaders = names.join(";");
    const canonical = ["GET", path, "", canonicalHeaders, signedHeaders, emptyHash].join("\n");
    const scope = `${day}/us-east-005/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(Buffer.from(canonical))].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${cfg.secretKey}`, day), "us-east-005"), "s3"),
      "aws4_request",
    );
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

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
    const bytes = Buffer.from(await response.arrayBuffer());
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

async function readJsonGzip<T>(key: string): Promise<T | null> {
  const compressed = await signedGet(key);
  if (!compressed) return null;
  try {
    const raw = gunzipSync(compressed);
    if (!raw.length || raw.length > 40_000_000) return null;
    return JSON.parse(raw.toString("utf8")) as T;
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
    !recentEnough(payload.generated_at) ||
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
    !recentEnough(payload.generated_at, 12 * 60 * 60 * 1000) ||
    !payload.data ||
    payload.data.verificationStatus !== "verified" ||
    !/^[a-f0-9]{64}$/.test(String(payload.data.proofHash ?? "")) ||
    !/^[a-f0-9]{64}$/.test(String(payload.data.calculationHash ?? ""))
  ) return null;
  return payload.data;
}
