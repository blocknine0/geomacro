#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import { createGriDbClient } from "../lib/gri-db-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json";
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const CURRENT_EVIDENCE_CONTRACT = "gdelt-v2-event-export-conflict-root-v1";
const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const ROWS_PER_CATEGORY = 40;
const MAX_LIVE_OBSERVED_ROWS = 24;
const LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const SCORED_ONLY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function rowTime(row) {
  const parsed = Date.parse(String(row?.published_at ?? row?.created_at ?? ""));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function cleanText(value, max = 1200) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function assertConfig() {
  if (
    String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID ||
    !process.env.B2_APPLICATION_KEY ||
    String(process.env.GRI_DB_MODE ?? "").trim() !== "direct_postgres" ||
    !process.env.SUPABASE_DB_URL
  ) throw new Error("FASTLANE_PRESERVE_CONFIG_INVALID");
}

function validateLiveRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_LIVE_OBSERVED_ROWS) {
    throw new Error("FASTLANE_PRESERVE_LIVE_COUNT_INVALID");
  }
  const seen = new Set();
  const now = Date.now();
  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    const title = String(row?.source_title ?? "").trim();
    const timestamp = rowTime(row);
    if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000 || now - timestamp > LIVE_MAX_AGE_MS) {
      throw new Error("FASTLANE_PRESERVE_LIVE_ROW_STALE");
    }
    if (
      !id ||
      row?.public_status !== "live_observed" ||
      row?.category !== "geopolitics" ||
      row?.severity !== null ||
      row?.delta !== null ||
      !title.startsWith("Geomacro observes ") ||
      "source_name" in row ||
      "source_domain" in row ||
      "source_url" in row
    ) throw new Error("FASTLANE_PRESERVE_LIVE_ROW_INVALID");
    const key = `${row.category}|${title.toLowerCase().replace(/\s+/gu, " ")}`;
    if (seen.has(key)) throw new Error("FASTLANE_PRESERVE_LIVE_DUPLICATE");
    seen.add(key);
  }
}

async function readVerifiedExistingLive(b2) {
  const [packed, proofBytes] = await Promise.all([b2.get(LIVE_KEY), b2.get(PROOF_KEY)]);
  let proof;
  let value;
  try {
    proof = JSON.parse(proofBytes.toString("utf8"));
    value = JSON.parse(gunzipSync(packed).toString("utf8"));
  } catch {
    throw new Error("FASTLANE_PRESERVE_EXISTING_RESTORE_INVALID");
  }
  if (
    proof?.schema !== "geomacro.public-intelligence-live-proof.v1" ||
    proof?.source_project !== PROJECT_REF ||
    proof?.live_key !== LIVE_KEY ||
    proof?.classification_version !== CLASSIFICATION_VERSION ||
    proof?.current_evidence_contract !== CURRENT_EVIDENCE_CONTRACT ||
    proof?.current_source_id !== "gdelt_v2_events" ||
    proof?.full_b2_readback_verified !== true ||
    proof?.exact_gzip_restore_verified !== true ||
    proof?.synthetic_score !== false ||
    proof?.raw_source_headlines_exposed !== false ||
    proof?.provider_identity_exposed !== false ||
    Number(proof?.compressed_bytes) !== packed.length ||
    String(proof?.compressed_sha256 ?? "") !== sha256(packed)
  ) throw new Error("FASTLANE_PRESERVE_EXISTING_PROOF_INVALID");
  if (
    value?.schema !== "geomacro.public-intelligence-live.v1" ||
    value?.source_project !== PROJECT_REF ||
    value?.classification_version !== CLASSIFICATION_VERSION ||
    value?.current_evidence_contract !== CURRENT_EVIDENCE_CONTRACT ||
    value?.raw_source_headlines_exposed !== false ||
    value?.provider_identity_exposed !== false
  ) throw new Error("FASTLANE_PRESERVE_EXISTING_BINDING_INVALID");
  const batchMs = Date.parse(String(proof?.current_source_batch_at ?? ""));
  if (!Number.isFinite(batchMs) || Date.now() - batchMs > LIVE_MAX_AGE_MS || batchMs > Date.now() + 5 * 60_000) {
    throw new Error("FASTLANE_PRESERVE_CURRENT_SOURCE_STALE");
  }
  const rows = (Array.isArray(value?.rows) ? value.rows : []).filter((row) => row?.public_status === "live_observed");
  validateLiveRows(rows);
  if (rows.length !== Number(proof?.live_observed_rows)) throw new Error("FASTLANE_PRESERVE_LIVE_PROOF_COUNT_MISMATCH");
  return {
    rows,
    batchIso: proof.current_source_batch_at,
    exportMd5: proof.current_source_export_md5,
    fipsSha256: proof.current_source_fips_sha256,
  };
}

