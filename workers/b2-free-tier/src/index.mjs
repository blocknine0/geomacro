import { reserveB2AccountQuota, B2_DAILY_LIMITS } from "../../control-plane/src/b2-account-quota.mjs";

const HARD_STORAGE_BYTES = 9_200_000_000;
const CLEAN_TARGET_BYTES = 8_500_000_000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DAILY_UPLOAD_LIMIT = 2_000;
const DAILY_CLASS_A_LIMIT = 2_000;
const DAILY_CLASS_B_LIMIT = 2_000;
const CACHE_SECONDS = 7 * 24 * 60 * 60;
const MANAGED_PREFIX = "geomacro-evidence/v1/private/b2-managed/";
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a ?? ""));
  const right = encoder.encode(String(b ?? ""));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

function requireConfigured(env) {
  const fields = ["DB", "B2_ENDPOINT", "B2_REGION", "B2_BUCKET", "B2_KEY_ID", "B2_APPLICATION_KEY", "UPLOAD_BEARER_TOKEN"];
  if (fields.some((field) => !env[field])) throw new Error("B2_GATEWAY_CONFIG_REQUIRED");
  const endpoint = new URL(env.B2_ENDPOINT);
  if (endpoint.protocol !== "https:" || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/u.test(endpoint.hostname)) {
    throw new Error("B2_GATEWAY_ENDPOINT_INVALID");
  }
  if (env.B2_BUCKET !== "geomacro-private-archive") throw new Error("B2_GATEWAY_BUCKET_INVALID");
  return endpoint;
}

function dayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function pathFor(id) {
  return `${MANAGED_PREFIX}${id}`;
}

function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part).replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
}

