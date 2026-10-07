import continuity from "./continuity.mjs";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json";
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const HOT_OVERLAY_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/intelligence-overlay";
const HOT_OVERLAY_SCHEMA = "geomacro.public-intelligence-live-observed.v1";
const HOT_OVERLAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HOT_OVERLAY_MAX_ROWS = 24;
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
  if (!accessKey || !secretKey) throw new Error("B2_INTELLIGENCE_EDGE_CONFIG_REQUIRED");

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
    if (!response.ok) throw new Error(`B2_INTELLIGENCE_EDGE_READ_${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) {
      throw new Error("B2_INTELLIGENCE_EDGE_SIZE_INVALID");
    }
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) {
    throw new Error("B2_INTELLIGENCE_EDGE_DECOMPRESSED_SIZE_INVALID");
  }
  return raw;
}

function recentEnough(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) && parsed <= Date.now() + 5 * 60_000 && Date.now() - parsed <= MAX_AGE_MS;
}

function validRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 300) return false;
  const allowedKeys = new Set([
    "id", "source_title", "summary", "category", "severity", "delta",
    "created_at", "published_at", "public_status",
  ]);
  const scoredCategories = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    if (Object.keys(row).some((key) => !allowedKeys.has(key))) return false;
    const category = String(row.category ?? "").trim().toLowerCase();
    const title = String(row.source_title ?? "").replace(/\s+/g, " ").trim();
    if (!["geopolitics", "macro", "rare_earth"].includes(category)) return false;
    if (!String(row.id ?? "").trim()) return false;
    const created = Date.parse(String(row.created_at ?? ""));
    const published = row.published_at == null ? NaN : Date.parse(String(row.published_at));
    if (!Number.isFinite(created) && !Number.isFinite(published)) return false;

    if (row.public_status === "live_observed") {
      if (
        category !== "geopolitics" ||
        !title.startsWith("Geomacro observes ") ||
        row.severity !== null ||
        row.delta !== null
      ) return false;
      continue;
    }

    const severity = Number(row.severity);
    if (
      !title.startsWith("Geomacro finds ") ||
      !Number.isFinite(severity) ||
      severity < 0 ||
      severity > 100
    ) return false;
    scoredCategories.add(category);
  }
  return ["geopolitics", "macro", "rare_earth"].every((category) => scoredCategories.has(category));
}

function validHotOverlayRows(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > HOT_OVERLAY_MAX_ROWS) return false;
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const allowedKeys = new Set([
      "id", "source_title", "summary", "category", "severity", "delta",
      "created_at", "published_at", "public_status",
    ]);
    if (Object.keys(row).some((key) => !allowedKeys.has(key))) return false;
    const id = String(row.id ?? "").trim();
    const title = String(row.source_title ?? "").replace(/\s+/g, " ").trim();
    const timestamp = Date.parse(String(row.published_at ?? row.created_at ?? ""));
    if (
      !id ||
      !title.startsWith("Geomacro observes ") ||
      row.category !== "geopolitics" ||
      row.public_status !== "live_observed" ||
      row.severity !== null ||
      row.delta !== null ||
      !Number.isFinite(timestamp) ||
      timestamp > now + 5 * 60_000 ||
      now - timestamp > HOT_OVERLAY_MAX_AGE_MS
    ) return false;
    const key = `${id}|${title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

async function readHotOverlay() {
  try {
    const response = await fetch(HOT_OVERLAY_URL, {
      method: "GET",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(3_500),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const generatedAt = Date.parse(String(payload?.generated_at ?? ""));
    const sourceBatchAt = Date.parse(String(payload?.current_source_batch_at ?? ""));
    if (
      payload?.ok !== true ||
      payload?.schema !== HOT_OVERLAY_SCHEMA ||
      payload?.source_id !== "gdelt_v2_events" ||
      payload?.synthetic_score !== false ||
      payload?.raw_source_headlines_exposed !== false ||
      payload?.provider_identity_exposed !== false ||
      !Number.isFinite(generatedAt) ||
      !Number.isFinite(sourceBatchAt) ||
      generatedAt > Date.now() + 5 * 60_000 ||
      sourceBatchAt > Date.now() + 5 * 60_000 ||
      Date.now() - generatedAt > HOT_OVERLAY_MAX_AGE_MS ||
      Date.now() - sourceBatchAt > HOT_OVERLAY_MAX_AGE_MS ||
      !validHotOverlayRows(payload?.rows)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

async function applyHotOverlay(live) {
  const overlay = await readHotOverlay();
  if (!overlay) return { live, used: false };

  const scoredRows = Array.isArray(live?.rows)
    ? live.rows.filter((row) => row?.public_status !== "live_observed")
    : [];
  const rows = [...overlay.rows, ...scoredRows];
  if (!validRows(rows)) throw new Error("INTELLIGENCE_HOT_OVERLAY_COMPOSITION_INVALID");

  return {
    used: true,
    live: {
      ...live,
      generated_at: overlay.generated_at,
      current_evidence_contract: overlay.current_evidence_contract,
      current_overlay_authority: "cloudflare-d1-control-plane",
      current_overlay_source_batch_at: overlay.current_source_batch_at,
      rows,
    },
  };
}

async function buildContinuityResponse() {
  if (
    continuity?.schema !== "geomacro.edge-continuity.v1" ||
    continuity?.product !== "intelligence" ||
    continuity?.b2_readback_verified !== true ||
    continuity?.projection !== "verified-public-projection" ||
    !/^\d+$/.test(String(continuity?.source_run_id ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(continuity?.source_live_sha256 ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(continuity?.payload_sha256 ?? "")) ||
    typeof continuity?.payload_json !== "string"
  ) throw new Error("INTELLIGENCE_CONTINUITY_PROOF_INVALID");

  const payloadBytes = encoder.encode(continuity.payload_json);
  if (await sha256(payloadBytes) !== continuity.payload_sha256) {
    throw new Error("INTELLIGENCE_CONTINUITY_HASH_INVALID");
  }
  const live = JSON.parse(continuity.payload_json);
  if (
    live?.schema !== "geomacro.public-intelligence-live.v1" ||
    live?.source_project !== PROJECT_REF ||
    !recentEnough(live?.generated_at) ||
    !validRows(live?.rows)
  ) throw new Error("INTELLIGENCE_CONTINUITY_PAYLOAD_INVALID");

  const projected = await applyHotOverlay(live);
  return new Response(JSON.stringify(projected.live), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400",
      "x-content-type-options": "nosniff",
      "x-geomacro-authority": "backblaze-b2-intelligence-edge",
      "x-geomacro-continuity": "github-actions-b2-readback-verified-projection",
      "x-geomacro-current-overlay": projected.used ? "cloudflare-d1-hot" : "none",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority, x-geomacro-continuity, x-geomacro-current-overlay",
    },
  });
}

function unavailable(status = 503) {
  return new Response(JSON.stringify({ ok: false, code: "INTELLIGENCE_EDGE_UNAVAILABLE" }), {
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
  const [liveBytes, proofBytes] = await Promise.all([
    signedGet(LIVE_KEY, env),
    signedGet(PROOF_KEY, env),
  ]);
  const liveDigest = await sha256(liveBytes);

  let proof;
  let live;
  try {
    proof = JSON.parse(decoder.decode(proofBytes));
    live = JSON.parse(decoder.decode(await gunzip(liveBytes)));
  } catch {
    throw new Error("INTELLIGENCE_EDGE_JSON_INVALID");
  }

  const rows = live?.rows;
  const verifiedRows = Array.isArray(rows)
    ? rows.filter((row) => row?.public_status !== "live_observed").length
    : 0;
  const liveObservedRows = Array.isArray(rows)
    ? rows.filter((row) => row?.public_status === "live_observed").length
    : 0;

  if (
    proof?.schema !== "geomacro.public-intelligence-live-proof.v1" ||
    proof?.source_project !== PROJECT_REF ||
    proof?.live_key !== LIVE_KEY ||
    proof?.compressed_sha256 !== liveDigest ||
    proof?.full_b2_readback_verified !== true ||
    proof?.exact_gzip_restore_verified !== true ||
    proof?.raw_source_headlines_exposed !== false ||
    proof?.provider_identity_exposed !== false ||
    proof?.synthetic_score !== false ||
    live?.schema !== "geomacro.public-intelligence-live.v1" ||
    live?.source_project !== PROJECT_REF ||
    proof?.generated_at !== live?.generated_at ||
    !recentEnough(live?.generated_at) ||
    proof?.row_count !== rows?.length ||
    proof?.verified_scored_rows !== verifiedRows ||
    proof?.live_observed_rows !== liveObservedRows ||
    !validRows(rows)
  ) throw new Error("INTELLIGENCE_EDGE_BINDING_INVALID");

  const projected = await applyHotOverlay(live);
  return new Response(JSON.stringify(projected.live), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400",
      "x-content-type-options": "nosniff",
      "x-geomacro-authority": "backblaze-b2-intelligence-edge",
      "x-geomacro-current-overlay": projected.used ? "cloudflare-d1-hot" : "none",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-geomacro-authority, x-geomacro-current-overlay",
    },
  });
}

async function projectCachedResponse(cached) {
  let live;
  try {
    live = await cached.clone().json();
  } catch {
    throw new Error("INTELLIGENCE_EDGE_CACHE_JSON_INVALID");
  }
  if (
    live?.schema !== "geomacro.public-intelligence-live.v1" ||
    live?.source_project !== PROJECT_REF ||
    !recentEnough(live?.generated_at) ||
    !validRows(live?.rows)
  ) throw new Error("INTELLIGENCE_EDGE_CACHE_PAYLOAD_INVALID");

  const projected = await applyHotOverlay(live);
  const headers = new Headers(cached.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-geomacro-current-overlay", projected.used ? "cloudflare-d1-hot" : "none");
  const exposed = new Set(
    String(headers.get("access-control-expose-headers") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  exposed.add("x-geomacro-current-overlay");
  headers.set("access-control-expose-headers", [...exposed].join(", "));
  return new Response(JSON.stringify(projected.live), {
    status: 200,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET") return unavailable(405);
    if (url.pathname !== "/intelligence" || url.search) return unavailable(404);

    // L2 continuity for any already-warm POP. Workers Cache is enabled in
    // wrangler and sits in front of this entrypoint as the global L1.
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/intelligence?projection=d1-hot-v1`, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      try {
        return await projectCachedResponse(cached);
      } catch (error) {
        console.error(
          "intelligence-edge cached projection invalid",
          error instanceof Error ? error.message : "unknown",
        );
      }
    }

    try {
      const response = await buildResponse(env);
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error("intelligence-edge origin unavailable", error instanceof Error ? error.message : "unknown");
      try {
        const response = await buildContinuityResponse();
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (continuityError) {
        console.error("intelligence-edge continuity unavailable", continuityError instanceof Error ? continuityError.message : "unknown");
        return unavailable(503);
      }
    }
  },
};
