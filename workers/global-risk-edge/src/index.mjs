import continuity from "./continuity.mjs";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/global-risk/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/global-risk/latest-proof.json";
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const METHOD = "gri-v1.2.0";
const CURRENT_PROOF_SCHEMA = "geomacro.public-global-risk-current-proof.v1";
const CURRENT_PROOF_MODE = "independent-gri-proof-over-b2-baseline";
const D1_HOT_SNAPSHOT_URL = "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/global-risk";
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
  if (!accessKey || !secretKey) throw new Error("B2_EDGE_CONFIG_REQUIRED");

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
    if (!response.ok) throw new Error(`B2_EDGE_READ_${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) throw new Error("B2_EDGE_SIZE_INVALID");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) throw new Error("B2_EDGE_DECOMPRESSED_SIZE_INVALID");
  return raw;
}

function recentEnough(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && parsed <= Date.now() + 5 * 60_000 && Date.now() - parsed <= MAX_AGE_MS;
}

function validDomains(data) {
  const domains = data?.domainIndices;
  if (!domains || typeof domains !== "object" || Array.isArray(domains)) return false;
  return ["geopolitics", "macro", "rare_earth"].every((key) => {
    const domain = domains[key];
    return domain && typeof domain === "object" &&
      Array.isArray(domain?.series?.["7D"]?.buckets) &&
      domain.series["7D"].buckets.length >= 2;
  });
}

async function buildContinuityResponse() {
  if (
    continuity?.schema !== "geomacro.edge-continuity.v1" ||
    continuity?.product !== "global-risk" ||
    continuity?.b2_readback_verified !== true ||
    continuity?.projection !== "exact-public-package" ||
    !/^\d+$/.test(String(continuity?.source_run_id ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(continuity?.source_live_sha256 ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(continuity?.payload_sha256 ?? "")) ||
    typeof continuity?.payload_json !== "string"
  ) throw new Error("GLOBAL_RISK_CONTINUITY_PROOF_INVALID");

  const payloadBytes = encoder.encode(continuity.payload_json);
  if (await sha256(payloadBytes) !== continuity.payload_sha256) {
    throw new Error("GLOBAL_RISK_CONTINUITY_HASH_INVALID");
  }
  const live = JSON.parse(continuity.payload_json);
  const data = live?.data;
  if (
    live?.schema !== "geomacro.public-global-risk-live.v1" ||
    live?.source_project !== PROJECT_REF ||
    !recentEnough(live?.generated_at) ||
    data?.methodologyVersion !== METHOD ||
    data?.verificationStatus !== "verified" ||
    data?.auditPersisted !== true ||
    !validDomains(data)
  ) throw new Error("GLOBAL_RISK_CONTINUITY_PAYLOAD_INVALID");

  return new Response(continuity.payload_json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400",
      "x-content-type-options": "nosniff",
      "x-geomacro-authority": "backblaze-b2-verified-edge",
      "x-geomacro-continuity": "github-actions-b2-readback-verified",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority, x-geomacro-continuity",
    },
  });
}

function validCurrentProofValue(live) {
  const data = live?.data;
  const proof = live?.current_proof;
  const domains = data?.domainIndices;
  if (
    live?.verification_mode !== CURRENT_PROOF_MODE ||
    live?.current_b2_snapshot_promoted !== false ||
    !/^[0-9a-f]{64}$/.test(String(live?.baseline_b2_sha256 ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(live?.baseline_payload_sha256 ?? "")) ||
    !/^\d{1,20}$/.test(String(live?.baseline_source_run_id ?? "")) ||
    !Number.isFinite(Date.parse(String(live?.baseline_generated_at ?? ""))) ||
    Date.now() - Date.parse(String(live?.baseline_generated_at ?? "")) > 30 * 24 * 60 * 60 * 1000 ||
    data?.verificationStatus !== "verified" ||
    data?.methodologyVersion !== METHOD ||
    data?.auditPersisted !== true ||
    !proof ||
    proof.proofHash !== data.proofHash ||
    proof.evidenceHash !== data.evidenceHash ||
    proof.calculationHash !== data.calculationHash ||
    proof.dispositionHash !== data.dispositionHash ||
    proof.inputHash !== data.inputHash ||
    proof.methodologyHash !== data.methodologyHash ||
    proof.changeHash !== data.changeHash ||
    Number(proof.candidateEventCount) !== Number(data.candidateEventCount) ||
    Number(proof.reconciliationResidual) !== Number(data.reconciliationResidual) ||
    Number(proof.changeResidual) !== Number(data.changeResidual) ||
    !domains || typeof domains !== "object" || Array.isArray(domains)
  ) return false;
  for (const key of ["proofHash","evidenceHash","calculationHash","dispositionHash","inputHash","methodologyHash","changeHash"]) {
    if (!/^[0-9a-f]{64}$/.test(String(data?.[key] ?? ""))) return false;
  }
  return validDomains(data);
}

async function readD1HotSnapshot(env) {
  try {
    if (!env?.CONTROL_PLANE || typeof env.CONTROL_PLANE.fetch !== "function") return null;
    const response = await env.CONTROL_PLANE.fetch(new Request(D1_HOT_SNAPSHOT_URL, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(3_500),
    }));
    if (!response.ok) return null;
    const snapshot = await response.json();
    const generatedAt = Date.parse(String(snapshot?.generated_at ?? ""));
    const sourceAsOf = Date.parse(String(snapshot?.source_as_of ?? ""));
    const expiresAt = Date.parse(String(snapshot?.expires_at ?? ""));
    const payloadJson = String(snapshot?.payload_json ?? "");
    const recovery =
      snapshot?.proof_schema === CURRENT_PROOF_SCHEMA &&
      snapshot?.verification_mode === CURRENT_PROOF_MODE;
    const direct =
      snapshot?.proof_schema === "geomacro.public-global-risk-live-proof.v1" &&
      snapshot?.verification_mode === "direct-b2-readback";
    if (
      snapshot?.ok !== true ||
      snapshot?.product !== "global-risk" ||
      snapshot?.schema !== "geomacro.public-global-risk-live.v1" ||
      (!direct && !recovery) ||
      snapshot?.b2_object_key !== LIVE_KEY ||
      !/^[0-9a-f]{64}$/.test(String(snapshot?.b2_sha256 ?? "")) ||
      !/^[0-9a-f]{64}$/.test(String(snapshot?.payload_sha256 ?? "")) ||
      !Number.isFinite(generatedAt) ||
      !Number.isFinite(sourceAsOf) ||
      !Number.isFinite(expiresAt) ||
      !recentEnough(snapshot.generated_at) ||
      sourceAsOf > Date.now() + 5 * 60_000 ||
      Date.now() - sourceAsOf > 90 * 60 * 1000 ||
      expiresAt <= Date.now() ||
      expiresAt > sourceAsOf + 90 * 60 * 1000 ||
      await sha256(payloadJson) !== snapshot.payload_sha256 ||
      (
        direct &&
        (
          snapshot?.full_b2_readback_verified !== true ||
          snapshot?.exact_gzip_restore_verified !== true ||
          snapshot?.current_b2_readback_verified !== true ||
          snapshot?.current_b2_snapshot_promoted !== true
        )
      ) ||
      (
        recovery &&
        (
          snapshot?.baseline_b2_readback_verified !== true ||
          snapshot?.baseline_exact_gzip_restore_verified !== true ||
          snapshot?.current_b2_readback_verified !== false ||
          snapshot?.current_b2_snapshot_promoted !== false
        )
      )
    ) return null;
    const live = JSON.parse(payloadJson);
    const data = live?.data;
    if (
      live?.schema !== "geomacro.public-global-risk-live.v1" ||
      live?.source_project !== PROJECT_REF ||
      live?.generated_at !== snapshot.generated_at ||
      data?.methodologyVersion !== METHOD ||
      data?.verificationStatus !== "verified" ||
      data?.auditPersisted !== true ||
      Date.parse(String(data?.snapshotAsOf ?? "")) !== sourceAsOf ||
      (recovery && (
        live?.baseline_b2_sha256 !== snapshot.b2_sha256 ||
        !validCurrentProofValue(live)
      )) ||
      (!recovery && !validDomains(data))
    ) return null;
    return new Response(payloadJson, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400",
        "x-content-type-options": "nosniff",
        "x-geomacro-authority": "backblaze-b2-verified-edge",
        "x-geomacro-continuity": "d1-b2-readback-verified-hot-snapshot",
        "x-geomacro-serving-store": "cloudflare-d1",
        "x-geomacro-source-as-of": snapshot.source_as_of,
        "x-geomacro-b2-sha256": snapshot.b2_sha256,
        "x-geomacro-d1-payload-sha256": snapshot.payload_sha256,
        "x-geomacro-b2-verification":
          recovery ? "baseline-full-readback-current-gri-proof" : "full-readback-hash-exact-restore",
        "x-geomacro-verification-mode":
          recovery ? CURRENT_PROOF_MODE : "direct-b2-readback",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "x-geomacro-authority, x-geomacro-continuity, x-geomacro-serving-store, x-geomacro-source-as-of, x-geomacro-b2-sha256, x-geomacro-d1-payload-sha256, x-geomacro-b2-verification, x-geomacro-verification-mode",
      },
    });
  } catch {
    return null;
  }
}

function unavailable(status = 503) {
  return new Response(JSON.stringify({ ok: false, code: "GLOBAL_RISK_EDGE_UNAVAILABLE" }), {
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
    throw new Error("GLOBAL_RISK_EDGE_JSON_INVALID");
  }

  const data = live?.data;
  if (
    proof?.schema !== "geomacro.public-global-risk-live-proof.v1" ||
    proof?.source_project !== PROJECT_REF ||
    proof?.live_key !== LIVE_KEY ||
    proof?.compressed_sha256 !== liveDigest ||
    proof?.full_b2_readback_verified !== true ||
    proof?.exact_gzip_restore_verified !== true ||
    live?.schema !== "geomacro.public-global-risk-live.v1" ||
    live?.source_project !== PROJECT_REF ||
    !recentEnough(live?.generated_at) ||
    data?.snapshotId !== proof?.snapshot_id ||
    data?.snapshotAsOf !== proof?.snapshot_as_of ||
    data?.methodologyVersion !== METHOD ||
    data?.verificationStatus !== "verified" ||
    data?.auditPersisted !== true ||
    !validDomains(data)
  ) throw new Error("GLOBAL_RISK_EDGE_BINDING_INVALID");

  return new Response(JSON.stringify(live), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400",
      "x-content-type-options": "nosniff",
      "x-geomacro-authority": "backblaze-b2-verified-edge",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET") return unavailable(405);
    if (url.pathname !== "/global-risk" || url.search) return unavailable(404);

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/global-risk`, { method: "GET" });
    const hotSnapshot = await readD1HotSnapshot(env);
    if (hotSnapshot) {
      ctx.waitUntil(cache.put(cacheKey, hotSnapshot.clone()));
      return hotSnapshot;
    }

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const response = await buildResponse(env);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error("global-risk-edge origin unavailable", error instanceof Error ? error.message : "unknown");
      try {
        const response = await buildContinuityResponse();
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (continuityError) {
        console.error("global-risk-edge continuity unavailable", continuityError instanceof Error ? continuityError.message : "unknown");
        return unavailable(503);
      }
    }
  },
};
