import continuity from "./continuity.mjs";
import {originalSourceIsCurrent,liveEdgeCacheControl,validatedCachedLiveResponse} from "../../shared/current-source-clock.mjs";
import { reserveB2AccountQuota } from "../../control-plane/src/b2-account-quota.mjs";
import { b2OriginFailureCacheKey, failedB2OriginRecently, rememberFailedB2Origin } from "../../shared/b2-origin-negative-cache.mjs";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest-proof.json";
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const CONTRACT = "risk-indices-v1.1.0";
const METHOD = "gri-v1.2.0";
const D1_HOT_SNAPSHOT_URL = "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/risk-indices";
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
  // Account-wide D1 quota admission BEFORE any external Backblaze HTTP GET.
  // Only the infrequent D1-hot/cache-miss path reaches this function;
  // untrusted public traffic can never bypass or set its own quota.
  const reservation = await reserveB2AccountQuota(env.B2_QUOTA_DB, {
    kind: "GET",
    workflow_id: "risk_indices_public_edge",
  });
  if (reservation.ok !== true || reservation.reserved !== true) {
    throw new Error("B2_RISK_INDICES_EDGE_SHARED_QUOTA_EXHAUSTED");
  }

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
      (typeof index?.score !== "number" || !Number.isFinite(index.score) || index.score < 0 || index.score > 100) ||
      !Array.isArray(index?.series?.["7D"]?.buckets) ||
      index.series["7D"].buckets.length < 2 ||
      !Array.isArray(index?.series?.["30D"]?.buckets) ||
      index.series["30D"].buckets.length < index.series["7D"].buckets.length
    ) return false;
  }
  return expected.size === 0;
}


/**
 * Explicit archival route. The current /risk-indices endpoint remains
 * unchanged and refuses expired source clocks. Historical results are bound
 * to an actual previously verified B2 readback/proof (or an exact matching
 * deploy-time B2 readback artifact), never a synthetic re-timestamp.
 */
function validatedHistoricalPayload(live) {
  const data=live?.data;
  const generated=Date.parse(String(live?.generated_at??""));
  const original=Date.parse(String(data?.snapshotAsOf??""));
  const now=Date.now();
  if(live?.schema!=="geomacro.public-risk-indices-live.v1"||
    live?.source_project!==PROJECT_REF||
    !Number.isFinite(generated)||!Number.isFinite(original)||
    generated>now+5*60_000||original>generated+5*60_000||
    !validIndices(data)||!/^([a-f0-9]{64})$/.test(data?.proofHash??"")||
    !/^([a-f0-9]{64})$/.test(data?.inputHash??""))return false;
  return data.indices.every(index=>{
    const t=Date.parse(String(index.readingAsOf??""));
    return typeof index.score==="number"&&Number.isFinite(index.score)&&
      index.score>=0&&index.score<=100&&
      Number.isFinite(t)&&t<=generated+5*60_000;
  });
}
function historicalResponse(live,verification) {
  return new Response(JSON.stringify(live),{
    status:200,headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"public, max-age=300",
      "x-content-type-options":"nosniff",
      "x-geomacro-authority":"backblaze-b2-risk-indices-edge",
      "x-geomacro-display-status":"last_verified",
      "x-geomacro-historical-verification":verification,
      "x-geomacro-source-as-of":live.data.snapshotAsOf,
      "access-control-allow-origin":"*",
      "access-control-expose-headers":
        "x-geomacro-authority, x-geomacro-display-status, x-geomacro-historical-verification, x-geomacro-source-as-of"
    }
  });
}
async function buildHistoricalResponse(env) {
  // Zero-B2-request historical path if deployment retained its exact
  // readback-proved static bytes; this is not a current-score cache.
  if(continuity?.schema==="geomacro.edge-continuity.v1" &&
     continuity?.product==="risk-indices" &&
     continuity?.b2_readback_verified===true &&
     continuity?.projection==="exact-public-package" &&
     typeof continuity?.payload_json==="string" &&
     /^[a-f0-9]{64}$/.test(continuity?.payload_sha256??"") &&
     await sha256(continuity.payload_json)===continuity.payload_sha256) {
    try{
      const live=JSON.parse(continuity.payload_json);
      if(validatedHistoricalPayload(live))
        return historicalResponse(live,"deployment-b2-readback-verified");
    }catch{/* reject malformed historical continuity */}
  }
  // Two governed B2 reads. Require exact compressed-content SHA + immutable
  // proof contract before exposing any previously validated numeric value.
  const liveBytes=await signedGet(LIVE_KEY,env);
  const proofBytes=await signedGet(PROOF_KEY,env);
  const digest=await sha256(liveBytes);
  const proof=JSON.parse(decoder.decode(proofBytes));
  const live=JSON.parse(decoder.decode(await gunzip(liveBytes)));
  if(proof?.schema!=="geomacro.public-risk-indices-live-proof.v1"||
     proof?.source_project!==PROJECT_REF||
     proof?.live_key!==LIVE_KEY||
     proof?.compressed_sha256!==digest||
     proof?.full_b2_readback_verified!==true||
     proof?.exact_gzip_restore_verified!==true||
     proof?.snapshot_id!==live?.data?.snapshotId||
     proof?.snapshot_as_of!==live?.data?.snapshotAsOf||
     proof?.contract_version!==live?.data?.contractVersion||
     proof?.parent_methodology_version!==live?.data?.parentMethodologyVersion||
     !validatedHistoricalPayload(live))
    throw Error("RISK_INDICES_HISTORICAL_B2_PROOF_INVALID");
  return historicalResponse(live,"b2-exact-compressed-hash-readback-proof");
}

