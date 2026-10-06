import { createHash, createHmac } from "node:crypto";
import { parseB2Endpoint } from "./b2-archive-contract.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const DEFAULT_ALLOWED_PREFIXES = Object.freeze(["geomacro-evidence/v1/"]);
const EXTRA_ALLOWED_PREFIXES = Object.freeze(new Set(["telegram/leads/"]));

function safeB2ErrorCode(text) {
  const source = String(text ?? "");
  const xmlCode = source.match(/<Code>([^<]{1,80})<\/Code>/i)?.[1];
  if (xmlCode && /^[A-Za-z0-9_.:-]+$/.test(xmlCode)) return xmlCode;
  const jsonCode = (() => {
    try {
      const parsed = JSON.parse(source);
      return typeof parsed?.code === "string" ? parsed.code : null;
    } catch {
      return null;
    }
  })();
  if (jsonCode && /^[A-Za-z0-9_.:-]+$/.test(jsonCode)) return jsonCode;
  return "unknown";
}

function parseRequestBudget() {
  const raw = String(process.env.B2_REQUEST_BUDGET ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) throw new Error("B2_REQUEST_BUDGET_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new Error("B2_REQUEST_BUDGET_INVALID");
  return value;
}

function normalizeAllowedPrefixes(allowedKeyPrefixes) {
  if (allowedKeyPrefixes == null) return DEFAULT_ALLOWED_PREFIXES;
  if (!Array.isArray(allowedKeyPrefixes) || allowedKeyPrefixes.length < 1 || allowedKeyPrefixes.length > 4) {
    throw new Error("B2_ARCHIVE_PREFIX_CONFIG_INVALID");
  }
  const normalized = allowedKeyPrefixes.map((value) => String(value ?? "").trim());
  for (const prefix of normalized) {
    if (prefix !== "geomacro-evidence/v1/" && !EXTRA_ALLOWED_PREFIXES.has(prefix)) {
      throw new Error("B2_ARCHIVE_PREFIX_CONFIG_INVALID");
    }
  }
  return Object.freeze([...new Set(normalized)]);
}

export function createB2Client({
  endpointUrl,
  accessKey,
  secretKey,
  bucket,
  readAccessKey = process.env.B2_ARCHIVE_READ_KEY_ID,
  readSecretKey = process.env.B2_ARCHIVE_READ_APPLICATION_KEY,
  allowedKeyPrefixes = null,
}) {
  const endpoint = parseB2Endpoint(endpointUrl);
  if (endpoint.endpoint !== "https://s3.us-east-005.backblazeb2.com" ||
      bucket !== "geomacro-private-archive" || !accessKey || !secretKey) throw new Error("B2_ARCHIVE_CONFIG_INVALID");

  const normalizedReadAccessKey = String(readAccessKey ?? "").trim();
  const normalizedReadSecretKey = String(readSecretKey ?? "").trim();
  if (Boolean(normalizedReadAccessKey) !== Boolean(normalizedReadSecretKey)) {
    throw new Error("B2_ARCHIVE_READ_CREDENTIAL_PAIR_INCOMPLETE");
  }
  const readCredentialsSeparate = Boolean(
    normalizedReadAccessKey && normalizedReadSecretKey,
  );

  const allowedPrefixes = normalizeAllowedPrefixes(allowedKeyPrefixes);
  const requestBudget = parseRequestBudget();
  let requestsStarted = 0;

  async function request(method, key, body = Buffer.alloc(0), { allowNotFound = false } = {}) {
    const normalizedKey = String(key ?? "");
    const matchesAllowedPrefix = allowedPrefixes.some((prefix) => normalizedKey.startsWith(prefix));
    if (
      !matchesAllowedPrefix ||
      !/^[A-Za-z0-9_./-]+$/.test(normalizedKey) ||
      normalizedKey.includes("..") ||
      normalizedKey.startsWith("/") ||
      normalizedKey.endsWith("/")
    ) {
      throw new Error("B2_ARCHIVE_KEY_INVALID");
    }
    const path = `/${[bucket, ...normalizedKey.split("/")].map(encodeURIComponent).join("/")}`;
    const host = new URL(endpoint.endpoint).host;
    const payloadHash = sha(body);
    const requestAccessKey =
      method === "GET" && readCredentialsSeparate
        ? normalizedReadAccessKey
        : accessKey;
    const requestSecretKey =
      method === "GET" && readCredentialsSeparate
        ? normalizedReadSecretKey
        : secretKey;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (requestBudget !== null && requestsStarted >= requestBudget) {
        throw new Error("B2_REQUEST_BUDGET_EXHAUSTED");
      }
      requestsStarted += 1;

      const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const day = timestamp.slice(0, 8);
      const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": timestamp };
      const names = Object.keys(headers).sort();
      const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join("");
      const signedHeaders = names.join(";");
      const canonical = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
      const scope = `${day}/${endpoint.region}/s3/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha(canonical)].join("\n");
      const signatureKey = hmac(hmac(hmac(hmac(`AWS4${requestSecretKey}`, day), endpoint.region), "s3"), "aws4_request");
      const signature = createHmac("sha256", signatureKey).update(stringToSign).digest("hex");

      try {
        const result = await fetch(`${endpoint.endpoint}${path}`, {
          method,
          headers: {
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": timestamp,
            Authorization: `AWS4-HMAC-SHA256 Credential=${requestAccessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
          },
          body: method === "PUT" ? body : undefined,
          signal: AbortSignal.timeout(60_000),
        });

        if (result.ok) return Buffer.from(await result.arrayBuffer());
        const responseText = await result.text().catch(() => "");
        const errorCode = safeB2ErrorCode(responseText);
        if (allowNotFound && method === "GET" && result.status === 404 && errorCode === "NoSuchKey") {
          return null;
        }
        if (!TRANSIENT_STATUSES.has(result.status) || attempt === MAX_ATTEMPTS) {
          throw new Error(`B2_${method}_FAILED_${result.status}_${errorCode}`);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const explicitHttpFailure = /^B2_(PUT|GET)_FAILED_\d+_[A-Za-z0-9_.:-]+$/.test(message);
        if (explicitHttpFailure || message === "B2_REQUEST_BUDGET_EXHAUSTED" || attempt === MAX_ATTEMPTS) throw cause;
      }

      await sleep(500 * 2 ** (attempt - 1));
    }

    throw new Error(`B2_${method}_RETRY_EXHAUSTED`);
  }

  return {
    put: (key, bytes) => request("PUT", key, bytes),
    get: (key) => request("GET", key),
    getOptional: (key) => request("GET", key, Buffer.alloc(0), { allowNotFound: true }),
    usage: () => ({
      requests_started: requestsStarted,
      request_budget: requestBudget,
      allowed_prefixes: allowedPrefixes,
      read_credentials_separate: readCredentialsSeparate,
    }),
  };
}
