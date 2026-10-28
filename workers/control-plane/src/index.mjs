import {readNewsProductFactory} from './news-product-factory.mjs';
import {readPublicMacro,loadMacroState,storeMacroState,runMacroReleaseTick} from "./macro-fastlane.mjs";
import {publicSignedNews} from './public-signed-news.mjs';
import {authorizePrivateNewsProof} from './private-news-proof-auth.mjs';
import {handlePrivateOsint15m} from './private-osint-15m.mjs';
import {readPrivateTelegramResearchJson} from './telegram-research-json.mjs';
import {readPrivateTelegramFreeLiveJson} from './telegram-free-live-research.mjs';
import {publicReusableSourceNews,publishReusableSourceNews} from './reusable-source-news.mjs';
import {writeOwnerTelegramExportJson,privateOwnerTelegramExportJson} from './telegram-export-derived-json.mjs';
import {MACHINE_INTELLIGENCE_PROOF_SCHEMA,isIntelligenceProofSchema,isIntelligenceSourceContract} from "../../../lib/intelligence-publication-authority.mjs";
import {consumeCentralSecurityBudget} from './central-security-budget.mjs';
import { reserveB2AccountQuota, readB2AccountQuota } from "./b2-account-quota.mjs";
import { readDerivedStories, readDerivedStoriesBundle, publishDerivedStories, renderDerivedStoriesHtml, DERIVED_NEWS_TOPIC_POLICY_REVISION } from "./website-derived-intelligence.mjs";
import {refreshMaterializedNewsPages} from "./materialized-public-news-pages.mjs";
import {publicSharedDerivedNewsFeed} from "./shared-derived-news-feed.mjs";
import {projectPublicMachineDomainResponse} from "./public-machine-domain-reuse.mjs";
import {readNewsIntakePolicy,storeNewsIntakePolicy} from "./news-intake-policy.mjs";
import {predgeResearchDerivedNewsFeed} from "./predge-research-derived-news.mjs";
import {predgeRiskGateD1,predgeRiskGateD1Readiness} from "./predge-risk-gate-d1.mjs";
import {getAutomatedFinds,putAutomatedFinds} from "./automated-finds.ts";
import {getAutomatedInputs,putAutomatedInputs} from './automated-intelligence-inputs.ts';
import {handleLowSourceReviews} from './low-source-reviews.ts';
import {handlePrivateSourceHandoffs} from './private-source-handoffs.ts';
import {getSourceRuntimeContext,getSourceRuntimeStatus} from "./source-runtime-status.mjs";
import {getPrivateLegacySourceDirectory,getPrivateLegacySourceDirectoryCoverage} from "./private-source-directory.mjs";
import {threeDomainEvidenceContinuity} from "./three-domain-evidence-continuity.mjs";
import {readPublicFreeD1Cached,eligiblePublicFreeD1CacheRequest} from "./public-free-d1-cache.mjs";
import {readPublicNewsR2Snapshot,publishPublicNewsR2Snapshot,PUBLIC_NEWS_R2_MAX_BYTES}
  from "./public-news-r2-offload.mjs";