async function readScoredRows() {
  const db = createGriDbClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("events")
    .select("id,category,severity,delta,created_at,published_at,narrative,summary,classification_version,source_name,source_domain")
    .in("category", REQUIRED_CATEGORIES)
    .eq("classification_version", CLASSIFICATION_VERSION)
    .gte("created_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(`FASTLANE_PRESERVE_DB_READ_FAILED:${error.message}`);

  const grouped = new Map(REQUIRED_CATEGORIES.map((category) => [category, []]));
  for (const row of data ?? []) {
    const category = String(row?.category ?? "");
    if (!grouped.has(category)) continue;
    const severity = Number(row?.severity);
    const timestamp = rowTime(row);
    const narrative = cleanText(row?.narrative, 280);
    const summary = cleanText(row?.summary, 1200);
    const sourceName = String(row?.source_name ?? "").toLowerCase();
    const sourceDomain = String(row?.source_domain ?? "").toLowerCase();
    if (
      !String(row?.id ?? "").trim() ||
      !Number.isFinite(severity) || severity < 0 || severity > 100 ||
      !Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60_000 ||
      !narrative || sourceName.includes("guardian") || ["theguardian.com", "www.theguardian.com"].includes(sourceDomain)
    ) continue;
    grouped.get(category).push({
      id: String(row.id),
      source_title: narrative.toLowerCase().startsWith("geomacro finds ")
        ? narrative
        : `Geomacro finds ${narrative.replace(/[.!?]+$/u, "")}`,
      summary: summary || null,
      category,
      severity,
      delta: row?.delta ?? null,
      created_at: row.created_at,
      published_at: row.published_at,
      public_status: "verified_b2",
    });
  }

  const output = [];
  const latestByCategory = {};
  for (const category of REQUIRED_CATEGORIES) {
    const rows = grouped.get(category)
      .sort((a, b) => rowTime(b) - rowTime(a) || String(b.id).localeCompare(String(a.id)))
      .slice(0, ROWS_PER_CATEGORY);
    if (!rows.length) throw new Error(`FASTLANE_PRESERVE_SCORED_CATEGORY_MISSING:${category}`);
    latestByCategory[category] = rowTime(rows[0]);
    output.push(...rows);
  }
  return { rows: output, latestByCategory };
}

function assertScoredOnlyFreshness(latestByCategory) {
  const now = Date.now();
  for (const category of REQUIRED_CATEGORIES) {
    const timestamp = Number(latestByCategory?.[category]);
    if (
      !Number.isFinite(timestamp) ||
      timestamp > now + 5 * 60_000 ||
      now - timestamp > SCORED_ONLY_MAX_AGE_MS
    ) throw new Error(`FASTLANE_SCORED_ONLY_CATEGORY_STALE:${category}`);
  }
}

function validateCombinedRows(rows, { requireLive }) {
  const scored = new Set();
  const seen = new Set();
  let live = 0;
  for (const row of rows) {
    const title = String(row?.source_title ?? "").trim();
    const category = String(row?.category ?? "");
    if (!String(row?.id ?? "").trim() || !title || !REQUIRED_CATEGORIES.includes(category)) {
      throw new Error("FASTLANE_PRESERVE_ROW_SHAPE_INVALID");
    }
    if ("source_name" in row || "source_domain" in row || "source_url" in row) {
      throw new Error("FASTLANE_PRESERVE_SOURCE_IDENTITY_EXPOSED");
    }
    if (row?.public_status === "verified_b2") {
      const severity = Number(row?.severity);
      if (!title.startsWith("Geomacro finds ") || !Number.isFinite(severity) || severity < 0 || severity > 100) {
        throw new Error("FASTLANE_PRESERVE_SCORED_ROW_INVALID");
      }
      scored.add(category);
    } else if (row?.public_status === "live_observed") {
      live += 1;
    } else throw new Error("FASTLANE_PRESERVE_STATUS_INVALID");
    const key = `${category}|${title.toLowerCase().replace(/\s+/gu, " ")}`;
    if (seen.has(key)) throw new Error("FASTLANE_PRESERVE_DUPLICATE_ROW");
    seen.add(key);
  }
  for (const category of REQUIRED_CATEGORIES) if (!scored.has(category)) throw new Error(`FASTLANE_PRESERVE_SCORED_CATEGORY_MISSING:${category}`);
  if (requireLive && live < 1) throw new Error("FASTLANE_PRESERVE_LIVE_MISSING");
  if (!requireLive && live !== 0) throw new Error("FASTLANE_SCORED_ONLY_LIVE_ROW_PRESENT");
}

assertConfig();
const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

let preserved = null;
let preserveFallbackReason = null;
try {
  preserved = await readVerifiedExistingLive(b2);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!["FASTLANE_PRESERVE_CURRENT_SOURCE_STALE", "FASTLANE_PRESERVE_LIVE_ROW_STALE"].includes(message)) throw error;
  preserveFallbackReason = message;
  console.warn(`FASTLANE_PRESERVE_LIVE_STALE_USING_CURRENT_CANONICAL_SCORES_ONLY:${message}`);
}

