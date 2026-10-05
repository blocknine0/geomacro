import { createHash, createHmac } from "node:crypto";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const REGION = "us-east-005";
const KEY_RE = /^telegram\/leads\/[0-9]{4}\/[0-9]{2}\/[0-9]{2}\/[a-z0-9_]{5,32}\/[A-Za-z0-9_.:-]+\.json\.gz$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();

function validateKey(key) {
  const normalized = String(key ?? "").trim();
  if (!KEY_RE.test(normalized) || normalized.includes("..")) {
    throw new Error("TELEGRAM_B2_KEY_INVALID");
  }
  return normalized;
}

export function createTelegramB2Reader({ endpointUrl, bucket, accessKey, secretKey }) {
  if (String(endpointUrl ?? "").trim() !== ENDPOINT || bucket !== BUCKET || !accessKey || !secretKey) {
    throw new Error("TELEGRAM_B2_CONFIG_INVALID");
  }

  return {
    async get(key) {
      const normalized = validateKey(key);
      const path = `/${[BUCKET, ...normalized.split("/")].map(encodeURIComponent).join("/")}`;
      const host = new URL(ENDPOINT).host;
      const payloadHash = sha256(Buffer.alloc(0));
      const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
      const day = timestamp.slice(0, 8);
      const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": timestamp };
      const names = Object.keys(headers).sort();
      const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join("");
      const signedHeaders = names.join(";");
      const canonical = ["GET", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
      const scope = `${day}/${REGION}/s3/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(canonical)].join("\n");
      const signatureKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), REGION), "s3"), "aws4_request");
      const signature = createHmac("sha256", signatureKey).update(stringToSign).digest("hex");
      const response = await fetch(`${ENDPOINT}${path}`, {
        headers: {
          "x-amz-content-sha256": payloadHash,
          "x-amz-date": timestamp,
          Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`TELEGRAM_B2_GET_FAILED_${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

export const telegramB2Sha256 = sha256;