import { makeGriHistoricalContinuityMetadata } from "./global-risk-historical-status.mjs";
import { makeRiskIndicesHistoricalMetadata } from "./risk-indices-historical-status.mjs";
import { projectPublic30mPulse } from "./source-pulse-public.mjs";
import {
  privateVerifiedGriHistoryProjection,
  VERIFIED_GRI_B2_PROOF_SCHEMA,
  WEBSITE_GRI_HISTORY_LIMIT,
  WEBSITE_GRI_HISTORY_PRUNE_SQL,
  WEBSITE_GRI_HISTORY_RETENTION_MS,
  WEBSITE_GRI_DELAY_MS,
} from "./website-gri-history.mjs";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_HOT_SNAPSHOT_BODY_BYTES = 1024 * 1024;
const MAX_HOT_SNAPSHOT_BYTES = 768 * 1024;
const HASH_RE = /^[0-9a-f]{64}$/;
const SOURCE_KEY_RE = /^[a-z0-9][a-z0-9_.:-]{1,127}$/;
const COUNTRY_RE = /^[A-Z]{3}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const OBJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,191}$/;
const STATUS_RE = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;
const PUBLIC_INTELLIGENCE_OVERLAY_KEY = "public_intelligence_live_observed_v1";
const PUBLIC_INTELLIGENCE_OVERLAY_SCHEMA = "geomacro.public-intelligence-live-observed.v1";
const PUBLIC_INTELLIGENCE_OVERLAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PUBLIC_INTELLIGENCE_VERIFIED_BASELINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_INTELLIGENCE_OVERLAY_MAX_ROWS = 24;
const GLOBAL_RISK_CURRENT_PROOF_SCHEMA = "geomacro.public-global-risk-current-proof.v1";
const GLOBAL_RISK_CURRENT_PROOF_MODE = "independent-gri-proof-over-b2-baseline";
const GLOBAL_RISK_B2_BASELINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const HOT_SNAPSHOT_PRODUCTS = Object.freeze({
  intelligence: {
    schema: "geomacro.public-intelligence-live.v1",
    proofSchema: "geomacro.public-intelligence-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
    maxAgeMs: 12 * 60 * 60 * 1000,
  },
  "global-risk": {
    schema: "geomacro.public-global-risk-live.v1",
    proofSchema: "geomacro.public-global-risk-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/global-risk/latest.json.gz",
    maxAgeMs: 180 * 60 * 1000,
  },
  "risk-indices": {
    schema: "geomacro.public-risk-indices-live.v1",
    proofSchema: "geomacro.public-risk-indices-live-proof.v1",
    b2Key: "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    maxAgeMs: 180 * 60 * 1000,
  },
});

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

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("BODY_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("BODY_TOO_LARGE");
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

function publicJson(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function validatePublicIntelligenceOverlay(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (
    value.schema !== PUBLIC_INTELLIGENCE_OVERLAY_SCHEMA ||
    value.source_id !== "gdelt_v2_events" ||
    value.synthetic_score !== false ||
    value.raw_source_headlines_exposed !== false ||
    value.provider_identity_exposed !== false ||
    value.verified_b2_key !== "geomacro-evidence/v1/live/public-intelligence/latest.json.gz" ||
    !/^[0-9a-f]{64}$/u.test(String(value.verified_b2_sha256 ?? "")) ||
    value.full_b2_readback_verified !== true ||
    value.exact_gzip_restore_verified !== true
  ) return null;

  const generatedAt = Date.parse(String(value.generated_at ?? ""));
  const verifiedB2GeneratedAt = Date.parse(
    String(value.verified_b2_generated_at ?? value.generated_at ?? ""),
  );
  const sourceBatchAt = Date.parse(String(value.current_source_batch_at ?? ""));
  if (
    !Number.isFinite(generatedAt) ||
    !Number.isFinite(verifiedB2GeneratedAt) ||
    !Number.isFinite(sourceBatchAt) ||
    generatedAt > now + 5 * 60_000 ||
    verifiedB2GeneratedAt > now + 5 * 60_000 ||
    sourceBatchAt > now + 5 * 60_000 ||
    now - generatedAt > PUBLIC_INTELLIGENCE_OVERLAY_MAX_AGE_MS ||
    now - verifiedB2GeneratedAt > PUBLIC_INTELLIGENCE_VERIFIED_BASELINE_MAX_AGE_MS ||
    now - sourceBatchAt > PUBLIC_INTELLIGENCE_OVERLAY_MAX_AGE_MS
  ) return null;

  if (
    !Array.isArray(value.rows) ||
    value.rows.length < 1 ||
    value.rows.length > PUBLIC_INTELLIGENCE_OVERLAY_MAX_ROWS
  ) return null;

  const allowedKeys = new Set([
    "id", "source_title", "summary", "category", "severity", "delta",
    "created_at", "published_at", "public_status",
  ]);
  const rows = [];
  const seen = new Set();
  for (const raw of value.rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (Object.keys(raw).some((key) => !allowedKeys.has(key))) return null;
    const id = String(raw.id ?? "").trim();
    const title = String(raw.source_title ?? "").replace(/\s+/g, " ").trim();
    const createdAt = String(raw.created_at ?? "").trim();
    const publishedAt = raw.published_at == null ? null : String(raw.published_at).trim();
    const timestamp = Date.parse(publishedAt || createdAt);
    if (
      !id ||
      id.length > 192 ||
      title.length < 24 ||
      title.length > 280 ||
      !title.startsWith("Geomacro observes ") ||
      raw.category !== "geopolitics" ||
      raw.public_status !== "live_observed" ||
      raw.severity !== null ||
      raw.delta !== null ||
      !Number.isFinite(timestamp) ||
      timestamp > now + 5 * 60_000 ||
      now - timestamp > PUBLIC_INTELLIGENCE_OVERLAY_MAX_AGE_MS
    ) return null;
    const key = `${id}|${title.toLowerCase()}`;
    if (seen.has(key)) return null;
    seen.add(key);
    rows.push({
      id,
      source_title: title,
      summary: raw.summary == null ? null : String(raw.summary).replace(/\s+/g, " ").trim().slice(0, 500),
      category: "geopolitics",
      severity: null,
      delta: null,
      created_at: createdAt,
      published_at: publishedAt,
      public_status: "live_observed",
    });
  }

  return {
    schema: PUBLIC_INTELLIGENCE_OVERLAY_SCHEMA,
    generated_at: new Date(generatedAt).toISOString(),
    source_id: "gdelt_v2_events",
    current_source_transport: boundedText(value.current_source_transport, 80),
    current_source_batch_at: new Date(sourceBatchAt).toISOString(),
    current_evidence_contract: boundedText(value.current_evidence_contract, 160),
    synthetic_score: false,
    raw_source_headlines_exposed: false,
    provider_identity_exposed: false,
    verified_b2_key: "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
    verified_b2_sha256: String(value.verified_b2_sha256),
    verified_b2_generated_at: new Date(verifiedB2GeneratedAt).toISOString(),
    full_b2_readback_verified: true,
    exact_gzip_restore_verified: true,
    rows,
  };
}

async function getPublicIntelligenceOverlay(env) {
  try {
    const row = await env.DB.prepare(
      "SELECT value_json FROM control_state WHERE key = ? LIMIT 1",
    ).bind(PUBLIC_INTELLIGENCE_OVERLAY_KEY).first();
    if (!row?.value_json) {
      return publicJson({ ok: false, error: "INTELLIGENCE_OVERLAY_UNAVAILABLE" }, 503);
    }
    let parsed;
    try {
      parsed = JSON.parse(String(row.value_json));
    } catch {
      return publicJson({ ok: false, error: "INTELLIGENCE_OVERLAY_INVALID" }, 503);
    }
    const overlay = validatePublicIntelligenceOverlay(parsed);
    if (!overlay) return publicJson({ ok: false, error: "INTELLIGENCE_OVERLAY_STALE_OR_INVALID" }, 503);
    return publicJson({ ok: true, ...overlay });
  } catch {
    return publicJson({ ok: false, error: "D1_UNAVAILABLE" }, 503);
  }
}


function validGlobalRiskCurrentProof(value, proof) {
  const data = value?.data;
  const domains = data?.domainIndices;
  const hashPairs = [
    ["proofHash", "proof_hash"],
    ["evidenceHash", "evidence_hash"],
    ["calculationHash", "calculation_hash"],
    ["dispositionHash", "disposition_hash"],
    ["inputHash", "input_hash"],
    ["methodologyHash", "methodology_hash"],
    ["changeHash", "change_hash"],
  ];
  if (
    value?.verification_mode !== GLOBAL_RISK_CURRENT_PROOF_MODE ||
    value?.current_b2_snapshot_promoted !== false ||
    !HASH_RE.test(String(value?.baseline_b2_sha256 ?? "")) ||
    !HASH_RE.test(String(value?.baseline_payload_sha256 ?? "")) ||
    !/^\d{1,20}$/.test(String(value?.baseline_source_run_id ?? "")) ||
    proof?.schema !== GLOBAL_RISK_CURRENT_PROOF_SCHEMA ||
    proof?.verification_mode !== GLOBAL_RISK_CURRENT_PROOF_MODE ||
    proof?.independent_gri_proof_verified !== true ||
    proof?.baseline_b2_readback_verified !== true ||
    proof?.baseline_exact_gzip_restore_verified !== true ||
    proof?.current_b2_readback_verified !== false ||
    proof?.current_b2_snapshot_promoted !== false ||
    proof?.baseline_b2_sha256 !== value?.baseline_b2_sha256 ||
    proof?.baseline_payload_sha256 !== value?.baseline_payload_sha256 ||
    String(proof?.baseline_source_run_id ?? "") !== String(value?.baseline_source_run_id ?? "") ||
    data?.verificationStatus !== "verified" ||
    data?.methodologyVersion !== "gri-v1.2.0" ||
    data?.auditPersisted !== true ||
    proof?.snapshot_id !== data?.snapshotId ||
    Date.parse(String(proof?.snapshot_as_of ?? "")) !== Date.parse(String(data?.snapshotAsOf ?? "")) ||
    !domains || typeof domains !== "object" || Array.isArray(domains)
  ) return false;

  for (const [dataKey, proofKey] of hashPairs) {
    if (!HASH_RE.test(String(data?.[dataKey] ?? "")) || proof?.[proofKey] !== data?.[dataKey]) return false;
  }
  if (
    Number(proof?.candidate_event_count) !== Number(data?.candidateEventCount) ||
    Number(proof?.reconciliation_residual) !== Number(data?.reconciliationResidual) ||
    Number(proof?.change_residual) !== Number(data?.changeResidual)
  ) return false;

  return ["geopolitics", "macro", "rare_earth"].every((key) => {
    const domain = domains[key];
    return domain && typeof domain === "object" &&
      Array.isArray(domain?.series?.["7D"]?.buckets) &&
      domain.series["7D"].buckets.length >= 2 &&
      Array.isArray(domain?.series?.["30D"]?.buckets) &&
      domain.series["30D"].buckets.length >= domain.series["7D"].buckets.length;
  });
}

async function readGlobalRiskB2Anchor(env, now = Date.now()) {
  const row = await env.DB.prepare(`
    SELECT product, schema_name, generated_at, source_as_of, expires_at, b2_object_key, b2_sha256,
      payload_sha256, proof_schema, verified_at, source_run_id, payload_json
    FROM public_b2_hot_snapshot WHERE product = ? LIMIT 1
  `).bind("global-risk").first();
  if (!row) return null;

  const payloadJson = String(row.payload_json ?? "");
  const actualPayloadSha256 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadJson));
  const actualHex = Array.from(new Uint8Array(actualPayloadSha256), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (
    row.product !== "global-risk" ||
    row.schema_name !== HOT_SNAPSHOT_PRODUCTS["global-risk"].schema ||
    row.b2_object_key !== HOT_SNAPSHOT_PRODUCTS["global-risk"].b2Key ||
    !HASH_RE.test(String(row.b2_sha256 ?? "")) ||
    !HASH_RE.test(String(row.payload_sha256 ?? "")) ||
    !/^\d{1,20}$/.test(String(row.source_run_id ?? "")) ||
    actualHex !== row.payload_sha256
  ) return null;

  let value;
  try { value = JSON.parse(payloadJson); } catch { return null; }
  if (
    value?.schema !== HOT_SNAPSHOT_PRODUCTS["global-risk"].schema ||
    value?.source_project !== "ldpwajisioljyjtojvfx"
  ) return null;

  if (row.proof_schema === HOT_SNAPSHOT_PRODUCTS["global-risk"].proofSchema) {
    const generatedMs = Date.parse(String(row.generated_at ?? ""));
    // The original snapshot timestamp is checked against the payload. It
    // cannot be replaced with a later archive/check/retry timestamp.
    const sourceMs = Date.parse(String(row.source_as_of ?? ""));
    if (!Number.isFinite(generatedMs) ||
        generatedMs > now + 5 * 60_000 ||
        now - generatedMs > GLOBAL_RISK_B2_BASELINE_MAX_AGE_MS) {
      return null;
    }
    // Preserve the existing authenticated B2 anchor semantics for old
    // publishers, but NEVER show original source_as_of in the new public
    // historical view unless the D1 row and SHA-bound body agree precisely.
    const originalTimeProved = Number.isFinite(sourceMs) &&
      value?.data?.snapshotAsOf === row.source_as_of &&
      sourceMs <= generatedMs + 5 * 60_000;
    return {
      b2_sha256: String(row.b2_sha256),
      payload_sha256: String(row.payload_sha256),
      source_run_id: String(row.source_run_id),
      generated_at: String(row.generated_at),
      snapshot_as_of: originalTimeProved ? String(row.source_as_of) : null,
      anchor_kind: "direct_verified_b2_snapshot",
    };
  }

  if (
    row.proof_schema === GLOBAL_RISK_CURRENT_PROOF_SCHEMA &&
    validGlobalRiskCurrentProof(value, {
      schema: GLOBAL_RISK_CURRENT_PROOF_SCHEMA,
      verification_mode: GLOBAL_RISK_CURRENT_PROOF_MODE,
      independent_gri_proof_verified: true,
      baseline_b2_readback_verified: true,
      baseline_exact_gzip_restore_verified: true,
      current_b2_readback_verified: false,
      current_b2_snapshot_promoted: false,
      baseline_b2_sha256: value?.baseline_b2_sha256,
      baseline_payload_sha256: value?.baseline_payload_sha256,
      baseline_source_run_id: value?.baseline_source_run_id,
      snapshot_id: value?.data?.snapshotId,
      snapshot_as_of: value?.data?.snapshotAsOf,
      proof_hash: value?.data?.proofHash,
      evidence_hash: value?.data?.evidenceHash,
      calculation_hash: value?.data?.calculationHash,
      disposition_hash: value?.data?.dispositionHash,
      input_hash: value?.data?.inputHash,
      methodology_hash: value?.data?.methodologyHash,
      change_hash: value?.data?.changeHash,
      candidate_event_count: value?.data?.candidateEventCount,
      reconciliation_residual: value?.data?.reconciliationResidual,
      change_residual: value?.data?.changeResidual,
    })
  ) {
    const baselineGeneratedMs = Date.parse(String(value?.baseline_generated_at ?? ""));
    if (
      !Number.isFinite(baselineGeneratedMs) ||
      baselineGeneratedMs > now + 5 * 60_000 ||
      now - baselineGeneratedMs > GLOBAL_RISK_B2_BASELINE_MAX_AGE_MS
    ) return null;
    return {
      b2_sha256: String(value.baseline_b2_sha256),
      payload_sha256: String(value.baseline_payload_sha256),
      source_run_id: String(value.baseline_source_run_id),
      generated_at: String(value.baseline_generated_at),
      // This is the original B2 baseline, NOT the recently recomputed GRI
      // snapshot. Its source_as_of is not proved by the overlay metadata.
      snapshot_as_of: null,
      anchor_kind: "prior_b2_baseline_of_independent_gri_proof",
    };
  }
  return null;
}

/** Public read-only provenance. The CURRENT GRI/paid hot route stays 503
 * if original source evidence is stale. This adds ZERO B2 requests/writes. */
async function getHistoricalGlobalRiskContinuity(env) {
  try {
    const now=Date.now();
    const anchor=await readGlobalRiskB2Anchor(env,now);
    if(!anchor) return json({
      ok:false,error:"GLOBAL_RISK_VERIFIED_ARCHIVE_UNAVAILABLE",
      historical_only:true,current_snapshot_available:false,
    },503);
    const metadata=makeGriHistoricalContinuityMetadata(anchor,{now});
    // Metadata-only route is intentionally public. Never return the original
    // D1 JSON, source URL/title, B2 object key, private hashes or raw scores.
    return new Response(JSON.stringify(metadata),{
      status:200,
      headers:{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store",
        "Access-Control-Allow-Origin":"*",
        "X-Content-Type-Options":"nosniff",
        "Referrer-Policy":"no-referrer",
      },
    });
  } catch {
    return json({ok:false,error:"GLOBAL_RISK_VERIFIED_ARCHIVE_UNAVAILABLE",
      historical_only:true,current_snapshot_available:false},503);
  }
}


/**
 * Risk Indices retain the last independently B2-readback-verified D1 anchor
 * even after the strict 90-minute hot snapshot expires. A D1 row is not a
 * fresh B2 GET and cannot create current scoring or a chargeable receipt.
 */
async function getHistoricalRiskIndicesContinuity(env) {
  const unavailable = () => json({
    ok: false, error: "RISK_INDICES_VERIFIED_ARCHIVE_UNAVAILABLE",
    historical_only: true, current_snapshot_available: false,
  }, 503);
  try {
    const row = await env.DB.prepare(`
      SELECT product, schema_name, generated_at, source_as_of, expires_at, b2_object_key, b2_sha256,
        payload_sha256, proof_schema, verified_at, source_run_id, payload_json
      FROM public_b2_hot_snapshot WHERE product = ? LIMIT 1
    `).bind("risk-indices").first();
    if (!row) return unavailable();
    const config = HOT_SNAPSHOT_PRODUCTS["risk-indices"];
    const payloadJson = String(row.payload_json ?? "");
    if (new TextEncoder().encode(payloadJson).byteLength > MAX_HOT_SNAPSHOT_BYTES ||
        row.product !== "risk-indices" ||
        row.schema_name !== config.schema ||
        row.proof_schema !== config.proofSchema ||
        row.b2_object_key !== config.b2Key ||
        !HASH_RE.test(String(row.b2_sha256 ?? "")) ||
        !HASH_RE.test(String(row.payload_sha256 ?? "")) ||
        !/^\d{1,20}$/u.test(String(row.source_run_id ?? ""))) return unavailable();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadJson));
    const actualHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    if (actualHash !== row.payload_sha256) return unavailable();
    let value;
    try { value = JSON.parse(payloadJson); } catch { return unavailable(); }
    const data = value?.data;
    if (value?.schema !== config.schema ||
        value?.source_project !== "ldpwajisioljyjtojvfx" ||
        value?.generated_at !== row.generated_at ||
        data?.snapshotAsOf !== row.source_as_of ||
        data?.verificationStatus !== "verified" ||
        data?.contractVersion !== "risk-indices-v1.1.0" ||
        data?.parentMethodologyVersion !== "gri-v1.2.0" ||
        !Array.isArray(data?.indices) || data.indices.length !== 3) return unavailable();
    const expected = new Set(["geopolitics", "macro", "critical_minerals"]);
    for (const index of data.indices) {
      if (!expected.delete(index?.key) || index?.status !== "available" ||
          !Array.isArray(index?.series?.["7D"]?.buckets) ||
          index.series["7D"].buckets.length < 2 ||
          !Array.isArray(index?.series?.["30D"]?.buckets) ||
          index.series["30D"].buckets.length < index.series["7D"].buckets.length) return unavailable();
    }
    if (expected.size) return unavailable();
    const metadata = makeRiskIndicesHistoricalMetadata({
      anchor_kind: "direct_verified_b2_snapshot",
      b2_sha256: row.b2_sha256,
      payload_sha256: row.payload_sha256,
      source_run_id: row.source_run_id,
      generated_at: row.generated_at,
      snapshot_as_of: row.source_as_of,
    });
    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return unavailable();
  }
}

