import { createHash, createHmac } from "node:crypto";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const B2_REGION = "us-east-005";
const B2_NATIVE_AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 20_000_000;

const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();

type ReadCredential = {
  accessKey: string;
  secretKey: string;
  role: "dedicated-read" | "archive-read-write" | "primary";
};

type NativeAuthorization = {
  token: string;
  downloadUrl: string;
  namePrefix: string;
};

const nativeAuthorizationCache = new Map<string, Promise<NativeAuthorization>>();

function readCredentials(): ReadCredential[] {
  const dedicatedAccess = String(process.env.B2_ARCHIVE_READ_KEY_ID ?? "").trim();
  const dedicatedSecret = String(process.env.B2_ARCHIVE_READ_APPLICATION_KEY ?? "").trim();
  const archiveWriteAccess = String(process.env.B2_ARCHIVE_WRITE_KEY_ID ?? "").trim();
  const archiveWriteSecret = String(process.env.B2_ARCHIVE_WRITE_APPLICATION_KEY ?? "").trim();
  const defaultAccess = String(process.env.B2_KEY_ID ?? "").trim();
  const defaultSecret = String(process.env.B2_APPLICATION_KEY ?? "").trim();

  for (const [candidateAccess, candidateSecret] of [
    [dedicatedAccess, dedicatedSecret],
    [archiveWriteAccess, archiveWriteSecret],
    [defaultAccess, defaultSecret],
  ]) {
    if (Boolean(candidateAccess) !== Boolean(candidateSecret)) {
      throw new Error("B2_ARCHIVE_READ_CREDENTIAL_PAIR_INCOMPLETE");
    }
  }

  const candidates: ReadCredential[] = [];
  const seen = new Set<string>();
  for (const [accessKey, secretKey, role] of [
    [dedicatedAccess, dedicatedSecret, "dedicated-read"],
    [archiveWriteAccess, archiveWriteSecret, "archive-read-write"],
    [defaultAccess, defaultSecret, "primary"],
  ] as const) {
    if (!accessKey || !secretKey) continue;
    const fingerprint = `${accessKey}\u0000${secretKey}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    candidates.push({ accessKey, secretKey, role });
  }

  if (!candidates.length) throw new Error("B2_ARCHIVE_READ_CREDENTIALS_REQUIRED");
  return candidates;
}

export function b2PrivateArchiveReadConfigured() {
  try {
    readCredentials();
    return true;
  } catch {
    return false;
  }
}

function validateKey(key: string) {
  const normalized = String(key ?? "").trim();
  if (
    !normalized.startsWith("geomacro-evidence/v1/") ||
    !/^[A-Za-z0-9_./-]+$/.test(normalized) ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized.endsWith("/")
  ) {
    throw new Error("B2_PRIVATE_ARCHIVE_KEY_INVALID");
  }
  return normalized;
}

function safeErrorCode(text: string) {
  const source = String(text ?? "");
  const xmlCode = source.match(/<Code>([^<]{1,80})<\/Code>/i)?.[1];
  if (xmlCode && /^[A-Za-z0-9_.:-]+$/.test(xmlCode)) return xmlCode;
  try {
    const parsed = JSON.parse(source);
    const code = typeof parsed?.code === "string" ? parsed.code : "";
    return /^[A-Za-z0-9_.:-]+$/.test(code) ? code : "unknown";
  } catch {
    return "unknown";
  }
}

async function authorizeNativeRead(
  credential: ReadCredential,
  timeoutMs: number,
): Promise<NativeAuthorization> {
  const fingerprint = `${credential.accessKey}\u0000${credential.secretKey}`;
  const cached = nativeAuthorizationCache.get(fingerprint);
  if (cached) return cached;

  const promise = (async () => {
    const basic = Buffer.from(
      `${credential.accessKey}:${credential.secretKey}`,
      "utf8",
    ).toString("base64");
    const response = await fetch(B2_NATIVE_AUTHORIZE_URL, {
      method: "GET",
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw new Error(
        `B2_PRIVATE_NATIVE_AUTHORIZE_FAILED_${response.status}_${safeErrorCode(responseText)}`,
      );
    }

    const payload = await response.json().catch(() => null);
    const storage = payload?.apiInfo?.storageApi;
    const token = String(payload?.authorizationToken ?? "").trim();
    const downloadUrl = String(storage?.downloadUrl ?? "").trim();
    const capabilities = Array.isArray(storage?.allowed?.capabilities)
      ? storage.allowed.capabilities.map((value: unknown) => String(value))
      : [];
    const buckets = Array.isArray(storage?.allowed?.buckets)
      ? storage.allowed.buckets
          .map((entry: { name?: unknown }) => String(entry?.name ?? "").trim())
          .filter(Boolean)
      : [];
    const namePrefix = String(storage?.allowed?.namePrefix ?? "").trim();

    if (!token || !downloadUrl) throw new Error("B2_PRIVATE_NATIVE_AUTHORIZE_RESPONSE_INVALID");
    if (!capabilities.includes("readFiles")) throw new Error("B2_PRIVATE_NATIVE_READ_CAPABILITY_MISSING");
    if (buckets.length && !buckets.includes(B2_BUCKET)) {
      throw new Error("B2_PRIVATE_NATIVE_BUCKET_NOT_ALLOWED");
    }

    let parsed: URL;
    try {
      parsed = new URL(downloadUrl);
    } catch {
      throw new Error("B2_PRIVATE_NATIVE_DOWNLOAD_URL_INVALID");
    }
    if (
      parsed.protocol !== "https:" ||
      !/(^|\.)backblazeb2\.com$/i.test(parsed.hostname)
    ) {
      throw new Error("B2_PRIVATE_NATIVE_DOWNLOAD_URL_INVALID");
    }

    return { token, downloadUrl: parsed.origin, namePrefix };
  })();

  nativeAuthorizationCache.set(fingerprint, promise);
  try {
    return await promise;
  } catch (error) {
    nativeAuthorizationCache.delete(fingerprint);
    throw error;
  }
}

async function nativeRead(
  credential: ReadCredential,
  key: string,
  timeoutMs: number,
): Promise<Buffer> {
  const authorization = await authorizeNativeRead(credential, timeoutMs);
  if (authorization.namePrefix && !key.startsWith(authorization.namePrefix)) {
    throw new Error("B2_PRIVATE_NATIVE_PREFIX_NOT_ALLOWED");
  }
  const nativePath = `/file/${encodeURIComponent(B2_BUCKET)}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const response = await fetch(`${authorization.downloadUrl}${nativePath}`, {
    method: "GET",
    headers: { Authorization: authorization.token },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `B2_PRIVATE_NATIVE_GET_FAILED_${response.status}_${safeErrorCode(responseText)}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function s3Read(
  credential: ReadCredential,
  key: string,
  timeoutMs: number,
): Promise<{ status: number; bytes?: Buffer; errorCode?: string }> {
  const path = `/${[B2_BUCKET, ...key.split("/")].map(encodeURIComponent).join("/")}`;
  const host = new URL(B2_ENDPOINT).host;
  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = timestamp.slice(0, 8);
  const emptyHash = sha256("");
  const headers = {
    host,
    "x-amz-content-sha256": emptyHash,
    "x-amz-date": timestamp,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${headers[name as keyof typeof headers]}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonical = ["GET", path, "", canonicalHeaders, signedHeaders, emptyHash].join("\n");
  const scope = `${day}/${B2_REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    sha256(canonical),
  ].join("\n");
  const signingKey = hmac(
    hmac(
      hmac(
        hmac(`AWS4${credential.secretKey}`, day),
        B2_REGION,
      ),
      "s3",
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const response = await fetch(`${B2_ENDPOINT}${path}`, {
    method: "GET",
    headers: {
      "x-amz-content-sha256": emptyHash,
      "x-amz-date": timestamp,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${credential.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.ok) {
    return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
  }
  const responseText = await response.text().catch(() => "");
  return {
    status: response.status,
    errorCode: safeErrorCode(responseText),
  };
}

function validateSize(bytes: Buffer, maxBytes: number) {
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error("B2_PRIVATE_ARCHIVE_SIZE_INVALID");
  }
  return bytes;
}

export async function readPrivateB2Object(
  key: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Buffer> {
  const endpoint = String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim();
  if (endpoint !== B2_ENDPOINT) {
    throw new Error("B2_PRIVATE_ARCHIVE_ENDPOINT_INVALID");
  }

  const timeoutMs = Math.max(
    1_000,
    Math.min(60_000, Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
  );
  const maxBytes = Math.max(
    1,
    Math.min(40_000_000, Number(options.maxBytes ?? DEFAULT_MAX_BYTES)),
  );
  const normalizedKey = validateKey(key);
  const credentials = readCredentials();
  let lastError: unknown = null;

  for (const credential of credentials) {
    try {
      const s3 = await s3Read(credential, normalizedKey, timeoutMs);
      if (s3.bytes) return validateSize(s3.bytes, maxBytes);
      if (s3.status !== 403 || s3.errorCode !== "AccessDenied") {
        throw new Error(
          `B2_PRIVATE_ARCHIVE_GET_FAILED_${s3.status}_${s3.errorCode ?? "unknown"}`,
        );
      }
      const nativeBytes = await nativeRead(credential, normalizedKey, timeoutMs);
      return validateSize(nativeBytes, maxBytes);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("B2_PRIVATE_ARCHIVE_READ_FAILED");
}
