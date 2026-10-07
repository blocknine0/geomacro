import { createHash, createHmac } from "node:crypto";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const B2_REGION = "us-east-005";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 20_000_000;
const B2_NATIVE_AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";
const nativeAuthCache = new Map<string, Promise<{
  token: string;
  downloadUrl: string;
  namePrefix: string;
}>>();
const nativePreferredCredentials = new Set<string>();

const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();

function readCredentials() {
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

  const accessKey = dedicatedAccess || archiveWriteAccess || defaultAccess;
  const secretKey = dedicatedSecret || archiveWriteSecret || defaultSecret;
  if (!accessKey || !secretKey) {
    throw new Error("B2_ARCHIVE_READ_CREDENTIALS_REQUIRED");
  }

  return {
    accessKey,
    secretKey,
    dedicated: Boolean(dedicatedAccess && dedicatedSecret),
  };
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

function credentialFingerprint(accessKey: string, secretKey: string) {
  return `${accessKey}\u0000${secretKey}`;
}

function safeNativeErrorCode(value: unknown) {
  const source = String(value ?? "");
  try {
    const parsed = JSON.parse(source);
    const code = typeof parsed?.code === "string" ? parsed.code : "";
    if (/^[A-Za-z0-9_.:-]+$/.test(code)) return code;
  } catch {}
  return "unknown";
}

async function authorizeNativeRead(
  accessKey: string,
  secretKey: string,
  timeoutMs: number,
) {
  const fingerprint = credentialFingerprint(accessKey, secretKey);
  const existing = nativeAuthCache.get(fingerprint);
  if (existing) return existing;

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(B2_NATIVE_AUTHORIZE_URL, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accessKey}:${secretKey}`, "utf8").toString("base64")}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_AUTHORIZE_NETWORK_FAILED");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `B2_PRIVATE_ARCHIVE_NATIVE_AUTHORIZE_FAILED_${response.status}_${safeNativeErrorCode(body)}`,
      );
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_AUTHORIZE_RESPONSE_INVALID");
    }

    const storage = payload?.apiInfo?.storageApi;
    const token = String(payload?.authorizationToken ?? "").trim();
    const downloadUrl = String(storage?.downloadUrl ?? "").trim();
    const capabilities = Array.isArray(storage?.allowed?.capabilities)
      ? storage.allowed.capabilities.map((value: unknown) => String(value))
      : [];
    const allowedBuckets = Array.isArray(storage?.allowed?.buckets)
      ? storage.allowed.buckets
          .map((entry: any) => String(entry?.name ?? "").trim())
          .filter(Boolean)
      : [];
    const namePrefix = String(storage?.allowed?.namePrefix ?? "").trim();

    if (!token || !downloadUrl) {
      throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_AUTHORIZE_RESPONSE_INVALID");
    }
    if (!capabilities.includes("readFiles")) {
      throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_READ_CAPABILITY_MISSING");
    }
    if (allowedBuckets.length && !allowedBuckets.includes(B2_BUCKET)) {
      throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_BUCKET_NOT_ALLOWED");
    }

    let parsedDownload: URL;
    try {
      parsedDownload = new URL(downloadUrl);
    } catch {
      throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_DOWNLOAD_URL_INVALID");
    }
    if (
      parsedDownload.protocol !== "https:" ||
      !/(^|\.)backblazeb2\.com$/i.test(parsedDownload.hostname)
    ) {
      throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_DOWNLOAD_URL_INVALID");
    }

    return {
      token,
      downloadUrl: parsedDownload.origin,
      namePrefix,
    };
  })();

  nativeAuthCache.set(fingerprint, promise);
  try {
    return await promise;
  } catch (error) {
    nativeAuthCache.delete(fingerprint);
    throw error;
  }
}

async function readNativeB2Object(
  key: string,
  accessKey: string,
  secretKey: string,
  timeoutMs: number,
  maxBytes: number,
) {
  const auth = await authorizeNativeRead(accessKey, secretKey, timeoutMs);
  if (auth.namePrefix && !key.startsWith(auth.namePrefix)) {
    throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_PREFIX_NOT_ALLOWED");
  }

  const path = `/file/${encodeURIComponent(B2_BUCKET)}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  let response: Response;
  try {
    response = await fetch(`${auth.downloadUrl}${path}`, {
      method: "GET",
      headers: { Authorization: auth.token },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("B2_PRIVATE_ARCHIVE_NATIVE_GET_NETWORK_FAILED");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `B2_PRIVATE_ARCHIVE_NATIVE_GET_FAILED_${response.status}_${safeNativeErrorCode(body)}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
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
  const { accessKey, secretKey } = readCredentials();
  const fingerprint = credentialFingerprint(accessKey, secretKey);

  if (nativePreferredCredentials.has(fingerprint)) {
    try {
      return await readNativeB2Object(
        normalizedKey,
        accessKey,
        secretKey,
        timeoutMs,
        maxBytes,
      );
    } catch {
      nativePreferredCredentials.delete(fingerprint);
    }
  }

  const path = `/${[B2_BUCKET, ...normalizedKey.split("/")].map(encodeURIComponent).join("/")}`;
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
        hmac(`AWS4${secretKey}`, day),
        B2_REGION,
      ),
      "s3",
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  let response: Response;
  try {
    response = await fetch(`${B2_ENDPOINT}${path}`, {
      method: "GET",
      headers: {
        "x-amz-content-sha256": emptyHash,
        "x-amz-date": timestamp,
        Authorization:
          `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    const bytes = await readNativeB2Object(
      normalizedKey,
      accessKey,
      secretKey,
      timeoutMs,
      maxBytes,
    );
    nativePreferredCredentials.add(fingerprint);
    return bytes;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const accessDenied =
      response.status === 403 &&
      /<Code>AccessDenied<\/Code>/i.test(body);

    if (accessDenied) {
      const bytes = await readNativeB2Object(
        normalizedKey,
        accessKey,
        secretKey,
        timeoutMs,
        maxBytes,
      );
      nativePreferredCredentials.add(fingerprint);
      return bytes;
    }

    throw new Error(`B2_PRIVATE_ARCHIVE_GET_FAILED_${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error("B2_PRIVATE_ARCHIVE_SIZE_INVALID");
  }
  return bytes;
}