async function getGlobalRiskB2Anchor(env) {
  try {
    const anchor = await readGlobalRiskB2Anchor(env);
    if (!anchor) return json({ ok: false, error: "GLOBAL_RISK_B2_ANCHOR_UNAVAILABLE" }, 503);
    return json({
      ok: true,
      schema: "geomacro.global-risk-b2-anchor.v1",
      product: "global-risk",
      b2_object_key: HOT_SNAPSHOT_PRODUCTS["global-risk"].b2Key,
      ...anchor,
      baseline_b2_readback_verified: true,
      baseline_exact_gzip_restore_verified: true,
    });
  } catch {
    return json({ ok: false, error: "D1_UNAVAILABLE" }, 503);
  }
}

// Defense in depth: the authenticated publisher is NOT a license to write
// news bodies, publisher/source links or internal provenance into public D1.
// D1 GET serves payload_json directly; browser-side stripping is too late.
const PUBLIC_DERIVED_ROW_FIELDS=Object.freeze([
  "id","source_title","summary","category","severity",
  "delta","created_at","published_at","public_status",
]);
const PUBLIC_DERIVED_ROW_FIELD_SET=new Set(PUBLIC_DERIVED_ROW_FIELDS);
const PUBLIC_INTELLIGENCE_VALUE_FIELDS=new Set([
  "schema","source_project","generated_at","rows",
]);
const PUBLIC_DERIVED_TEXT_LEAK=/(?:https?:\/\/|www\.|<[^>]*>|\[(?:source|provider|publisher)\])/iu;
const PUBLIC_DERIVED_EDITORIAL=/\b(?:articles?|pieces?)\b/iu;
const PUBLIC_DERIVED_ISO_TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
function pureDerivedText(value,min,max) {
  if(typeof value!=="string"||value.length<min||value.length>max||
     value!==value.replace(/\s+/gu," ").trim()||
     PUBLIC_DERIVED_TEXT_LEAK.test(value)||
     PUBLIC_DERIVED_EDITORIAL.test(value))
    return false;
  return true;
}
function checkedCurrentUtcTime(value,now,maxAgeMs) {
  if(typeof value!=="string"||!PUBLIC_DERIVED_ISO_TIME.test(value))return false;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&ms<=now+5*60_000&&ms>=0&&
    now-ms<=maxAgeMs;
}
function validDerivedIntelligencePayload(value,now,maximumOriginalAgeMs) {
  if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).length!==PUBLIC_INTELLIGENCE_VALUE_FIELDS.size||
     Object.keys(value).some(k=>!PUBLIC_INTELLIGENCE_VALUE_FIELDS.has(k))||
     !Array.isArray(value.rows)||value.rows.length<1||value.rows.length>300)
    return false;
  const seenIds=new Set();
  const scoredCategories=new Set();
  for(const row of value.rows){
    if(!row||typeof row!=="object"||Array.isArray(row)||
       Object.keys(row).length!==PUBLIC_DERIVED_ROW_FIELDS.length||
       Object.keys(row).some(k=>!PUBLIC_DERIVED_ROW_FIELD_SET.has(k))||
       PUBLIC_DERIVED_ROW_FIELDS.some(k=>!Object.hasOwn(row,k))||
       typeof row.id!=="string"||!/^[-_A-Za-z0-9]{1,128}$/u.test(row.id)||
       seenIds.has(row.id)||
       row.public_status!=="verified_b2"||
       !["geopolitics","macro","rare_earth"].includes(row.category)||
       !pureDerivedText(row.source_title,22,280)||
       !row.source_title.startsWith("Geomacro finds ")||
       (row.summary!==null&&!pureDerivedText(row.summary,8,190))||
       !Number.isInteger(row.severity)||row.severity<0||row.severity>100||
       (row.delta!==null&&
         (typeof row.delta!=="number"||!Number.isFinite(row.delta)))||
       !checkedCurrentUtcTime(row.created_at,now,30*24*60*60_000)||
       !checkedCurrentUtcTime(row.published_at,now,maximumOriginalAgeMs))
      return false;
    seenIds.add(row.id);
    scoredCategories.add(row.category);
  }
  // A single-source/missing-domain payload cannot masquerade as the public
  // 3-category Intelligence product, even if it claims a qualified count.
  return ["geopolitics","macro","rare_earth"].every(d=>scoredCategories.has(d));
}

