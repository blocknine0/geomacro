import continuity from "./continuity.mjs";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest-proof.json";
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const CONTRACT = "risk-indices-v1.1.0";
const METHOD = "gri-v1.2.0";
const MAX_COMPRESSED_BYTES = 12_000_000;
const MAX_DECOMPRESSED_BYTES = 40_000_000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function hmac(key, value) {
  const imported = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(value)));
}

async function signedGet(key, env) {
  const accessKey = String(env.B2_KEY_ID ?? "").trim();
  const secretKey = String(env.B2_APPLICATION_KEY ?? "").trim();
  if (!accessKey || !secretKey) throw new Error("B2_RISK_INDICES_EDGE_CONFIG_REQUIRED");

  const path = `/${[B2_BUCKET, ...key.split("/")].map(encodeURIComponent).join("/")}`;
  const host = new URL(B2_ENDPOINT).host;
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
      await hmac(await hmac(`AWS4${secretKey}`, day), "us-east-005"),
      "s3",
    ),
    "aws4_request",
  );
  const signature = hex(await hmac(signingKey, stringToSign));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${B2_ENDPOINT}${path}`, {
      method: "GET",
      headers: {
        "x-amz-content-sha256": emptyHash,
        "x-amz-date": timestamp,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`B2_RISK_INDICES_EDGE_READ_${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) throw new Error("B2_RISK_INDICES_EDGE_SIZE_INVALID");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) throw new Error("B2_RISK_INDICES_EDGE_DECOMPRESSED_SIZE_INVALID");
  return raw;
}

function recentEnough(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && parsed <= Date.now() + 5 * 60_000 && Date.now() - parsed <= MAX_AGE_MS;
}

function validIndices(data) {
  if (
    data?.contractVersion !== CONTRACT ||
    data?.parentMethodologyVersion !== METHOD ||
    data?.verificationStatus !== "verified" ||
    !Array.isArray(data?.indices) ||
    data.indices.length !== 3
  ) return false;
  const expected = new Set(["geopolitics", "macro", "critical_minerals"]);
  for (const index of data.indices) {
    if (!expected.delete(index?.key)) return false;
    if (
      index?.status !== "available" ||
      !Number.isFinite(Number(index?.score)) ||
      !Array.isArray(index?.series?.["7D"]?.buckets) ||
      index.series["7D"].buckets.length < 2 ||
      !Array.isArray(index?.series?.["30D"]?.buckets) ||
      index.series["30D"].buckets.length < index.series["7D"].buckets.length
    ) return false;
  }
  return expected.size === 0;
}

async function buildContinuityResponse() {
  if (
    continuity?.schema !== "geomacro.edge-continuity.v1" ||
    continuity?.product !== "risk-indices" ||
    continuity?.b2_readback_verified !== true ||
    continuity?.projection !== "exact-public-package" ||
    !/^\\d+$/.test(String(continuity?.source_run_id ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(continuity?.source_live_sha256 ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(continuity?.payload_sha256 ?? "")) ||
    typeof continuity?.payload_json !== "string"
  ) throw new Error("RISK_INDICES_CONTINUITY_PROOF_INVALID");

  const payloadBytes = encoder.encode(continuity.payload_json);
  if (await sha256(payloadBytes) !== continuity.payload_sha256) {
    throw new Error("RISK_INDICES_CONTINUITY_HASH_INVALID");
  }
  const live = JSON.parse(continuity.payload_json);
  const data = live?.data;
  if (
    live?.schema !== "geomacro.public-risk-indices-live.v1" ||
    live?.source_project !== PROJECT_REF ||
    !recentEnough(live?.generated_at) ||
    !validIndices(data)
  ) throw new Error("RISK_INDICES_CONTINUITY_PAYLOAD_INVALID");

  return new Response(continuity.payload_json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400",
      "x-content-type-options": "nosniff",
      "x-geomacro-authority": "backblaze-b2-risk-indices-edge",
      "x-geomacro-continuity": "github-actions-b2-readback-verified",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority, x-geomacro-continuity",
    },
  });
}

function unavailable(status = 503) {
  return new Response(JSON.stringify({ ok: false, code: "RISK_INDICES_EDGE_UNAVAILABLE" }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority",
    },
  });
}

async function buildResponse(env) {
  const liveBytes = await signedGet(LIVE_KEY, env);
  const proofBytes = await signedGet(PROOF_KEY, env);
  const liveDigest = await sha256(liveBytes);

  let proof;
  let live;
  try {
    proof = JSON.parse(decoder.decode(proofBytes));
    live = JSON.parse(decoder.decode(await gunzip(liveBytes)));
  } catch {
    throw new Error("RISK_INDICES_EDGE_JSON_INVALID");
  }

  const data = live?.data;
  if (
    proof?.schema !== "geomacro.public-risk-indices-live-proof.v1" ||
    proof?.source_project !== PROJECT_REF ||
    proof?.live_key !== LIVE_KEY ||
    proof?.compressed_sha256 !== liveDigest ||
    proof?.full_b2_readback_verified !== true ||
    proof?.exact_gzip_restore_verified !== true ||
    live?.schema !== "geomacro.public-risk-indices-live.v1" ||
    live?.source_project !== PROJECT_REF ||
    !recentEnough(live?.generated_at) ||
    data?.snapshotId !== proof?.snapshot_id ||
    data?.snapshotAsOf !== proof?.snapshot_as_of ||
    data?.contractVersion !== proof?.contract_version ||
    data?.parentMethodologyVersion !== proof?.parent_methodology_version ||
    !validIndices(data)
  ) throw new Error("RISK_INDICES_EDGE_BINDING_INVALID");

  return new Response(JSON.stringify(live), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400",
      "x-content-type-options": "nosniff",
      "x-geomacro-authority": "backblaze-b2-risk-indices-edge",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET") return unavailable(405);
    if (url.pathname !== "/risk-indices" || url.search) return unavailable(404);

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/risk-indices`, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const response = await buildResponse(env);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error("risk-indices-edge origin unavailable", error instanceof Error ? error.message : "unknown");
      try {
        const response = await buildContinuityResponse();
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (continuityError) {
        console.error("risk-indices-edge continuity unavailable", continuityError instanceof Error ? continuityError.message : "unknown");
        return unavailable(503);
      }
    }
  },
};