const scored = await readScoredRows();
const scoredOnly = preserved === null;
if (scoredOnly) assertScoredOnlyFreshness(scored.latestByCategory);
const rows = [...(preserved?.rows ?? []), ...scored.rows].sort((a, b) => rowTime(b) - rowTime(a));
validateCombinedRows(rows, { requireLive: !scoredOnly });

const generatedAt = new Date().toISOString();
const value = {
  schema: "geomacro.public-intelligence-live.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  scoring_policy: scoredOnly ? "canonical-scored-only-current" : "canonical-scored-plus-certified-current-unscored",
  classification_version: CLASSIFICATION_VERSION,
  current_evidence_contract: scoredOnly ? null : CURRENT_EVIDENCE_CONTRACT,
  public_language: "en",
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  rows,
};
const packed = gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
const digest = sha256(packed);
await b2.put(LIVE_KEY, packed);
const readback = await b2.get(LIVE_KEY);
if (readback.length !== packed.length || sha256(readback) !== digest) throw new Error("FASTLANE_PRESERVE_B2_HASH_INVALID");
let restored;
try { restored = JSON.parse(gunzipSync(readback).toString("utf8")); } catch { throw new Error("FASTLANE_PRESERVE_B2_RESTORE_INVALID"); }
validateCombinedRows(restored?.rows, { requireLive: !scoredOnly });
if (restored?.generated_at !== generatedAt || restored?.classification_version !== CLASSIFICATION_VERSION) {
  throw new Error("FASTLANE_PRESERVE_B2_BINDING_INVALID");
}

const verifiedRows = rows.filter((row) => row.public_status === "verified_b2").length;
const liveObservedRows = rows.filter((row) => row.public_status === "live_observed").length;
const proofValue = {
  schema: "geomacro.public-intelligence-live-proof.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  live_key: LIVE_KEY,
  classification_version: CLASSIFICATION_VERSION,
  current_evidence_contract: scoredOnly ? null : CURRENT_EVIDENCE_CONTRACT,
  current_source_id: scoredOnly ? null : "gdelt_v2_events",
  current_source_batch_at: preserved?.batchIso ?? null,
  current_source_export_md5: preserved?.exportMd5 ?? null,
  current_source_fips_sha256: preserved?.fipsSha256 ?? null,
  current_source_reused: !scoredOnly,
  current_source_freshness_advanced: false,
  categories: REQUIRED_CATEGORIES,
  row_count: rows.length,
  verified_scored_rows: verifiedRows,
  live_observed_rows: liveObservedRows,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  scored_only: scoredOnly,
  live_observed_unscored: !scoredOnly,
  real_event_timestamps_preserved: true,
  public_language: "en",
  derived_titles_only: true,
  guardian_commercial_dependency: false,
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  synthetic_score: false,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
  scored_latest_at_by_category: Object.fromEntries(
    REQUIRED_CATEGORIES.map((category) => [category, new Date(scored.latestByCategory[category]).toISOString()]),
  ),
  scored_only_max_age_ms: scoredOnly ? SCORED_ONLY_MAX_AGE_MS : null,
  preserve_fallback_reason: preserveFallbackReason,
};
const proof = Buffer.from(JSON.stringify(proofValue));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) throw new Error("FASTLANE_PRESERVE_PROOF_READBACK_INVALID");

const publicationMode = scoredOnly ? "canonical_scored_only_current" : "preserved_verified_live_plus_fresh_scored";
console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.public-intelligence-preserved-live-score-republish.v1",
  authority_read: scoredOnly ? "direct-postgres-current-canonical-scored" : "direct-postgres-scored-plus-preserved-verified-b2-live",
  authority_serve: "backblaze-b2",
  classification_version: CLASSIFICATION_VERSION,
  publication_mode: publicationMode,
  current_source_batch_at: preserved?.batchIso ?? null,
  current_source_reused: !scoredOnly,
  current_source_freshness_advanced: false,
  verified_scored_rows: verifiedRows,
  live_observed_rows: liveObservedRows,
  scored_only: scoredOnly,
  live_observed_unscored: !scoredOnly,
  synthetic_score: false,
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  b2_readback_verified: true,
}));