// Two independent reviewed original publishers, NOT GDELT index timestamps.

export function validateHotSnapshot(body, product, now = Date.now()) {
  const config = HOT_SNAPSHOT_PRODUCTS[product];
  if (!config || !body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_HOT_SNAPSHOT");
  const value = body.value;
  const proof = body.proof;
  if (!value || typeof value !== "object" || Array.isArray(value) || !proof || typeof proof !== "object") {
    throw new Error("INVALID_HOT_SNAPSHOT");
  }
  const payloadJson = JSON.stringify(value);
  if (new TextEncoder().encode(payloadJson).byteLength > MAX_HOT_SNAPSHOT_BYTES) throw new Error("HOT_SNAPSHOT_TOO_LARGE");
  const generatedAt = iso(value.generated_at, true);
  const generatedMs = Date.parse(generatedAt);
  const sourceAsOf = iso(product === "intelligence" ? proof.current_source_batch_at : proof.snapshot_as_of, true);
  const sourceAsOfMs = Date.parse(sourceAsOf);
  const globalRiskRecovery =
    product === "global-risk" &&
    proof.schema === GLOBAL_RISK_CURRENT_PROOF_SCHEMA &&
    proof.verification_mode === GLOBAL_RISK_CURRENT_PROOF_MODE;
  const directB2 =
    (proof.schema === config.proofSchema || product === "intelligence" && isIntelligenceProofSchema(proof.schema)) &&
    proof.live_key === config.b2Key &&
    HASH_RE.test(String(proof.compressed_sha256 ?? "")) &&
    proof.full_b2_readback_verified === true &&
    proof.exact_gzip_restore_verified === true;

  if (
    value.schema !== config.schema ||
    value.source_project !== "ldpwajisioljyjtojvfx" ||
    proof.live_key !== config.b2Key ||
    proof.generated_at !== generatedAt ||
    (product === "intelligence" && (
      !isIntelligenceSourceContract(proof)
    )) ||
    (product !== "intelligence" && (
      proof.snapshot_id !== value.data?.snapshotId ||
      Date.parse(String(proof.snapshot_as_of ?? "")) !== Date.parse(String(value.data?.snapshotAsOf ?? ""))
    )) ||
    generatedMs > now + 5 * 60_000 ||
    sourceAsOfMs > now + 5 * 60_000 ||
    now - sourceAsOfMs > config.maxAgeMs ||
    (!directB2 && !globalRiskRecovery)
  ) throw new Error("HOT_SNAPSHOT_PROOF_BINDING_INVALID");

  if (globalRiskRecovery && !validGlobalRiskCurrentProof(value, proof)) {
    throw new Error("HOT_SNAPSHOT_GLOBAL_RISK_CURRENT_PROOF_INVALID");
  }

  // Public D1 is directly readable, so this MUST run before payload_json
  // is inserted or exposed. The exact whitelisted derived row contract must
  // hold regardless of who authenticates the producer PUT.
  if(product==="intelligence" &&
     !validDerivedIntelligencePayload(value,now,config.maxAgeMs))
    throw new Error("HOT_SNAPSHOT_PUBLIC_DERIVED_ONLY_REQUIRED");

  // A poll, B2 write, D1 update or deployment cannot advance this product's
  // source clock. Tie the hot TTL to the latest REAL original event/article
  // publication time in the independently reviewed exact customer rows.
  if(product==="intelligence"){
    const latestSignedSourceMs=Math.max(...value.rows.map(row=>
      Date.parse(row.published_at)));
    if(sourceAsOfMs!==latestSignedSourceMs)
      throw new Error("HOT_SNAPSHOT_NATIVE_ORIGINAL_BATCH_CLOCK_MISMATCH");
  }

  // Server-side defense-in-depth. A historical/one-outlet/GDELT observation
  // MUST NOT be promoted to a fresh commercial Intelligence hot snapshot.
  // Authenticated producer must supply the hash of its private multi-source
  // event qualification receipt. Private publisher identities/URLs never
  // enter public D1 payload_json. This metadata binding is not a replacement
  // for independent upstream verification or the signed GRO trust chain.
  if (product === "intelligence") {
    const checkedMs = Date.parse(String(proof.commercial_multi_source_checked_at ?? ""));
    if (!Number.isFinite(checkedMs) || checkedMs > now + 5 * 60_000 ||
        now - checkedMs > 5 * 60_000 ||
        proof.commercial_multi_source_verified !== true ||
        !HASH_RE.test(String(proof.commercial_multi_source_receipt_sha256 ?? "")) ||
        !Array.isArray(value.rows) || value.rows.length < 1 ||
        value.rows.some(item => item?.public_status !== "verified_b2" ||
          !["geopolitics", "macro", "rare_earth"].includes(item?.category) ||
          !Number.isInteger(item?.severity) ||
          item.severity < 0 || item.severity > 100) ||
        proof.commercial_multi_source_qualified_count !== value.rows.length) {
      throw new Error("HOT_SNAPSHOT_INDEPENDENT_MULTI_SOURCE_PROOF_REQUIRED");
    }
  }

  let qualifiedUntil = sourceAsOfMs + config.maxAgeMs;
  if(product === "intelligence" && proof.schema === MACHINE_INTELLIGENCE_PROOF_SCHEMA) {
    const deadline=Date.parse(String(proof.qualified_until ?? ""));
    if(!Number.isFinite(deadline)||deadline<=now||deadline>now+60*60_000)
      throw Error("HOT_SNAPSHOT_MACHINE_QUALIFICATION_EXPIRED");
    qualifiedUntil=Math.min(qualifiedUntil,deadline);
  }
  const sourceRunId = boundedText(body.source_run_id, 32);
  if (!/^\d{1,20}$/.test(sourceRunId)) throw new Error("INVALID_HOT_SNAPSHOT_RUN_ID");
  const payloadSha256 = String(body.payload_sha256 ?? "").trim().toLowerCase();
  if (!HASH_RE.test(payloadSha256)) throw new Error("INVALID_HASH");
  return {
    product,
    schema: config.schema,
    generatedAt,
    sourceAsOf,
    expiresAt: new Date(qualifiedUntil).toISOString(),
    b2Key: config.b2Key,
    b2Sha256: globalRiskRecovery ? String(proof.baseline_b2_sha256) : String(proof.compressed_sha256),
    payloadSha256,
    proofSchema: globalRiskRecovery ? GLOBAL_RISK_CURRENT_PROOF_SCHEMA : proof.schema,
    verificationMode: globalRiskRecovery ? GLOBAL_RISK_CURRENT_PROOF_MODE : "direct-b2-readback",
    baselinePayloadSha256: globalRiskRecovery ? String(proof.baseline_payload_sha256) : payloadSha256,
    baselineSourceRunId: globalRiskRecovery ? String(proof.baseline_source_run_id) : sourceRunId,
    baselineGeneratedAt: globalRiskRecovery ? String(proof.baseline_generated_at) : generatedAt,
    verifiedAt: nowIso(),
    sourceRunId,
    payloadJson,
  };
}

async function putPublicHotSnapshot(env, product, body) {
  const row = validateHotSnapshot(body, product);
  const actualPayloadSha256 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(row.payloadJson));
  const actualHex = Array.from(new Uint8Array(actualPayloadSha256), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualHex !== row.payloadSha256) throw new Error("HOT_SNAPSHOT_PAYLOAD_HASH_MISMATCH");
  if (row.verificationMode === GLOBAL_RISK_CURRENT_PROOF_MODE) {
    const anchor = await readGlobalRiskB2Anchor(env);
    if (
      !anchor ||
      anchor.b2_sha256 !== row.b2Sha256 ||
      anchor.payload_sha256 !== row.baselinePayloadSha256 ||
      anchor.source_run_id !== row.baselineSourceRunId ||
      Date.parse(String(anchor.generated_at ?? "")) !== Date.parse(String(row.baselineGeneratedAt ?? ""))
    ) throw new Error("HOT_SNAPSHOT_GLOBAL_RISK_B2_ANCHOR_MISMATCH");
  }
  const currentStatement=env.DB.prepare(`
    INSERT INTO public_b2_hot_snapshot (
      product, schema_name, generated_at, source_as_of, expires_at, b2_object_key, b2_sha256,
      payload_sha256, proof_schema, verified_at, source_run_id, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product) DO UPDATE SET
      schema_name = excluded.schema_name,
      generated_at = excluded.generated_at,
      source_as_of = excluded.source_as_of,
      expires_at = excluded.expires_at,
      b2_object_key = excluded.b2_object_key,
      b2_sha256 = excluded.b2_sha256,
      payload_sha256 = excluded.payload_sha256,
      proof_schema = excluded.proof_schema,
      verified_at = excluded.verified_at,
      source_run_id = excluded.source_run_id,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(
    row.product, row.schema, row.generatedAt, row.sourceAsOf, row.expiresAt, row.b2Key, row.b2Sha256,
    row.payloadSha256, row.proofSchema, row.verifiedAt, row.sourceRunId, row.payloadJson, row.verifiedAt,
  );
  // Durable WEBSITE-ONLY historical ring. Only an actually direct B2
  // readback/hash/restore-verified ORIGINAL GRI artifact qualifies; the
  // independent current-over-old-baseline proof never becomes a historical
  // signed/B2 snapshot by relabeling metadata.
  if(row.product==="global-risk" &&
     row.proofSchema===VERIFIED_GRI_B2_PROOF_SCHEMA &&
     row.verificationMode==="direct-b2-readback"){
    const historicalInsert=env.DB.prepare(`
      INSERT OR IGNORE INTO website_verified_gri_snapshot_history
      (source_as_of,payload_sha256,b2_sha256,original_generated_at,
       original_verified_at,proof_schema,payload_json,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(row.sourceAsOf,row.payloadSha256,row.b2Sha256,
      row.generatedAt,row.verifiedAt,row.proofSchema,row.payloadJson,nowIso());
    const cutoffIso=new Date(Date.now()-WEBSITE_GRI_HISTORY_RETENTION_MS).toISOString();
    const websiteCutoff=new Date(Date.now()-WEBSITE_GRI_DELAY_MS).toISOString();
    const prune=env.DB.prepare(WEBSITE_GRI_HISTORY_PRUNE_SQL)
      .bind(cutoffIso,WEBSITE_GRI_HISTORY_LIMIT,websiteCutoff);
    // D1 batch is transactional: do not promote current if the history
    // migration is missing or the verified predecessor cannot be retained.
    await env.DB.batch([currentStatement,historicalInsert,prune]);
  }else{
    await currentStatement.run();
  }
  const recovery = row.verificationMode === GLOBAL_RISK_CURRENT_PROOF_MODE;
  return json({
    ok: true,
    product: row.product,
    generated_at: row.generatedAt,
    source_as_of: row.sourceAsOf,
    expires_at: row.expiresAt,
    b2_object_key: row.b2Key,
    b2_sha256: row.b2Sha256,
    payload_sha256: row.payloadSha256,
    proof_schema: row.proofSchema,
    verification_mode: row.verificationMode,
    full_b2_readback_verified: recovery ? false : true,
    exact_gzip_restore_verified: recovery ? false : true,
    baseline_b2_readback_verified: true,
    baseline_exact_gzip_restore_verified: true,
    current_b2_readback_verified: recovery ? false : true,
    current_b2_snapshot_promoted: recovery ? false : true,
  });
}

async function getWebsiteLaggedGriHistory(env,now=Date.now()){
  const cutoff=new Date(now-WEBSITE_GRI_DELAY_MS).toISOString();
  let rows;
  try{
    const out=await env.DB.prepare(`
      SELECT source_as_of,payload_sha256,b2_sha256,
        original_generated_at,original_verified_at,proof_schema,payload_json
      FROM website_verified_gri_snapshot_history
      WHERE source_as_of <= ?
      ORDER BY source_as_of DESC LIMIT ?
    `).bind(cutoff,WEBSITE_GRI_HISTORY_LIMIT).all();
    rows=out?.results;
  }catch{
    return json({ok:false,error:"WEBSITE_GRI_HISTORY_UNAVAILABLE",
      chargeable:false,source_identity_disclosed:false},503);
  }
  for(const row of Array.isArray(rows)?rows:[]){
    // Verify the immutable original D1 historical artifact byte-for-byte
    // before materializing a privacy-only projection.
    const bytes=new TextEncoder().encode(String(row.payload_json??""));
    if(bytes.byteLength<2||bytes.byteLength>MAX_HOT_SNAPSHOT_BYTES)continue;
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    const hex=Array.from(new Uint8Array(digest),
      byte=>byte.toString(16).padStart(2,"0")).join("");
    if(hex!==row.payload_sha256)continue;
    const view=privateVerifiedGriHistoryProjection(row,{now});
    if(view)return json(view);
  }
  // READ-ONLY aging fallback. The original direct-B2 hot row may have been
  // too young at the one-time SQL migration but become release-eligible later,
  // especially when B2 Class B and producer quotas are frozen. Avoid a new
  // B2 GET, a write-on-GET, Supabase or false data-clock backdating. This
  // performs exactly ONE additional bounded D1 SELECT only on ring miss.
  try{
    const previous=await env.DB.prepare(`
      SELECT source_as_of,payload_sha256,b2_sha256,
        generated_at AS original_generated_at,
        verified_at AS original_verified_at,
        proof_schema,payload_json
      FROM public_b2_hot_snapshot
      WHERE product='global-risk'
        AND schema_name='geomacro.public-global-risk-live.v1'
        AND proof_schema='geomacro.public-global-risk-live-proof.v1'
        AND b2_object_key=?
        AND source_as_of<=?
      LIMIT 1
    `).bind(HOT_SNAPSHOT_PRODUCTS["global-risk"].b2Key,cutoff).first();
    if(previous){
      const bytes=new TextEncoder().encode(String(previous.payload_json??""));
      if(bytes.byteLength>=2&&bytes.byteLength<=MAX_HOT_SNAPSHOT_BYTES){
        const hash=await crypto.subtle.digest("SHA-256",bytes);
        const actual=Array.from(new Uint8Array(hash),
          b=>b.toString(16).padStart(2,"0")).join("");
        if(actual===previous.payload_sha256){
          const lagged=privateVerifiedGriHistoryProjection(previous,{now});
          if(lagged)return json(lagged);
        }
      }
    }
  }catch{
    return json({ok:false,error:"WEBSITE_GRI_HISTORY_UNAVAILABLE",
      chargeable:false,source_identity_disclosed:false},503);
  }
  return json({ok:false,error:"WEBSITE_GRI_60MIN_VERIFIED_HISTORY_NOT_FOUND",
    chargeable:false,source_identity_disclosed:false},503);
}

async function getPublicHotSnapshot(env, product, now = Date.now()) {
  const config = HOT_SNAPSHOT_PRODUCTS[product];
  if (!config) return json({ ok: false, error: "HOT_SNAPSHOT_NOT_FOUND" }, 404);
  try {
    const row = await env.DB.prepare(`
      SELECT product, schema_name, generated_at, source_as_of, expires_at, b2_object_key, b2_sha256,
        payload_sha256, proof_schema, verified_at, source_run_id, payload_json
      FROM public_b2_hot_snapshot WHERE product = ? LIMIT 1
    `).bind(product).first();
    if (!row) return json({ ok: false, error: "HOT_SNAPSHOT_UNAVAILABLE" }, 503);
    const generatedMs = Date.parse(String(row.generated_at ?? ""));
    const sourceAsOfMs = Date.parse(String(row.source_as_of ?? ""));
    const expiresMs = Date.parse(String(row.expires_at ?? ""));
    const payloadJson = String(row.payload_json ?? "");
    if (
      row.product !== product ||
      row.schema_name !== config.schema ||
      !(
        row.proof_schema === config.proofSchema ||
        product === "intelligence" && isIntelligenceProofSchema(row.proof_schema) ||
        product === "global-risk" && row.proof_schema === GLOBAL_RISK_CURRENT_PROOF_SCHEMA
      ) ||
      row.b2_object_key !== config.b2Key ||
      !HASH_RE.test(String(row.b2_sha256 ?? "")) ||
      !HASH_RE.test(String(row.payload_sha256 ?? "")) ||
      !/^\d{1,20}$/.test(String(row.source_run_id ?? "")) ||
      !Number.isFinite(generatedMs) ||
      !Number.isFinite(sourceAsOfMs) ||
      !Number.isFinite(expiresMs) ||
      generatedMs > now + 5 * 60_000 ||
      sourceAsOfMs > now + 5 * 60_000 ||
      now - sourceAsOfMs > config.maxAgeMs ||
      expiresMs <= now ||
      expiresMs > sourceAsOfMs + config.maxAgeMs ||
      expiresMs <= sourceAsOfMs ||
      new TextEncoder().encode(payloadJson).byteLength > MAX_HOT_SNAPSHOT_BYTES
    ) return json({ ok: false, error: "HOT_SNAPSHOT_STALE_OR_INVALID" }, 503);
    let value;
    try { value = JSON.parse(payloadJson); } catch {
      return json({ ok: false, error: "HOT_SNAPSHOT_INVALID" }, 503);
    }
    const actualPayloadSha256 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadJson));
    const actualHex = Array.from(new Uint8Array(actualPayloadSha256), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actualHex !== row.payload_sha256 || value?.schema !== config.schema || value?.generated_at !== row.generated_at) {
      return json({ ok: false, error: "HOT_SNAPSHOT_HASH_MISMATCH" }, 503);
    }
    const globalRiskRecovery =
      product === "global-risk" &&
      row.proof_schema === GLOBAL_RISK_CURRENT_PROOF_SCHEMA;
    if (globalRiskRecovery) {
      if (
        value?.verification_mode !== GLOBAL_RISK_CURRENT_PROOF_MODE ||
        value?.current_b2_snapshot_promoted !== false ||
        value?.baseline_b2_sha256 !== row.b2_sha256 ||
        !HASH_RE.test(String(value?.baseline_payload_sha256 ?? "")) ||
        !/^\d{1,20}$/.test(String(value?.baseline_source_run_id ?? "")) ||
        value?.data?.verificationStatus !== "verified" ||
        value?.data?.methodologyVersion !== "gri-v1.2.0" ||
        value?.data?.auditPersisted !== true
      ) return json({ ok: false, error: "HOT_SNAPSHOT_GLOBAL_RISK_CURRENT_PROOF_INVALID" }, 503);
    }
    return json({
      ok: true,
      product,
      schema: config.schema,
      generated_at: row.generated_at,
      source_as_of: row.source_as_of,
      expires_at: row.expires_at,
      // Durable signature/reference validity (12h/3h) is explicitly
      // distinct from <=60min live source freshness / paid eligibility.
      live_freshness_eligible: now - sourceAsOfMs <= 60 * 60 * 1000,
      freshness_status: now - sourceAsOfMs <= 60 * 60 * 1000
        ? "LIVE_SOURCE_WINDOW" : "VALID_SIGNED_REFERENCE_NOT_LIVE",
      b2_object_key: row.b2_object_key,
      b2_sha256: row.b2_sha256,
      payload_sha256: row.payload_sha256,
      proof_schema: row.proof_schema,
      verification_mode: globalRiskRecovery ? GLOBAL_RISK_CURRENT_PROOF_MODE : "direct-b2-readback",
      verified_at: row.verified_at,
      full_b2_readback_verified: globalRiskRecovery ? false : true,
      exact_gzip_restore_verified: globalRiskRecovery ? false : true,
      baseline_b2_readback_verified: true,
      baseline_exact_gzip_restore_verified: true,
      current_b2_readback_verified: globalRiskRecovery ? false : true,
      current_b2_snapshot_promoted: globalRiskRecovery ? false : true,
      payload_json: payloadJson,
    });
  } catch {
    return json({ ok: false, error: "D1_UNAVAILABLE" }, 503);
  }
}


