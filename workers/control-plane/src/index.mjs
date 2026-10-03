const MAX_BODY_BYTES = 64 * 1024;
const HASH_RE = /^[0-9a-f]{64}$/;
const SOURCE_KEY_RE = /^[a-z0-9][a-z0-9_.:-]{1,127}$/;
const COUNTRY_RE = /^[A-Z]{3}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const OBJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,191}$/;
const STATUS_RE = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function secureEqual(left, right) {
  const a = new TextEncoder().encode(String(left ?? ""));
  const b = new TextEncoder().encode(String(right ?? ""));
  if (a.length !== b.length || a.length < 32) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function bearer(request) {
  const value = String(request.headers.get("authorization") ?? "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function authorized(request, env) {
  const expected = String(env.CONTROL_PLANE_TOKEN ?? "").trim();
  if (!expected || expected.length < 32) return { ok: false, status: 503, error: "CONTROL_PLANE_AUTH_UNCONFIGURED" };
  const supplied = bearer(request);
  if (!secureEqual(supplied, expected)) return { ok: false, status: 401, error: "UNAUTHORIZED" };
  return { ok: true };
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const parsed = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_BODY");
  return parsed;
}

function boundedText(value, max, required = true) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    if (required) throw new Error("MISSING_VALUE");
    return null;
  }
  if (normalized.length > max) throw new Error("VALUE_TOO_LONG");
  return normalized;
}

function status(value) {
  const normalized = boundedText(value, 64);
  if (!STATUS_RE.test(normalized)) throw new Error("INVALID_STATUS");
  return normalized;
}

function iso(value, required = false) {
  if (value == null || String(value).trim() === "") {
    if (required) throw new Error("MISSING_TIMESTAMP");
    return null;
  }
  const normalized = String(value).trim();
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) throw new Error("INVALID_TIMESTAMP");
  return new Date(millis).toISOString();
}

function smallJson(value, max = 16 * 1024) {
  const encoded = JSON.stringify(value ?? {});
  if (new TextEncoder().encode(encoded).byteLength > max) throw new Error("METADATA_TOO_LARGE");
  return encoded;
}

function rejectDurablePayloadFields(body) {
  const forbidden = ["payload", "raw", "raw_payload", "evidence", "evidence_payload", "record", "signed_risk_object"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) throw new Error("DURABLE_PAYLOAD_BELONGS_IN_B2");
  }
}

async function health(env) {
  if (!env.DB) return json({ ok: false, error: "D1_BINDING_MISSING" }, 503);
  try {
    const row = await env.DB.prepare("SELECT version, updated_at FROM schema_meta WHERE name = ?")
      .bind("control-plane")
      .first();
    if (!row || Number(row.version) < 1) return json({ ok: false, error: "D1_SCHEMA_NOT_READY" }, 503);
    return json({ ok: true, store: "d1", schema_version: Number(row.version), durable_payload_store: "b2", commerce_ledger: "durable_object" });
  } catch {
    return json({ ok: false, error: "D1_UNAVAILABLE" }, 503);
  }
}

async function putControl(env, key, body) {
  const safeKey = boundedText(key, 128);
  const valueJson = smallJson(body.value, 32 * 1024);
  const version = Number(body.version ?? 1);
  if (!Number.isInteger(version) || version < 1) throw new Error("INVALID_VERSION");
  const updatedAt = nowIso();
  await env.DB.prepare(`
    INSERT INTO control_state (key, value_json, version, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      version = excluded.version,
      updated_at = excluded.updated_at
  `).bind(safeKey, valueJson, version, updatedAt).run();
  return json({ ok: true, key: safeKey, updated_at: updatedAt });
}

