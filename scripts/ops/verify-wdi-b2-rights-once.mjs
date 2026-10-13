#!/usr/bin/env node
/**
 * One-shot, main-only, production-environment WDI source-rights attestation.
 * This is NOT a Lovable runtime attestation, a publisher, a payment, or a GRO.
 * NO unmetered B2 access, retries, native fallback, Supabase, or raw output.
 *
 * This standalone audit must not execute PR-head code with protected secrets.
 * All network requests are explicitly allowlisted below.
 */
import { createHash, createHmac } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RIGHTS_KEY = "geomacro-evidence/v1/live/commercial-source-rights/latest.json.gz";
const EXPECTED_SHA = "f1c168c8c91917db0bda8d041d771c6840cfbc50ea7de4f047ed081a8ad995c0";
const EXPECTED_AT = "2026-10-13T22:04:53.102Z";
const PROJECT = "ldpwajisioljyjtojvfx";
const QUOTA = "https://geomacro-control-plane.daspallab202391.workers.dev";
const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const WORKFLOW_ID = "wdi_rights_one_shot";
const ONE_DAY = 24 * 60 * 60 * 1000;
const MAX_GZIP = 12_000_000;
const MAX_PLAIN = 40_000_000;
const SHA = /^[a-f0-9]{64}$/u;
const hmac = (key, msg) => createHmac("sha256", key).update(msg).digest();
const sha = (data) => createHash("sha256").update(data).digest("hex");