async function getCountryGroVerifiedHot(env, country, url, now = Date.now()) {
  if (!COUNTRY_RE.test(country)) return json({ ok: false, error: "INVALID_COUNTRY" }, 400);
  const atRaw = String(url.searchParams.get("at_or_before") ?? new Date(now).toISOString()).trim();
  const atMs = Date.parse(atRaw);
  if (!Number.isFinite(atMs) || atMs > now + 5 * 60_000) {
    return json({ ok: false, error: "INVALID_TIMESTAMP" }, 400);
  }
  try {
    const row = await env.DB.prepare(`
      SELECT country_iso3, object_id, schema_version, generated_at, expires_at,
        signing_key_id, payload_hash, record_sha256, archive_key, archive_sha256,
        archive_write_acknowledged, archive_readback_verified, object_json, verified_at
      FROM country_gro_verified_hot
      WHERE country_iso3 = ? AND generated_at <= ? AND expires_at > ?
      LIMIT 1
    `).bind(country, new Date(atMs).toISOString(), new Date(atMs).toISOString()).first();
    if (!row) return json({ ok: false, error: "COUNTRY_GRO_HOT_UNAVAILABLE" }, 404);
    const objectJson = String(row.object_json ?? "");
    if (
      row.country_iso3 !== country ||
      row.archive_write_acknowledged !== 1 ||
      !HASH_RE.test(String(row.payload_hash ?? "")) ||
      !HASH_RE.test(String(row.record_sha256 ?? "")) ||
      !HASH_RE.test(String(row.archive_sha256 ?? "")) ||
      new TextEncoder().encode(objectJson).byteLength > 512 * 1024
    ) return json({ ok: false, error: "COUNTRY_GRO_HOT_INVALID" }, 503);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(objectJson));
    const digestHex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (digestHex !== row.record_sha256) return json({ ok: false, error: "COUNTRY_GRO_HOT_HASH_MISMATCH" }, 503);
    let object;
    try { object = JSON.parse(objectJson); } catch {
      return json({ ok: false, error: "COUNTRY_GRO_HOT_INVALID" }, 503);
    }
    if (
      object?.object_id !== row.object_id ||
      object?.schema_version !== row.schema_version ||
      object?.subject?.type !== "country" ||
      object?.subject?.id !== country ||
      object?.integrity?.signing_key_id !== row.signing_key_id ||
      object?.integrity?.payload_hash !== row.payload_hash ||
      object?.generated_at !== row.generated_at ||
      object?.expires_at !== row.expires_at
    ) return json({ ok: false, error: "COUNTRY_GRO_HOT_BINDING_INVALID" }, 503);
    return json({
      ok: true,
      serving_store: "cloudflare-d1",
      archive_store: "backblaze-b2",
      archive_write_acknowledged: true,
      archive_readback_verified: row.archive_readback_verified === 1,
      archive_readback_required_for_serving: false,
      country_iso3: country,
      object_id: row.object_id,
      signing_key_id: row.signing_key_id,
      payload_hash: row.payload_hash,
      record_sha256: row.record_sha256,
      archive_key: row.archive_key,
      archive_sha256: row.archive_sha256,
      verified_at: row.verified_at,
      object,
    });
  } catch {
    return json({ ok: false, error: "D1_UNAVAILABLE" }, 503);
  }
}