function encodeQuery(query) {
  return [...query.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

async function sha256(bytes) {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(key, value) {
  const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, value));
}

async function signingKey(secret, date, region) {
  const kDate = await hmac(encoder.encode(`AWS4${secret}`), encoder.encode(date));
  const kRegion = await hmac(kDate, encoder.encode(region));
  const kService = await hmac(kRegion, encoder.encode("s3"));
  return hmac(kService, encoder.encode("aws4_request"));
}

export async function signB2Request({ method, endpoint, bucket, key, region, accessKey, secretKey, body = new Uint8Array(), query = new URLSearchParams(), now = new Date(), contentType }) {
  const target = new URL(endpoint);
  const path = `/${encodeURIComponent(bucket)}/${encodePath(key)}`;
  const canonicalQuery = encodeQuery(query);
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/gu, "");
  const date = timestamp.slice(0, 8);
  const payloadHash = await sha256(body);
  const headers = {
    host: target.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": timestamp,
  };
  if (contentType) headers["content-type"] = contentType;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, await sha256(encoder.encode(canonicalRequest))].join("\n");
  const keyBytes = await signingKey(secretKey, date, region);
  const signature = hex(await hmac(keyBytes, encoder.encode(stringToSign)));
  const url = `${target.origin}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const requestHeaders = new Headers({
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": timestamp,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  });
  if (contentType) requestHeaders.set("content-type", contentType);
  return { url, headers: requestHeaders, body: method === "PUT" ? body : undefined };
}

async function s3Request(env, method, key, { body = new Uint8Array(), query = new URLSearchParams(), contentType } = {}) {
  const request = await signB2Request({
    method,
    endpoint: env.B2_ENDPOINT,
    bucket: env.B2_BUCKET,
    key,
    region: env.B2_REGION,
    accessKey: env.B2_KEY_ID,
    secretKey: env.B2_APPLICATION_KEY,
    body,
    query,
    contentType,
  });
  const response = await fetch(request.url, {
    method,
    headers: request.headers,
    body: request.body,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("B2_REDIRECT_REFUSED");
  return response;
}

async function blockForToday(env, reason, now = new Date()) {
  const day = dayUtc(now);
  const timestamp = now.toISOString();
  await env.DB.prepare(`
    INSERT INTO b2_daily_usage(day_utc,blocked_reason,updated_at) VALUES(?,?,?)
    ON CONFLICT(day_utc) DO UPDATE SET blocked_reason=excluded.blocked_reason,updated_at=excluded.updated_at
  `).bind(day, reason, timestamp).run();
}

async function reserveClassA(env, { upload = false, now = new Date() } = {}) {
  const shared = await reserveB2AccountQuota(env.DB, {
    kind: "PUT", workflow_id: "b2_free_tier_gateway",
  }, { now });
  if (!shared.ok || !shared.reserved) throw new Error("B2_GLOBAL_DAILY_QUOTA_EXHAUSTED");
  if (upload) return; // The INSERT trigger separately reserved this upload request and gateway-local count.
  const day = dayUtc(now);
  const timestamp = now.toISOString();
  const row = await env.DB.prepare(`
    INSERT INTO b2_daily_usage(day_utc,class_a_calls,updated_at) VALUES(?,1,?)
    ON CONFLICT(day_utc) DO UPDATE SET class_a_calls=class_a_calls+1,updated_at=excluded.updated_at
    WHERE class_a_calls < ? AND blocked_reason IS NULL
    RETURNING class_a_calls
  `).bind(day, timestamp, DAILY_CLASS_A_LIMIT).first();
  if (!row) throw new Error("B2_DAILY_CLASS_A_LIMIT");
}

async function reserveClassB(env, now = new Date()) {
  const shared = await reserveB2AccountQuota(env.DB, {
    kind: "GET", workflow_id: "b2_free_tier_gateway",
  }, { now });
  if (!shared.ok || !shared.reserved) throw new Error("B2_GLOBAL_DAILY_QUOTA_EXHAUSTED");
  const day = dayUtc(now);
  const timestamp = now.toISOString();
  const row = await env.DB.prepare(`
    INSERT INTO b2_daily_usage(day_utc,class_b_calls,updated_at) VALUES(?,1,?)
    ON CONFLICT(day_utc) DO UPDATE SET class_b_calls=class_b_calls+1,updated_at=excluded.updated_at
    WHERE class_b_calls < ? AND blocked_reason IS NULL
    RETURNING class_b_calls
  `).bind(day, timestamp, DAILY_CLASS_B_LIMIT).first();
  if (!row) throw new Error("B2_DAILY_CLASS_B_LIMIT");
}

function isProviderCapError(response, text) {
  return response.status === 403 && /transaction_cap_exceeded|download_cap_exceeded|storage_cap_exceeded/iu.test(text);
}

async function handleProviderResponse(env, response) {
  if (response.ok) return;
  const text = await response.text().catch(() => "");
  if (isProviderCapError(response, text)) await blockForToday(env, "B2_PROVIDER_CAP_REACHED");
  throw new Error(`B2_ORIGIN_${response.status}`);
}

async function storageUsage(env) {
  const row = await env.DB.prepare(`
    SELECT b.account_bytes + COALESCE((SELECT SUM(size_bytes) FROM files),0) AS total_bytes
    FROM b2_storage_baseline b WHERE b.singleton=1 AND b.verified_at IS NOT NULL
  `).first();
  if (!row || !Number.isSafeInteger(Number(row.total_bytes))) throw new Error("B2_STORAGE_BASELINE_UNVERIFIED");
  return Number(row.total_bytes);
}

async function deleteRow(env, row) {
  if (!row?.b2_file_id || !row?.path?.startsWith(MANAGED_PREFIX)) throw new Error("B2_CLEANUP_ROW_INVALID");
  await reserveClassA(env);
  const query = new URLSearchParams({ versionId: row.b2_file_id });
  const response = await s3Request(env, "DELETE", row.path, { query });
  await handleProviderResponse(env, response);
  await env.DB.prepare("DELETE FROM files WHERE id=? AND status='deleting'").bind(row.id).run();
}

export async function cleanup(env, { maxDeletes = 25, now = new Date() } = {}) {
  if (!Number.isInteger(maxDeletes) || maxDeletes < 1 || maxDeletes > 100) throw new Error("B2_CLEANUP_LIMIT_INVALID");
  const before = await storageUsage(env);
  let removed = 0;
  while (removed < maxDeletes) {
    const usage = await storageUsage(env);
    const stranded = await env.DB.prepare(`
      SELECT id,path,b2_file_id,size_bytes,expires_at,last_accessed_at,created_at,status
      FROM files WHERE status='deleting' AND b2_file_id IS NOT NULL
      ORDER BY created_at ASC LIMIT 1
    `).first();
    const expired = stranded ?? await env.DB.prepare(`
      SELECT id,path,b2_file_id,size_bytes,expires_at,last_accessed_at,created_at,status
      FROM files WHERE status='ready' AND evictable=1 AND expires_at IS NOT NULL AND expires_at<=?
      ORDER BY expires_at ASC,created_at ASC LIMIT 1
    `).bind(now.toISOString()).first();
    const row = expired ?? (usage >= CLEAN_TARGET_BYTES
      ? await env.DB.prepare(`
          SELECT id,path,b2_file_id,size_bytes,expires_at,last_accessed_at,created_at,status
          FROM files WHERE status='ready' AND evictable=1
          ORDER BY COALESCE(last_accessed_at,created_at) ASC,created_at ASC LIMIT 1
        `).first()
      : null);
    if (!row) break;
    if (row.status !== "deleting") {
      const claim = await env.DB.prepare("UPDATE files SET status='deleting' WHERE id=? AND status='ready'").bind(row.id).run();
      if (claim.meta?.changes !== 1) continue;
    }
    try {
      await deleteRow(env, row);
      removed += 1;
    } catch (error) {
      await env.DB.prepare("UPDATE files SET status='ready' WHERE id=? AND status='deleting'").bind(row.id).run().catch(() => {});
      throw error;
    }
  }
  return { before_bytes: before, after_bytes: await storageUsage(env), deleted: removed };
}

async function authorized(request, env) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && constantTimeEqual(header.slice(7), env.UPLOAD_BEARER_TOKEN);
}

async function upload(request, env) {
  if (!(await authorized(request, env))) return json({ error: "UNAUTHORIZED" }, 401);
  const length = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_UPLOAD_BYTES) return json({ error: "UPLOAD_SIZE_INVALID" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== length || bytes.byteLength > MAX_UPLOAD_BYTES) return json({ error: "UPLOAD_SIZE_INVALID" }, 413);
  const mimeType = (request.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(mimeType)) return json({ error: "MIME_TYPE_INVALID" }, 400);
  const visibility = request.headers.get("x-geomacro-visibility") === "public" ? "public" : "private";
  const evictable = request.headers.get("x-geomacro-retention") === "retain" ? 0 : 1;
  const ttlSeconds = Math.min(Math.max(Number(request.headers.get("x-geomacro-ttl-seconds") ?? 604800), 60), 31536000);
  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const key = pathFor(id);
  const digest = await sha256(bytes);

  // Expired objects are removed first; at the soft watermark the cleaner also
  // evicts the oldest explicitly-evictable object before admitting new bytes.
  await cleanup(env, { maxDeletes: 25 });

  // This insert trigger atomically checks account baseline + all live/pending
  // bytes, then reserves a daily upload and Class-A operation before B2 I/O.
  try {
    await env.DB.prepare(`
      INSERT INTO files(id,path,b2_file_id,size_bytes,mime_type,sha256,created_at,status,visibility,expires_at,last_accessed_at,evictable)
      VALUES(?,?,NULL,?,?,?,?,'pending',?,?,NULL,?)
    `).bind(id, key, bytes.byteLength, mimeType, digest, createdAt, visibility,
      evictable ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null, evictable).run();
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("B2_STORAGE_BASELINE_UNVERIFIED")) return json({ error: "STORAGE_BASELINE_UNVERIFIED" }, 503);
    if (message.includes("B2_STORAGE_HARD_LIMIT")) return json({ error: "STORAGE_LIMIT_9_2GB" }, 507);
    if (message.includes("B2_DAILY_UPLOAD_OR_CLASS_A_LIMIT")) return json({ error: "DAILY_UPLOAD_LIMIT_2000" }, 429);
    throw error;
  }

  // The gateway and existing GeoMacro B2 edge workers share this atomic D1
  // account ledger. No upload reaches B2 until both gateway-local and shared
  // Class-A reservations have succeeded.
  try {
    await reserveClassA(env, { upload: true });
  } catch (error) {
    await env.DB.prepare("DELETE FROM files WHERE id=? AND status='pending'").bind(id).run().catch(() => {});
    const message = String(error?.message ?? error);
    if (message === "B2_GLOBAL_DAILY_QUOTA_EXHAUSTED") return json({ error: message }, 429);
    return json({ error: "B2_QUOTA_LEDGER_UNAVAILABLE" }, 503);
  }

  try {
    const response = await s3Request(env, "PUT", key, { body: bytes, contentType: mimeType });
    await handleProviderResponse(env, response);
    const versionId = response.headers.get("x-amz-version-id");
    if (!versionId) throw new Error("B2_VERSION_ID_MISSING");
    const finalized = await env.DB.prepare("UPDATE files SET b2_file_id=?,status='ready' WHERE id=? AND status='pending'")
      .bind(versionId, id).run();
    if (finalized.meta?.changes !== 1) throw new Error("B2_METADATA_FINALIZE_FAILED");
  } catch (error) {
    // Keep the pending reservation on ambiguous origin/D1 outcomes. Releasing
    // it could undercount an object that B2 accepted before the connection failed.
    const message = String(error?.message ?? error);
    if (message.startsWith("B2_ORIGIN_")) return json({ error: "B2_UPLOAD_NOT_CONFIRMED", id }, 503);
    throw error;
  }
  return json({ id, path: key, size_bytes: bytes.byteLength, mime_type: mimeType, sha256: digest, status: "ready" }, 201);
}

async function publicRead(request, env, ctx, id) {
  if (!/^[0-9a-f-]{36}$/iu.test(id)) return json({ error: "NOT_FOUND" }, 404);
  const cache = caches.default;
  const cacheKey = new Request(new URL(`/v1/files/${id}`, new URL(request.url).origin), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const row = await env.DB.prepare(`
    SELECT id,path,b2_file_id,size_bytes,mime_type,sha256,visibility,status
    FROM files WHERE id=? AND visibility='public' AND status='ready' LIMIT 1
  `).bind(id).first();
  if (!row || !row.path.startsWith(MANAGED_PREFIX) || !row.b2_file_id) return json({ error: "NOT_FOUND" }, 404);
  const headers = new Headers({
    "content-type": row.mime_type,
    "content-length": String(row.size_bytes),
    "cache-control": `public, max-age=${CACHE_SECONDS}, immutable`,
    etag: `"${row.sha256}"`,
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*",
  });
  if (request.headers.get("if-none-match") === `"${row.sha256}"`) {
    return new Response(null, { status: 304, headers });
  }
  await reserveClassB(env);
  const response = await s3Request(env, "GET", row.path);
  try {
    await handleProviderResponse(env, response);
  } catch {
    return json({ error: "ORIGIN_UNAVAILABLE" }, 503);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== row.size_bytes || await sha256(bytes) !== row.sha256) {
    await blockForToday(env, "B2_OBJECT_INTEGRITY_MISMATCH");
    return json({ error: "OBJECT_INTEGRITY_MISMATCH" }, 502);
  }
  await env.DB.prepare("UPDATE files SET last_accessed_at=? WHERE id=? AND status='ready'")
    .bind(new Date().toISOString(), id).run();
  const result = new Response(bytes, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, result.clone()));
  return result;
}

async function adminCleanup(request, env) {
  if (!(await authorized(request, env))) return json({ error: "UNAUTHORIZED" }, 401);
  try {
    return json({ ok: true, ...(await cleanup(env)) });
  } catch (error) {
    return json({ error: String(error?.message ?? "CLEANUP_FAILED") }, 503);
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      requireConfigured(env);
      const url = new URL(request.url);
      if (request.method === "PUT" && url.pathname === "/v1/files") return upload(request, env);
      if (request.method === "POST" && url.pathname === "/v1/admin/cleanup") return adminCleanup(request, env);
      const match = url.pathname.match(/^\/v1\/files\/([^/]+)$/u);
      if (request.method === "GET" && match) return publicRead(request, env, ctx, decodeURIComponent(match[1]));
      return json({ error: "NOT_FOUND" }, 404);
    } catch (error) {
      const message = String(error?.message ?? "B2_GATEWAY_FAILURE");
      if (message.startsWith("B2_DAILY_CLASS_")) return json({ error: message }, 429);
      return json({ error: message.startsWith("B2_") ? message : "B2_GATEWAY_FAILURE" }, 503);
    }
  },

  async scheduled(_controller, env) {
    requireConfigured(env);
    await cleanup(env, { maxDeletes: 100 });
  },
};

export const limits = Object.freeze({
  hardStorageBytes: HARD_STORAGE_BYTES,
  cleanTargetBytes: CLEAN_TARGET_BYTES,
  dailyUploadLimit: DAILY_UPLOAD_LIMIT,
  dailyClassALimit: B2_DAILY_LIMITS.PUT,
  dailyClassBLimit: B2_DAILY_LIMITS.GET + B2_DAILY_LIMITS.HEAD,
  dailyClassCLimit: B2_DAILY_LIMITS.NATIVE_AUTH,
  dailyClassCListLimit: 0,
  cacheSeconds: CACHE_SECONDS,
  managedPrefix: MANAGED_PREFIX,
  emptySha256: EMPTY_SHA256,
});