async function putSource(env, sourceKey, body) {
  rejectDurablePayloadFields(body);
  const safeKey = boundedText(sourceKey, 128);
  if (!SOURCE_KEY_RE.test(safeKey)) throw new Error("INVALID_SOURCE_KEY");
  const enabled = body.enabled === true ? 1 : body.enabled === false ? 0 : null;
  if (enabled == null) throw new Error("INVALID_ENABLED");
  const updatedAt = nowIso();
  const values = [
    safeKey,
    enabled,
    status(body.certification_status),
    status(body.rights_status),
    status(body.endpoint_status),
    status(body.schema_status),
    status(body.freshness_status),
    status(body.provenance_status),
    status(body.independence_status),
    status(body.runtime_status),
    status(body.fallback_status),
    iso(body.last_checked_at),
    iso(body.next_check_at),
    smallJson(body.metadata),
    updatedAt,
  ];
  await env.DB.prepare(`
    INSERT INTO source_state (
      source_key, enabled, certification_status, rights_status, endpoint_status,
      schema_status, freshness_status, provenance_status, independence_status,
      runtime_status, fallback_status, last_checked_at, next_check_at, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      enabled = excluded.enabled,
      certification_status = excluded.certification_status,
      rights_status = excluded.rights_status,
      endpoint_status = excluded.endpoint_status,
      schema_status = excluded.schema_status,
      freshness_status = excluded.freshness_status,
      provenance_status = excluded.provenance_status,
      independence_status = excluded.independence_status,
      runtime_status = excluded.runtime_status,
      fallback_status = excluded.fallback_status,
      last_checked_at = excluded.last_checked_at,
      next_check_at = excluded.next_check_at,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).bind(...values).run();
  return json({ ok: true, source_key: safeKey, updated_at: updatedAt });
}

async function putCountryDomain(env, country, domain, body) {
  rejectDurablePayloadFields(body);
  if (!COUNTRY_RE.test(country)) throw new Error("INVALID_COUNTRY");
  if (!DOMAIN_RE.test(domain)) throw new Error("INVALID_DOMAIN");
  const certified = Number(body.certified_source_count ?? 0);
  const review = Number(body.review_source_count ?? 0);
  const unavailable = Number(body.unavailable_source_count ?? 0);
  for (const value of [certified, review, unavailable]) {
    if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error("INVALID_SOURCE_COUNT");
  }
  const updatedAt = nowIso();
  await env.DB.prepare(`
    INSERT INTO country_domain_state (
      country_code, domain, readiness_status, certified_source_count,
      review_source_count, unavailable_source_count, last_verified_at, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(country_code, domain) DO UPDATE SET
      readiness_status = excluded.readiness_status,
      certified_source_count = excluded.certified_source_count,
      review_source_count = excluded.review_source_count,
      unavailable_source_count = excluded.unavailable_source_count,
      last_verified_at = excluded.last_verified_at,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).bind(
    country,
    domain,
    status(body.readiness_status),
    certified,
    review,
    unavailable,
    iso(body.last_verified_at),
    smallJson(body.metadata),
    updatedAt,
  ).run();
  return json({ ok: true, country_code: country, domain, updated_at: updatedAt });
}

async function putRiskIndex(env, objectId, body) {
  rejectDurablePayloadFields(body);
  if (!OBJECT_ID_RE.test(objectId)) throw new Error("INVALID_OBJECT_ID");
  const payloadHash = String(body.payload_hash ?? "").trim().toLowerCase();
  const recordSha = String(body.record_sha256 ?? "").trim().toLowerCase();
  const archiveSha = String(body.archive_sha256 ?? "").trim().toLowerCase();
  if (!HASH_RE.test(payloadHash) || !HASH_RE.test(recordSha) || !HASH_RE.test(archiveSha)) throw new Error("INVALID_HASH");
  const archiveKey = boundedText(body.archive_key, 512);
  if (!archiveKey.startsWith("geomacro-")) throw new Error("INVALID_ARCHIVE_KEY");
  const updatedAt = nowIso();
  await env.DB.prepare(`
    INSERT INTO risk_object_index (
      object_id, schema_version, subject_type, subject_id, generated_at, expires_at,
      verification_status, commercial_eligibility_status, signing_key_id,
      payload_hash, record_sha256, archive_key, archive_sha256, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(object_id) DO UPDATE SET
      schema_version = excluded.schema_version,
      subject_type = excluded.subject_type,
      subject_id = excluded.subject_id,
      generated_at = excluded.generated_at,
      expires_at = excluded.expires_at,
      verification_status = excluded.verification_status,
      commercial_eligibility_status = excluded.commercial_eligibility_status,
      signing_key_id = excluded.signing_key_id,
      payload_hash = excluded.payload_hash,
      record_sha256 = excluded.record_sha256,
      archive_key = excluded.archive_key,
      archive_sha256 = excluded.archive_sha256,
      updated_at = excluded.updated_at
  `).bind(
    objectId,
    boundedText(body.schema_version, 32),
    boundedText(body.subject_type, 64),
    boundedText(body.subject_id, 128),
    iso(body.generated_at, true),
    iso(body.expires_at, true),
    status(body.verification_status),
    status(body.commercial_eligibility_status),
    boundedText(body.signing_key_id, 128),
    payloadHash,
    recordSha,
    archiveKey,
    archiveSha,
    updatedAt,
  ).run();
  return json({ ok: true, object_id: objectId, updated_at: updatedAt });
}

async function putCheckpoint(env, pipeline, scope, body) {
  rejectDurablePayloadFields(body);
  const safePipeline = boundedText(pipeline, 96);
  const safeScope = boundedText(scope, 128);
  if (!SOURCE_KEY_RE.test(safePipeline) || !SOURCE_KEY_RE.test(safeScope)) throw new Error("INVALID_CHECKPOINT_KEY");
  const updatedAt = nowIso();
  await env.DB.prepare(`
    INSERT INTO pipeline_checkpoint (
      pipeline, scope, status, last_attempt_at, last_success_at, cursor, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pipeline, scope) DO UPDATE SET
      status = excluded.status,
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at,
      cursor = excluded.cursor,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).bind(
    safePipeline,
    safeScope,
    status(body.status),
    iso(body.last_attempt_at),
    iso(body.last_success_at),
    boundedText(body.cursor, 1024, false),
    smallJson(body.metadata),
    updatedAt,
  ).run();
  return json({ ok: true, pipeline: safePipeline, scope: safeScope, updated_at: updatedAt });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (request.method === "GET" && url.pathname === "/health") return health(env);
    if (!env.DB) return json({ ok: false, error: "D1_BINDING_MISSING" }, 503);

    const auth = authorized(request, env);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    try {
      if (request.method !== "PUT") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
      const body = await readJson(request);

      if (parts[0] === "v1" && parts[1] === "control" && parts.length === 3) {
        return putControl(env, decodeURIComponent(parts[2]), body);
      }
      if (parts[0] === "v1" && parts[1] === "source" && parts.length === 3) {
        return putSource(env, decodeURIComponent(parts[2]), body);
      }
      if (parts[0] === "v1" && parts[1] === "country-domain" && parts.length === 4) {
        return putCountryDomain(env, parts[2].toUpperCase(), parts[3].toLowerCase(), body);
      }
      if (parts[0] === "v1" && parts[1] === "gro-index" && parts.length === 3) {
        return putRiskIndex(env, decodeURIComponent(parts[2]), body);
      }
      if (parts[0] === "v1" && parts[1] === "checkpoint" && parts.length === 4) {
        return putCheckpoint(env, decodeURIComponent(parts[2]), decodeURIComponent(parts[3]), body);
      }
      return json({ ok: false, error: "NOT_FOUND" }, 404);
    } catch (error) {
      const code = error instanceof Error ? error.message : "CONTROL_PLANE_FAILURE";
      const clientError = /^(BODY_|INVALID_|MISSING_|VALUE_|METADATA_|DURABLE_)/.test(code);
      if (!clientError) console.error("[control-plane] request failed", code);
      return json({ ok: false, error: clientError ? code : "CONTROL_PLANE_FAILURE" }, clientError ? 400 : 500);
    }
  },
};