async function health(env) {
  if (!env.DB) return json({ ok: false, error: "D1_BINDING_MISSING" }, 503);
  try {
    const row = await env.DB.prepare("SELECT version, updated_at FROM schema_meta WHERE name = ?")
      .bind("control-plane")
      .first();
    if (!row || Number(row.version) < 1) return json({ ok: false, error: "D1_SCHEMA_NOT_READY" }, 503);
    return json({ ok: true, store: "d1", schema_version: Number(row.version), durable_payload_store: "b2", commerce_ledger: "durable_object",
      derived_news_topic_policy_revision: DERIVED_NEWS_TOPIC_POLICY_REVISION,
      deployed_source_sha: /^[a-f0-9]{40}$/.test(String(env.GEOMACRO_SOURCE_SHA ?? ""))
        ? env.GEOMACRO_SOURCE_SHA : null });
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

async function getPublicThreeDomain30MinSourcePulse(env) {
  try {
    const query = await env.DB.prepare(
      "SELECT scope,status,last_attempt_at,metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope IN ('geopolitics','macro','rare_earth') LIMIT 4"
    ).bind("official_source_pulse_30m").all();
    const rows = query?.results;
    return json(projectPublic30mPulse(rows), 200);
  } catch {
    return json({ok:false,error:"THREE_DOMAIN_SOURCE_PULSE_D1_UNAVAILABLE",chargeable:false},503);
  }
}

export default {
  async scheduled(controller,env,ctx){
    ctx.waitUntil(runMacroReleaseTick(env).then(receipt=>console.log(JSON.stringify({schema:"geomacro.macro-release-tick.v1",...receipt}))).catch(()=>console.error("MACRO_RELEASE_TICK_UNAVAILABLE")));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicReadCache=(run,cacheRequest=request)=>readPublicFreeD1Cached(cacheRequest,run,{
      cache:typeof caches!=="undefined"?caches.default:null,
      waitUntil:typeof ctx?.waitUntil==="function"?task=>ctx.waitUntil(task):null,
    });
    const parts = url.pathname.split("/").filter(Boolean);

    if (request.method === "GET" && url.pathname === "/health") return health(env);
    if (!env.DB) return json({ ok: false, error: "D1_BINDING_MISSING" }, 503);
    if(request.method==="GET"&&url.pathname==="/v1/public/macro-fastlane"&&!url.search)return publicReadCache(()=>readPublicMacro(env));
    if(request.method==="GET"&&url.pathname==="/v1/public/source-runtime"&&!url.search)return publicReadCache(()=>getSourceRuntimeStatus(env));
    if(request.method==="GET"&&url.pathname==="/v1/public/reusable-source-news")
      return publicReadCache(()=>publicReusableSourceNews(env,url.searchParams));
    if(request.method==="GET"&&url.pathname==="/v1/public/three-domain-continuity"&&!url.search)
      return publicReadCache(()=>threeDomainEvidenceContinuity(env));
    if(request.method==="GET"&&url.pathname==="/v1/public/source-runtime-context"){
      if([...url.searchParams.keys()].some(k=>k!=="category")||url.searchParams.getAll("category").length!==1)
        return json({ok:false,error:"SOURCE_RUNTIME_QUERY_INVALID"},400);
      return publicReadCache(()=>getSourceRuntimeContext(env,url.searchParams.get("category")));
    }
    if(request.method==="GET"&&url.pathname==="/v1/public/automated-finds"){
      if([...url.searchParams.keys()].some(k=>k!=="category")||url.searchParams.getAll("category").length>1)
        return json({ok:false,error:"AUTOMATED_FINDS_QUERY_INVALID"},400);
      return getAutomatedFinds(env,url.searchParams.get("category"));
    }
    if(request.method==="GET"&&url.pathname==="/v1/public/fastlane-intelligence")
      return publicReadCache(()=>publicSharedDerivedNewsFeed(env,url.searchParams,Date.now(),"attributed_research",true));
    if(request.method==="GET"&&url.pathname==="/v1/public/derived-structural-72h")
      return publicReadCache(async()=>{
        // The 3 public category variants project from one source-neutral
        // full feed (one bounded D1 scan / public POP cache key), not three
        // independent 601-row journal scans. Authenticated/no-cache and
        // invalid query requests always retain their canonical origin path.
        const domain=url.searchParams.get("domain");
        if(domain!==null&&eligiblePublicFreeD1CacheRequest(request)){
          const baseUrl=new URL(request.url);
          baseUrl.search="";
          const baseRequest=new Request(baseUrl.toString(),{method:"GET"});
          const source=await publicReadCache(async()=>
            await readPublicNewsR2Snapshot(baseRequest,env) ??
            await publicSharedDerivedNewsFeed(env,new URLSearchParams(),Date.now(),
              "source_neutral",false,true),baseRequest);
          return projectPublicMachineDomainResponse(source,domain);
        }
        return await readPublicNewsR2Snapshot(request,env) ??
          await publicSharedDerivedNewsFeed(env,url.searchParams,Date.now(),
            "source_neutral",false,eligiblePublicFreeD1CacheRequest(request));
      });
    if(request.method==="GET"&&url.pathname==="/v1/partner/predge/derived-structural-72h")
      return predgeResearchDerivedNewsFeed(request,env);
    if(request.method==="GET"&&url.pathname==="/v1/public/risk-gate-d1-readiness"&&!url.search)
      return predgeRiskGateD1Readiness(env);
    // Distinct risk-gate credential and D1 quota; never inherit root admin auth.
    if(url.pathname==="/v1/partner/predge/risk-gate")
      return predgeRiskGateD1(request,env);
    if (request.method === "GET" && url.pathname === "/v1/public/website-derived-news-html" && !url.search) {
      // Reuse the SAME source-neutral page-0 cache as immediate JSON. An HTML
      // cache miss must not force a second 250+ row D1 read when JSON is hot.
      // Preserve the original headers: auth/no-cache readbacks must BYPASS
      // both caches; failure falls back to actual D1, never synthetic news.
      const pageUrl=new URL(request.url);
      pageUrl.pathname="/v1/public/website-derived-news-immediate";
      const pageRequest=new Request(pageUrl.toString(),{
        method:"GET",headers:request.headers
      });
      return publicReadCache(()=>renderDerivedStoriesHtml(env,Date.now(),
        ()=>readPublicFreeD1Cached(pageRequest,async()=>
          await readPublicNewsR2Snapshot(pageRequest,env) ??
          await readDerivedStories(env,Date.now(),0,0,
            eligiblePublicFreeD1CacheRequest(pageRequest)),{
            cache:typeof caches!=="undefined"?caches.default:null,
            waitUntil:typeof ctx?.waitUntil==="function"?task=>ctx.waitUntil(task):null,
          })));
    }
    if(request.method==="GET"&&url.pathname==="/v1/public/website-derived-news-bundle"&&!url.search)
      return publicReadCache(async()=>await readPublicNewsR2Snapshot(request,env) ??
        await readDerivedStoriesBundle(env,Date.now(),
          eligiblePublicFreeD1CacheRequest(request)));
    // Retired: this public URL exposed private original-page verdicts,
    // source-review clocks and issuer envelopes. Neither browsers, agents
    // nor PREDGE may read internal qualification state.
    if(url.pathname==='/v1/public/intelligence-publications')
      return json({ok:false,error:"NOT_FOUND"},404);
    if(url.pathname==='/v1/internal/intelligence-publications'){
      if(request.method!=='GET')return json({ok:false,error:"NOT_FOUND"},404);
      const newsAuth=await authorizePrivateNewsProof(request,env);
      if(!newsAuth.ok)return json({ok:false,error:newsAuth.error},newsAuth.status);
      return publicSignedNews(env,url.searchParams);
    }
    if (request.method === "GET" && ["/v1/public/website-derived-news","/v1/public/website-derived-news-immediate"].includes(url.pathname)) {
      // Same D1 journal, no additional publisher/storage. Preserve the old
      // envelope and filter for already published browsers during rollout.
      const legacyDelay=url.pathname==="/v1/public/website-derived-news"?15:0;
      // Only deterministic 250-row read pages of the existing 600-row D1
      // journal. No arbitrary SQL offsets or raw publisher payloads.
      const q=url.searchParams;
      if(q.size===0)return publicReadCache(async()=>
        await readPublicNewsR2Snapshot(request,env) ??
        await readDerivedStories(env,Date.now(),0,legacyDelay,
          eligiblePublicFreeD1CacheRequest(request)));
      if(q.size!==1||q.getAll("offset").length!==1||
         !["250","500"].includes(q.get("offset")))
        return json({ok:false,error:"DERIVED_NEWS_PAGE_INVALID",chargeable:false},400);
      return publicReadCache(async()=>
        await readPublicNewsR2Snapshot(request,env) ??
        await readDerivedStories(env,Date.now(),Number(q.get("offset")),legacyDelay,
          eligiblePublicFreeD1CacheRequest(request)));
    }
    if (request.method === "GET" && url.pathname === "/v1/public/source-pulse-30m") {
      return publicReadCache(()=>getPublicThreeDomain30MinSourcePulse(env));
    }
    if (request.method === "GET" && url.pathname === "/v1/public/intelligence-overlay") {
      return publicReadCache(()=>getPublicIntelligenceOverlay(env));
    }
    if(request.method==="GET" &&
       url.pathname==="/v1/public/website-lagged-global-risk" && !url.search){
      return getWebsiteLaggedGriHistory(env);
    }
    if (request.method === "GET" && url.pathname === "/v1/public/historical-continuity/global-risk") {
      return getHistoricalGlobalRiskContinuity(env);
    }
    if (request.method === "GET" && url.pathname === "/v1/public/historical-continuity/risk-indices") {
      return getHistoricalRiskIndicesContinuity(env);
    }
    if (request.method === "GET" && parts[0] === "v1" && parts[1] === "public" && parts[2] === "hot-snapshot" && parts.length === 4) {
      return getPublicHotSnapshot(env, decodeURIComponent(parts[3]));
    }

    // Dedicated capability token: this reviewer cannot use the admin writer,
    // partner delivery or paid/hot publication routes with this credential.
    if(url.pathname==='/v1/internal/private-osint-15m')return handlePrivateOsint15m(request,env);
    if(url.pathname==='/v1/internal/low-source-reviews')return handleLowSourceReviews(request,env);
    if(url.pathname==='/v1/internal/source-handoffs')return handlePrivateSourceHandoffs(request,env);
    const auth = authorized(request, env);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    try {
      if(request.method==='GET'&&url.pathname==='/v1/internal/website-derived-news-bundle'&&!url.search){
        const direct=await readDerivedStoriesBundle(env,Date.now(),false);
        const headers=new Headers(direct.headers);
        headers.set('Cache-Control','private, no-store');
        headers.set('X-GeoMacro-Origin-Readback','d1-canonical');
        return new Response(direct.body,{status:direct.status,headers});
      }
      if(url.pathname==='/v1/internal/news-intake-policy'&&!url.search){
        if(request.method==='GET')return readNewsIntakePolicy(env);
        if(request.method==='PUT')return storeNewsIntakePolicy(env,await readJson(request,1024));
      }
      if(url.pathname==="/v1/internal/macro-fastlane"&&!url.search){
        if(request.method==="GET")return json({ok:true,state:await loadMacroState(env)});
        if(request.method==="PUT")return storeMacroState(env,await readJson(request,50000));
      }
      if(request.method==="PUT"&&url.pathname==="/v1/public-news-r2-snapshot"&&!url.search)
        return publishPublicNewsR2Snapshot(env,await readJson(request,PUBLIC_NEWS_R2_MAX_BYTES));
      if(request.method==='GET'&&url.pathname==='/v1/internal/news-product-factory')
        return readNewsProductFactory(env,url.searchParams);
      if(request.method==="PUT"&&url.pathname==="/v1/reusable-source-news"&&!url.search)
        return publishReusableSourceNews(env,await readJson(request,96*1024));
      if(request.method==="PUT"&&url.pathname==="/v1/internal/telegram-export-derived-json"&&!url.search)
        return writeOwnerTelegramExportJson(env,await readJson(request,50_000));
      if(request.method==="GET"&&url.pathname==="/v1/internal/telegram-export-derived-json")
        return privateOwnerTelegramExportJson(env,url.searchParams);
      if(request.method==="GET"&&url.pathname==="/v1/internal/telegram-research-json")
        return readPrivateTelegramResearchJson(env,url.searchParams);
      if(request.method==="GET"&&url.pathname==="/v1/internal/telegram-free-live-research-json")
        return readPrivateTelegramFreeLiveJson(env,url.searchParams);
      if(url.pathname==='/v1/intelligence-inputs/automated'){
        if(request.method==='GET')return getAutomatedInputs(env,url.searchParams);
        if(request.method==='PUT'&&!url.search)return putAutomatedInputs(env,await readJson(request,300_000));
      }
      // Inherits existing strong CONTROL_PLANE_TOKEN auth; deliberately
      // excluded from all public and partner routes.
      if(request.method==="GET"&&url.pathname==="/v1/internal/source-directory" )
        return getPrivateLegacySourceDirectory(env,url.searchParams);
      if(request.method==="GET"&&url.pathname==="/v1/internal/source-directory-coverage")
        return getPrivateLegacySourceDirectoryCoverage(env,url.searchParams);
      if(request.method==='POST'&&url.pathname==='/v1/security/budget'&&!url.search){
        const receipt=await consumeCentralSecurityBudget(env.DB,await readJson(request,256));
        return json(receipt,receipt.allowed?200:429);
      }
      if(request.method==="PUT"&&url.pathname==="/v1/automated-finds"&&!url.search)
        return putAutomatedFinds(env,await readJson(request,300_000));
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "country-gro-hot" &&
        parts.length === 3
      ) return getCountryGroVerifiedHot(env, parts[2].toUpperCase(), url);
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "hot-snapshot-anchor" &&
        parts[2] === "global-risk" &&
        parts.length === 3
      ) return getGlobalRiskB2Anchor(env);
      if (request.method === "GET" && url.pathname === "/v1/b2-quota/status") {
        return json(await readB2AccountQuota(env.DB));
      }
      if (request.method === "POST" && url.pathname === "/v1/b2-quota/reserve") {
        const body = await readJson(request, 1024);
        const receipt = await reserveB2AccountQuota(env.DB, body);
        return json(receipt, receipt.ok ? 200 : 429);
      }
      if(request.method==="GET"&&url.pathname==="/v1/internal/website-derived-news-origin"){
        // Authenticated direct canonical D1, NOT public Cache API, R2,
        // materialized pages or CDN-key aliases. Protected acceptance alone.
        const q=url.searchParams;
        if(q.size!==1||q.getAll("offset").length!==1||
           q.get("offset")!=="500"||url.search!=="?offset=500")
          return json({ok:false,error:"CANONICAL_READBACK_OFFSET_INVALID"},400);
        const direct=await readDerivedStories(env,Date.now(),500,0,false);
        if(direct.headers.has("X-GeoMacro-Public-Offload"))
          return json({ok:false,error:"CANONICAL_READBACK_OFFLOAD_FORBIDDEN"},503);
        const headers=new Headers(direct.headers);
        headers.set("Cache-Control","no-store");
        headers.set("X-GeoMacro-Origin-Readback","d1-canonical");
        return new Response(direct.body,{status:direct.status,headers});
      }
      if(request.method==="PUT"&&url.pathname==="/v1/internal/public-news-page-refresh"&&!url.search){
        // Owner authenticated, public-only, no new publisher source fetch
        // or D1 event write. Output is metadata-only, no raw/source data.
        try{
          const receipt=await refreshMaterializedNewsPages(env,Date.now());
          const accepted=["MATERIALIZED_ALREADY_CURRENT","MATERIALIZED_COMMIT_VERIFIED"]
            .includes(receipt.status);
          return json({ok:accepted,
            schema:"geomacro.public-derived-materialization-refresh.v1",
            state:receipt.status,pages:receipt.pages,
            read_queries:receipt.producer_read_queries,
            canonical_count:receipt.canonical_rows,
            publisher_sources_polled:0,publisher_events_inserted:0,
            b2_requests:0,signed_products_created:0},accepted?200:409);
        }catch(error){
          return json({ok:false,error:error?.message==="MATERIALIZED_JOURNAL_OVER_CAP_OR_INVALID"?
            "MATERIALIZED_JOURNAL_OVER_CAP":"MATERIALIZED_REFRESH_UNAVAILABLE",
            publisher_sources_polled:0,publisher_events_inserted:0,b2_requests:0},503);
        }
      }
      if (request.method === "PUT" && url.pathname === "/v1/website-derived-news" && !url.search) {
        const batch = await readJson(request, 64 * 1024);
        return publishDerivedStories(env, batch);
      }
      if (request.method !== "PUT") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
      if (parts[0] === "v1" && parts[1] === "hot-snapshot" && parts.length === 3) {
        const body = await readJson(request, MAX_HOT_SNAPSHOT_BODY_BYTES);
        return await putPublicHotSnapshot(env, decodeURIComponent(parts[2]), body);
      }
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
      const clientError = /^(BODY_|INVALID_|MISSING_|VALUE_|METADATA_|DURABLE_|HOT_SNAPSHOT_|B2_QUOTA_KIND_|B2_QUOTA_WORKFLOW_)/.test(code);
      if (!clientError) console.error("[control-plane] request failed", code);
      return json({ ok: false, error: clientError ? code : "CONTROL_PLANE_FAILURE" }, clientError ? 400 : 500);
    }
  },
};