function fail(category, { reserved = false, attempted = false, d1Authenticated = false, exact = false } = {}) {
  return {
    schema: "geomacro.one-shot-wdi-rights-main-production.v1",
    status: "BLOCKED", category,
    d1_authenticated: d1Authenticated,
    fresh_d1_get_reserved: reserved,
    s3_get_attempted: attempted,
    max_s3_get_attempts: 1,
    exact_b2_receipt_matched: exact,
    wdi_rights_certified: false,
    b2_puts: 0, supabase_requests: 0, d1_payload_writes: 0,
    payments: 0, payment_authorized: false, lovable_runtime_verified: false,
  };
}
function success() {
  return {
    ...fail("UNIQUE_CERTIFIED_WDI_ROW_EXACT_B2_RECEIPT"),
    status: "RIGHTS_CERTIFIED",
    d1_authenticated: true,
    fresh_d1_get_reserved: true,
    s3_get_attempted: true,
    exact_b2_receipt_matched: true,
    wdi_rights_certified: true,
  };
}
async function smallJson(res) {
  const raw = await res.text();
  if (raw.length > 16_384) throw Error("OVERSIZE");
  return JSON.parse(raw);
}
function validQuota(payload, now) {
  if (payload?.ok !== true ||
      payload.schema !== "geomacro.b2-account-quota-status.v1" ||
      payload.day_utc !== new Date(now).toISOString().slice(0, 10) ||
      payload.account_wide_reporting_requires_all_clients_governed !== true) return false;
  const used = payload.used, limits = payload.limits;
  if (!used || !limits ||
      ![used.GET, used.total, limits.GET, limits.total].every(
        n => Number.isSafeInteger(n) && n >= 0
      )) return false;
  return used.GET < limits.GET && used.total < limits.total;
}
function strictPresent(env) {
  return typeof env.B2_ARCHIVE_READ_KEY_ID === "string" &&
    !!env.B2_ARCHIVE_READ_KEY_ID.trim() &&
    typeof env.B2_ARCHIVE_READ_APPLICATION_KEY === "string" &&
    !!env.B2_ARCHIVE_READ_APPLICATION_KEY.trim() &&
    typeof env.GEOMACRO_COMMERCE_LEDGER_TOKEN === "string" &&
    env.GEOMACRO_COMMERCE_LEDGER_TOKEN.trim().length >= 32;
}
export function qualifyExactRights(bytes, { now = Date.now(), expectedSha = EXPECTED_SHA, expectedAt = EXPECTED_AT } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 10 || bytes.length > MAX_GZIP)
    return "B2_RECEIPT_BYTES_INVALID";
  if (!SHA.test(expectedSha) || sha(bytes) !== expectedSha)
    return "B2_RECEIPT_SHA_MISMATCH";
  let payload;
  try {
    payload = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_PLAIN }).toString("utf8"));
  } catch {
    return "B2_GZIP_OR_JSON_INVALID";
  }
  if (payload?.schema !== "geomacro.commercial-source-rights-live.v2" ||
      payload.source_project !== PROJECT ||
      payload.generated_at !== expectedAt ||
      !Array.isArray(payload.rows) || payload.rows.length === 0 || payload.rows.length > 2000)
    return "B2_RECEIPT_CONTRACT_MISMATCH";
  const generated = Date.parse(payload.generated_at);
  if (!Number.isFinite(generated) || !Number.isFinite(now) ||
      generated > now + 5 * 60_000 || now - generated > ONE_DAY)
    return "B2_RECEIPT_STALE";
  const seen = new Set();
  let wdi = null;
  for (const row of payload.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.source_id !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/u.test(row.source_id) ||
        seen.has(row.source_id) ||
        !(row.category === null || (typeof row.category === "string" && row.category.length <= 80)) ||
        !(row.certification_state === null || (typeof row.certification_state === "string" && row.certification_state.length <= 80)) ||
        !(row.commercial_usage_status === null || (typeof row.commercial_usage_status === "string" && row.commercial_usage_status.length <= 80)) ||
        !(row.licence_name === null || (typeof row.licence_name === "string" && row.licence_name.length <= 300)) ||
        !["enabled_for_ingestion", "enabled_for_commercial_signals", "raw_redistribution_allowed", "attribution_required"]
          .every(field => typeof row[field] === "boolean"))
      return "B2_RIGHTS_ROW_SCHEMA_INVALID";
    seen.add(row.source_id);
    if (row.source_id === "world_bank_indicators") wdi = row;
  }
  if (!wdi) return "WDI_EXACT_SOURCE_NOT_CERTIFIED";
  if (wdi.certification_state !== "CERTIFIED" ||
      !["COMMERCIAL_OK", "DERIVED_ONLY"].includes(wdi.commercial_usage_status) ||
      wdi.enabled_for_ingestion !== true ||
      wdi.enabled_for_commercial_signals !== true ||
      wdi.attribution_required !== true ||
      !/^CC[\s-]*BY[\s-]*4\.0(?:\b|$)/iu.test(wdi.licence_name ?? "") ||
      !["macro", "macro_fx", "macro-fx", null].includes(wdi.category))
    return "WDI_RIGHTS_CONTRACT_MISMATCH";
  // Upstream raw-redistribution permission is not Geomacro customer-delivery policy.
  return "RIGHTS_CERTIFIED";
}
function makeS3Headers(keyId, secret, now) {
  const timestamp = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = timestamp.slice(0, 8);
  const region = "us-east-005";
  const path = "/" + [BUCKET, ...RIGHTS_KEY.split("/")].map(encodeURIComponent).join("/");
  const emptyHash = sha("");
  const canonicalHeaders = "host:s3.us-east-005.backblazeb2.com\n" +
    "x-amz-content-sha256:" + emptyHash + "\n" +
    "x-amz-date:" + timestamp + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = ["GET", path, "", canonicalHeaders, signedHeaders, emptyHash].join("\n");
  const scope = day + "/" + region + "/s3/aws4_request";
  const toSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac("AWS4" + secret, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  return {
    url: ENDPOINT + path,
    headers: {
      "x-amz-content-sha256": emptyHash,
      "x-amz-date": timestamp,
      Authorization: "AWS4-HMAC-SHA256 Credential=" + keyId + "/" + scope +
        ", SignedHeaders=" + signedHeaders + ", Signature=" + signature,
    },
  };
}
export async function verifyOneRightsReceipt({
  env = process.env, fetchImpl = fetch, now = Date.now(),
} = {}) {
  if (env.GITHUB_REPOSITORY !== "blocknine0/geomacro" ||
      env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GEOMACRO_OPERATOR_SINGLE_B2_RIGHTS_READ !== "CONFIRMED_ONE")
    return fail("OWNER_MAIN_ONLY_DISPATCH_REQUIRED");
  if (!strictPresent(env)) return fail("PRODUCTION_READ_SECRETS_UNAVAILABLE");
  // Before consuming D1 or B2 quota, refuse a known-expired pinned receipt.
  // A true refresh is a separate authorized rights-only operation.
  const pinnedAt = Date.parse(EXPECTED_AT);
  if (!Number.isFinite(now) || !Number.isFinite(pinnedAt) ||
      pinnedAt > now + 5 * 60_000 || now - pinnedAt > ONE_DAY)
    return fail("B2_RECEIPT_STALE_NO_GET_ATTEMPT");
  const root = env.GEOMACRO_COMMERCE_LEDGER_TOKEN; // Match deployed Worker derivation byte-for-byte.
  const token = createHmac("sha256", root).update("geomacro-control-plane-v1").digest("hex");
  const bearer = { Authorization: "Bearer " + token, Accept: "application/json" };
  let status;
  try {
    status = await fetchImpl(QUOTA + "/v1/b2-quota/status", {
      method: "GET", headers: bearer, redirect: "error",
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
  } catch {
    return fail("D1_QUOTA_STATUS_UNAVAILABLE");
  }
  if (status.status === 401 || status.status === 403) return fail("D1_BEARER_AUTH_DENIED");
  if (status.status === 429) return fail("D1_QUOTA_EXHAUSTED");
  if (status.status !== 200) return fail("D1_QUOTA_STATUS_UNAVAILABLE");
  let quota;
  try { quota = await smallJson(status); } catch { return fail("D1_QUOTA_STATUS_INVALID"); }
  if (!validQuota(quota, now)) return fail("D1_QUOTA_EXHAUSTED_OR_INVALID", {d1Authenticated:true});
  let reservation;
  try {
    reservation = await fetchImpl(QUOTA + "/v1/b2-quota/reserve", {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "GET", workflow_id: WORKFLOW_ID }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
  } catch { return fail("D1_RESERVATION_UNAVAILABLE", {d1Authenticated:true}); }
  if (reservation.status === 401 || reservation.status === 403)
    return fail("D1_RESERVATION_AUTH_DENIED", {d1Authenticated:true});
  if (reservation.status === 429) return fail("D1_RESERVATION_QUOTA_DENIED", {d1Authenticated:true});
  if (reservation.status !== 200)
    return fail("D1_RESERVATION_UNAVAILABLE", {d1Authenticated:true});
  let ticket;
  try { ticket = await smallJson(reservation); }
  catch { return fail("D1_RESERVATION_RECEIPT_INVALID", {d1Authenticated:true}); }
  if (ticket?.ok !== true ||
      ticket.schema !== "geomacro.b2-account-request-reservation.v1" ||
      ticket.reserved !== true || ticket.kind !== "GET" ||
      ticket.day_utc !== new Date(now).toISOString().slice(0, 10) ||
      ticket.b2_operation_performed !== false || ticket.chargeable !== false)
    return fail("D1_RESERVATION_RECEIPT_INVALID", {d1Authenticated:true});
  // Exactly ONE S3 GET, no retry, alternate keys, HEAD, native B2, or fallback.
  const details = makeS3Headers(env.B2_ARCHIVE_READ_KEY_ID.trim(),
    env.B2_ARCHIVE_READ_APPLICATION_KEY.trim(), Date.now());
  let response;
  try {
    response = await fetchImpl(details.url, {method:"GET",headers:details.headers,
      redirect:"error", cache:"no-store", signal:AbortSignal.timeout(15_000)});
  } catch {
    return fail("B2_GET_UNAVAILABLE", {reserved:true,attempted:true,d1Authenticated:true});
  }
  if (response.status !== 200) {
    const category = response.status === 403 ? "B2_READ_AUTH_DENIED" :
      response.status === 404 ? "B2_RIGHTS_OBJECT_NOT_FOUND" :
      response.status === 429 ? "B2_PROVIDER_QUOTA_EXHAUSTED" : "B2_GET_UNAVAILABLE";
    return fail(category, {reserved:true,attempted:true,d1Authenticated:true});
  }
  let bytes;
  try {
    const len = response.headers?.get("content-length");
    if (len != null && (+len > MAX_GZIP || !Number.isFinite(+len))) throw Error("LENGTH");
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    return fail("B2_READ_BODY_UNAVAILABLE", {reserved:true,attempted:true,d1Authenticated:true});
  }
  const verdict = qualifyExactRights(bytes, {now:Date.now()});
  if (verdict !== "RIGHTS_CERTIFIED")
    return fail(verdict, {reserved:true,attempted:true,d1Authenticated:true,
      exact:verdict === "WDI_RIGHTS_CONTRACT_MISMATCH" || verdict === "WDI_EXACT_SOURCE_NOT_CERTIFIED"});
  return success();
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyOneRightsReceipt().then(report => {
    process.stdout.write(JSON.stringify(report) + "\n");
    if (report.status !== "RIGHTS_CERTIFIED") process.exitCode = 2;
  }).catch(() => {
    process.stderr.write("WDI_RIGHTS_PROBE_FAILED_CLOSED\n");
    process.exitCode = 2;
  });
}
