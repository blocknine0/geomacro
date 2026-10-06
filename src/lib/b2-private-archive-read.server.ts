import { createHash, createHmac } from "node:crypto";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const B2_REGION = "us-east-005";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 20_000_000;

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

  const response = await fetch(`${B2_ENDPOINT}${path}`, {
    method: "GET",
    headers: {
      "x-amz-content-sha256": emptyHash,
      "x-amz-date": timestamp,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`B2_PRIVATE_ARCHIVE_GET_FAILED_${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error("B2_PRIVATE_ARCHIVE_SIZE_INVALID");
  }
  return bytes;
}