async function buildContinuityResponse() {
  if (
    continuity?.schema !== "geomacro.edge-continuity.v1" ||
    continuity?.product !== "risk-indices" ||
    continuity?.b2_readback_verified !== true ||
    continuity?.projection !== "exact-public-package" ||
    !/^\d+$/.test(String(continuity?.source_run_id ?? "")) ||
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
    !originalSourceIsCurrent(data?.snapshotAsOf) ||
    !validIndices(data)
  ) throw new Error("RISK_INDICES_CONTINUITY_PAYLOAD_INVALID");

  return new Response(continuity.payload_json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": liveEdgeCacheControl(data.snapshotAsOf),
      "x-content-type-options": "nosniff",
      "x-geomacro-authority": "backblaze-b2-risk-indices-edge",
      "x-geomacro-continuity": "github-actions-b2-readback-verified",
      "x-geomacro-source-as-of": data.snapshotAsOf,
      "x-geomacro-native-clock-contract": "live-60m-v1",
      "x-geomacro-worker-code-contract": "source-clock-guard-v1",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority, x-geomacro-continuity",
    },
  });
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
    if (
      snapshot?.ok !== true ||
      snapshot?.product !== "risk-indices" ||
      snapshot?.schema !== "geomacro.public-risk-indices-live.v1" ||
      snapshot?.proof_schema !== "geomacro.public-risk-indices-live-proof.v1" ||
      snapshot?.b2_object_key !== LIVE_KEY ||
      !/^[0-9a-f]{64}$/.test(String(snapshot?.b2_sha256 ?? "")) ||
      !/^[0-9a-f]{64}$/.test(String(snapshot?.payload_sha256 ?? "")) ||
      snapshot?.full_b2_readback_verified !== true ||
      snapshot?.exact_gzip_restore_verified !== true ||
      !Number.isFinite(generatedAt) ||
      !Number.isFinite(sourceAsOf) ||
      !Number.isFinite(expiresAt) ||
      !recentEnough(snapshot.generated_at) ||
      sourceAsOf > Date.now() + 5 * 60_000 ||
      Date.now() - sourceAsOf > 180 * 60 * 1000 ||
      // Signed 3h validity must never greenwash a >1h current index.
      Date.now() - sourceAsOf > 60 * 60 * 1000 ||
      expiresAt <= Date.now() ||
      expiresAt > sourceAsOf + 180 * 60 * 1000 ||
      await sha256(payloadJson) !== snapshot.payload_sha256
    ) return null;
    const live = JSON.parse(payloadJson);
    if (
      live?.schema !== "geomacro.public-risk-indices-live.v1" ||
      live?.source_project !== PROJECT_REF ||
      live?.generated_at !== snapshot.generated_at ||
      Date.parse(String(live?.data?.snapshotAsOf ?? "")) !== sourceAsOf ||
      !validIndices(live?.data)
    ) return null;
    return new Response(payloadJson, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": liveEdgeCacheControl(snapshot.source_as_of),
        "x-content-type-options": "nosniff",
        "x-geomacro-authority": "backblaze-b2-risk-indices-edge",
        "x-geomacro-continuity": "d1-b2-readback-verified-hot-snapshot",
        "x-geomacro-serving-store": "cloudflare-d1",
        "x-geomacro-source-as-of": snapshot.source_as_of,
        "x-geomacro-native-clock-contract": "live-60m-v1",
      "x-geomacro-worker-code-contract": "source-clock-guard-v1",
        "x-geomacro-b2-sha256": snapshot.b2_sha256,
        "x-geomacro-d1-payload-sha256": snapshot.payload_sha256,
        "x-geomacro-b2-verification": "full-readback-hash-exact-restore",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "x-geomacro-authority, x-geomacro-continuity, x-geomacro-serving-store, x-geomacro-source-as-of, x-geomacro-b2-sha256, x-geomacro-d1-payload-sha256, x-geomacro-b2-verification",
      },
    });
  } catch {
    return null;
  }
}

