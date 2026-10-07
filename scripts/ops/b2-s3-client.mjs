import { createHash, createHmac } from "node:crypto";
import { parseB2Endpoint } from "./b2-archive-contract.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const DEFAULT_REQUEST_BUDGET = 64;
const MAX_REQUEST_BUDGET = 500;
const DEFAULT_ALLOWED_PREFIXES = Object.freeze(["geomacro-evidence/v1/"]);
const EXTRA_ALLOWED_PREFIXES = Object.freeze(new Set(["telegram/leads/"]));
const B2_NATIVE_AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";

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
  if (!raw) return DEFAULT_REQUEST_BUDGET;
  if (!/^\d+$/.test(raw)) throw new Error("B2_REQUEST_BUDGET_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_REQUEST_BUDGET) {
    throw new Error("B2_REQUEST_BUDGET_INVALID");
  }
  return value;
}

function primaryReadFallbackAvailable(candidates) {
  const primaryIndex = candidates.findIndex(
    (candidate) => candidate?.role === "primary",
  );
  return primaryIndex > 0;
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
  readAccessKey,
  readSecretKey,
  allowedKeyPrefixes = null,
}) {
  const endpoint = parseB2Endpoint(endpointUrl);
  if (endpoint.endpoint !== "https://s3.us-east-005.backblazeb2.com" ||
      bucket !== "geomacro-private-archive" || !accessKey || !secretKey) throw new Error("B2_ARCHIVE_CONFIG_INVALID");

  const explicitReadAccessKey = String(readAccessKey ?? "").trim();
  const explicitReadSecretKey = String(readSecretKey ?? "").trim();
  const dedicatedReadAccessKey = String(process.env.B2_ARCHIVE_READ_KEY_ID ?? "").trim();
  const dedicatedReadSecretKey = String(process.env.B2_ARCHIVE_READ_APPLICATION_KEY ?? "").trim();
  const archiveWriteAccessKey = String(process.env.B2_ARCHIVE_WRITE_KEY_ID ?? "").trim();
  const archiveWriteSecretKey = String(process.env.B2_ARCHIVE_WRITE_APPLICATION_KEY ?? "").trim();

  for (const [candidateAccess, candidateSecret] of [
    [explicitReadAccessKey, explicitReadSecretKey],
    [dedicatedReadAccessKey, dedicatedReadSecretKey],
    [archiveWriteAccessKey, archiveWriteSecretKey],
  ]) {
    if (Boolean(candidateAccess) !== Boolean(candidateSecret)) {
      throw new Error("B2_ARCHIVE_READ_CREDENTIAL_PAIR_INCOMPLETE");
    }
  }

  const readCredentialCandidates = [];
  const seenReadCredentials = new Set();
  for (const [candidateAccess, candidateSecret, role] of [
    [explicitReadAccessKey, explicitReadSecretKey, "explicit-read"],
    [dedicatedReadAccessKey, dedicatedReadSecretKey, "dedicated-read"],
    [archiveWriteAccessKey, archiveWriteSecretKey, "archive-read-write"],
    [accessKey, secretKey, "primary"],
  ]) {
    if (!candidateAccess || !candidateSecret) continue;
    const fingerprint = `${candidateAccess}\u0000${candidateSecret}`;
    if (seenReadCredentials.has(fingerprint)) continue;
    seenReadCredentials.add(fingerprint);
    readCredentialCandidates.push({
      accessKey: candidateAccess,
      secretKey: candidateSecret,
      role,
    });
  }
  const readCredentialsSeparate = readCredentialCandidates.some(
    (candidate) => candidate.role !== "primary",
  );

  const allowedPrefixes = normalizeAllowedPrefixes(allowedKeyPrefixes);
  const requestBudget = parseRequestBudget();
  let requestsStarted = 0;
  let s3RequestsStarted = 0;
  let nativeReadRequestsStarted = 0;
  let nativeReadFallbackAttempts = 0;
  let nativeReadFallbackSuccesses = 0;
  let nativeReadFatalError = null;
  const nativeReadAuthCache = new Map();
  const nativePreferredCredentials = new Set();
  const inFlightReads = new Map();

  function consumeRequestBudget(kind) {
    if (requestsStarted >= requestBudget) {
      throw new Error("B2_REQUEST_BUDGET_EXHAUSTED");
    }
    requestsStarted += 1;
    if (kind === "s3") s3RequestsStarted += 1;
    if (kind === "native-read") nativeReadRequestsStarted += 1;
  }

  function nativeCredentialFingerprint(credential) {
    return `${credential.accessKey}\u0000${credential.secretKey}`;
  }

  async function authorizeNativeRead(credential) {
    const fingerprint = nativeCredentialFingerprint(credential);
    if (nativeReadAuthCache.has(fingerprint)) return nativeReadAuthCache.get(fingerprint);

    const promise = (async () => {
      const authHeader = Buffer.from(`${credential.accessKey}:${credential.secretKey}`, "utf8").toString("base64");
      let response;
      try {
        response = await fetch(B2_NATIVE_AUTHORIZE_URL, {
          method: "GET",
          headers: { Authorization: `Basic ${authHeader}` },
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new Error("B2_NATIVE_AUTHORIZE_NETWORK_FAILED");
      }

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        throw new Error(`B2_NATIVE_AUTHORIZE_FAILED_${response.status}_${safeB2ErrorCode(responseText)}`);
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error("B2_NATIVE_AUTHORIZE_RESPONSE_INVALID");
      }

      const storage = payload?.apiInfo?.storageApi;
      const token = String(payload?.authorizationToken ?? "").trim();
      const downloadUrl = String(storage?.downloadUrl ?? "").trim();
      const capabilities = Array.isArray(storage?.allowed?.capabilities)
        ? storage.allowed.capabilities.map((value) => String(value))
        : [];
      const allowedBuckets = Array.isArray(storage?.allowed?.buckets)
        ? storage.allowed.buckets
            .map((entry) => String(entry?.name ?? "").trim())
            .filter(Boolean)
        : [];
      const namePrefix = String(storage?.allowed?.namePrefix ?? "").trim();

      if (!token || !downloadUrl) throw new Error("B2_NATIVE_AUTHORIZE_RESPONSE_INVALID");
      if (!capabilities.includes("readFiles")) throw new Error("B2_NATIVE_READ_CAPABILITY_MISSING");
      if (allowedBuckets.length && !allowedBuckets.includes(bucket)) {
        throw new Error("B2_NATIVE_READ_BUCKET_NOT_ALLOWED");
      }

      let download;
      try {
        download = new URL(downloadUrl);
      } catch {
        throw new Error("B2_NATIVE_DOWNLOAD_URL_INVALID");
      }
      if (
        download.protocol !== "https:" ||
        !/(^|\.)backblazeb2\.com$/i.test(download.hostname)
      ) {
        throw new Error("B2_NATIVE_DOWNLOAD_URL_INVALID");
      }

      return {
        token,
        downloadUrl: download.origin,
        namePrefix,
      };
    })();

    nativeReadAuthCache.set(fingerprint, promise);
    try {
      return await promise;
    } catch (error) {
      nativeReadAuthCache.delete(fingerprint);
      throw error;
    }
  }

  async function nativeRead(credential, key, { allowNotFound = false } = {}) {
    nativeReadFallbackAttempts += 1;
    const auth = await authorizeNativeRead(credential);
    if (auth.namePrefix && !key.startsWith(auth.namePrefix)) {
      throw new Error("B2_NATIVE_READ_PREFIX_NOT_ALLOWED");
    }

    const nativePath = `/file/${encodeURIComponent(bucket)}/${key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    consumeRequestBudget("native-read");
    let response;
    try {
      response = await fetch(`${auth.downloadUrl}${nativePath}`, {
        method: "GET",
        headers: { Authorization: auth.token },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error("B2_NATIVE_GET_NETWORK_FAILED");
    }

    if (response.ok) {
      nativeReadFallbackSuccesses += 1;
      return Buffer.from(await response.arrayBuffer());
    }

    const responseText = await response.text().catch(() => "");
    const errorCode = safeB2ErrorCode(responseText);
    if (allowNotFound && response.status === 404 && errorCode === "not_found") {
      return null;
    }
    throw new Error(`B2_NATIVE_GET_FAILED_${response.status}_${errorCode}`);
  }

  async function request(method, key, body = Buffer.alloc(0), { allowNotFound = false } = {}) {
    const normalizedKey = String(key ?? "");
    if (method === "GET" && nativeReadFatalError) throw new Error(nativeReadFatalError);
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
    const credentialCandidates =
      method === "GET"
        ? readCredentialCandidates
        : [{ accessKey, secretKey, role: "primary" }];

    let lastAccessDenied = null;
    let lastDedicatedNativeError = null;
    for (let credentialIndex = 0; credentialIndex < credentialCandidates.length; credentialIndex++) {
      const credential = credentialCandidates[credentialIndex];
      const fingerprint = nativeCredentialFingerprint(credential);

      if (method === "GET" && nativePreferredCredentials.has(fingerprint)) {
        try {
          return await nativeRead(credential, normalizedKey, { allowNotFound });
        } catch (nativeCause) {
          const nativeMessage =
            nativeCause instanceof Error ? nativeCause.message : "B2_NATIVE_READ_FAILED";
          if (nativeMessage === "B2_NATIVE_GET_FAILED_403_download_cap_exceeded") {
            nativeReadFatalError = "B2_DOWNLOAD_CAP_EXCEEDED";
            throw new Error(nativeReadFatalError);
          }
          if (nativeMessage === "B2_NATIVE_GET_FAILED_403_transaction_cap_exceeded") {
            nativeReadFatalError = "B2_TRANSACTION_CAP_EXCEEDED";
            throw new Error(nativeReadFatalError);
          }
          throw nativeCause;
        }
      }

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      consumeRequestBudget("s3");

      const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const day = timestamp.slice(0, 8);
      const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": timestamp };
      const names = Object.keys(headers).sort();
      const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join("");
      const signedHeaders = names.join(";");
      const canonical = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
      const scope = `${day}/${endpoint.region}/s3/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha(canonical)].join("\n");
      const signatureKey = hmac(hmac(hmac(hmac(`AWS4${credential.secretKey}`, day), endpoint.region), "s3"), "aws4_request");
      const signature = createHmac("sha256", signatureKey).update(stringToSign).digest("hex");

      try {
        const result = await fetch(`${endpoint.endpoint}${path}`, {
          method,
          headers: {
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": timestamp,
            Authorization: `AWS4-HMAC-SHA256 Credential=${credential.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
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
        if (
          method === "GET" &&
          result.status === 403 &&
          errorCode === "AccessDenied"
        ) {
          try {
            const bytes = await nativeRead(credential, normalizedKey, { allowNotFound });
            nativePreferredCredentials.add(fingerprint);
            return bytes;
          } catch (nativeCause) {
            const nativeMessage =
              nativeCause instanceof Error ? nativeCause.message : "B2_NATIVE_READ_FAILED";
            if (nativeMessage === "B2_NATIVE_GET_FAILED_403_download_cap_exceeded") {
              nativeReadFatalError = "B2_DOWNLOAD_CAP_EXCEEDED";
              throw new Error(nativeReadFatalError);
            }
            if (nativeMessage === "B2_NATIVE_GET_FAILED_403_transaction_cap_exceeded") {
              nativeReadFatalError = "B2_TRANSACTION_CAP_EXCEEDED";
              throw new Error(nativeReadFatalError);
            }
            if (credential.role !== "primary") {
              lastDedicatedNativeError = new Error(
                /^[A-Z0-9_:-]+$/.test(nativeMessage)
                  ? nativeMessage
                  : "B2_NATIVE_READ_FAILED",
              );
            }
            if (credentialIndex < credentialCandidates.length - 1) {
              lastAccessDenied = new Error(`B2_GET_FAILED_403_AccessDenied_${credential.role}`);
              break;
            }
            throw lastDedicatedNativeError ?? nativeCause;
          }
        }
        if (!TRANSIENT_STATUSES.has(result.status) || attempt === MAX_ATTEMPTS) {
          throw new Error(`B2_${method}_FAILED_${result.status}_${errorCode}`);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const explicitHttpFailure = /^B2_(PUT|GET)_FAILED_\d+_[A-Za-z0-9_.:-]+$/.test(message);
        const hardCapFailure =
          message === "B2_DOWNLOAD_CAP_EXCEEDED" ||
          message === "B2_TRANSACTION_CAP_EXCEEDED";
        if (explicitHttpFailure || hardCapFailure || message === "B2_REQUEST_BUDGET_EXHAUSTED" || attempt === MAX_ATTEMPTS) throw cause;
      }

      await sleep(500 * 2 ** (attempt - 1));
      }
    }

    if (lastDedicatedNativeError) throw lastDedicatedNativeError;
    if (lastAccessDenied) throw lastAccessDenied;
    throw new Error(`B2_${method}_RETRY_EXHAUSTED`);
  }

  function readSingleFlight(key, allowNotFound) {
    const cacheKey = `${allowNotFound ? "optional" : "required"}:${String(key ?? "")}`;
    if (inFlightReads.has(cacheKey)) return inFlightReads.get(cacheKey);
    const promise = request("GET", key, Buffer.alloc(0), { allowNotFound })
      .finally(() => inFlightReads.delete(cacheKey));
    inFlightReads.set(cacheKey, promise);
    return promise;
  }

  return {
    put: (key, bytes) => request("PUT", key, bytes),
    get: (key) => readSingleFlight(key, false),
    getOptional: (key) => readSingleFlight(key, true),
    usage: () => ({
      requests_started: requestsStarted,
      request_budget: requestBudget,
      default_request_budget: DEFAULT_REQUEST_BUDGET,
      max_request_budget: MAX_REQUEST_BUDGET,
      s3_requests_started: s3RequestsStarted,
      native_read_requests_started: nativeReadRequestsStarted,
      allowed_prefixes: allowedPrefixes,
      read_credentials_separate: readCredentialsSeparate,
      read_credential_roles: readCredentialCandidates.map((candidate) => candidate.role),
      read_fallback_to_primary_available:
        primaryReadFallbackAvailable(readCredentialCandidates),
      native_read_fallback_enabled: true,
      native_read_fallback_attempts: nativeReadFallbackAttempts,
      native_read_fallback_successes: nativeReadFallbackSuccesses,
      native_read_fatal_error: nativeReadFatalError,
      native_preferred_credential_count: nativePreferredCredentials.size,
      in_flight_read_count: inFlightReads.size,
    }),
  };
}