function unavailable(status = 503) {
  return new Response(JSON.stringify({ ok: false, code: "RISK_INDICES_EDGE_UNAVAILABLE" }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-geomacro-worker-code-contract": "source-clock-guard-v1",
      "x-geomacro-data-available": "false",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority, x-geomacro-worker-code-contract, x-geomacro-data-available",
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
    !originalSourceIsCurrent(data?.snapshotAsOf) ||
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
      "x-geomacro-source-as-of": data.snapshotAsOf,
      "x-geomacro-native-clock-contract": "live-60m-v1",
      "x-geomacro-worker-code-contract": "source-clock-guard-v1",
      "x-geomacro-b2-verification": "full-readback-hash-exact-restore",
      "cache-control": liveEdgeCacheControl(data.snapshotAsOf),
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
    if(url.pathname==="/risk-indices/history" && !url.search){
      const archiveCache=caches.default;
      const archiveKey=new Request(`${url.origin}/risk-indices/history`,{method:"GET"});
      const prior=await archiveCache.match(archiveKey);
      if(prior && prior.status===200 &&
        prior.headers.get("x-geomacro-display-status")==="last_verified"){
        try{
          const live=await prior.clone().json();
          if(validatedHistoricalPayload(live))return prior;
        }catch{/* revalidate source */}
      }
      const negativeKey=b2OriginFailureCacheKey(url.origin,"/risk-indices/history");
      if(await failedB2OriginRecently(archiveCache,negativeKey))return unavailable(503);
      try{
        const archived=await buildHistoricalResponse(env);
        ctx.waitUntil(archiveCache.put(archiveKey,archived.clone()));
        return archived;
      }catch{
        ctx.waitUntil(rememberFailedB2Origin(archiveCache,negativeKey));
        return unavailable(503);
      }
    }
    if (url.pathname !== "/risk-indices" || url.search) return unavailable(404);

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/risk-indices`, { method: "GET" });
    const hotSnapshot = await readD1HotSnapshot(env);
    if (hotSnapshot) {
      ctx.waitUntil(cache.put(cacheKey, hotSnapshot.clone()));
      return hotSnapshot;
    }

    const cached = await cache.match(cacheKey);
    if (await validatedCachedLiveResponse(cached,"risk-indices")) return cached;

    // Only after D1 hot and verified positive POP cache miss. A short private
    // failure marker prevents repeated B2 GETs for the same unavailable state.
    // Public users ALWAYS receive 503; no negative cache value is served.
    const negativeKey = b2OriginFailureCacheKey(url.origin, "/risk-indices");
    if (await failedB2OriginRecently(cache, negativeKey)) {
      // The negative POP marker suppresses ONLY additional quota-metered B2
      // GETs, never the independent B2-readback-verified static continuity
      // artifact bundled at deployment. This fallback does not use D1/B2,
      // spend credits or promote an old archived snapshot to fresh risk.
      try {
        const recovered = await buildContinuityResponse();
        ctx.waitUntil(cache.put(cacheKey, recovered.clone()));
        return recovered;
      } catch {
        return unavailable(503);
      }
    }

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
        // Both source and verified continuity failed: avoid burning two
        // new Backblaze GET tickets on each subsequent cold request in this POP.
        ctx.waitUntil(rememberFailedB2Origin(cache, negativeKey));
        return unavailable(503);
      }
    }
  },
};
