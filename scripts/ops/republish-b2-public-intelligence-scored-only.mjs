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
const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const ROWS_PER_CATEGORY = 40;
const REQUIRED_FRESH_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 72 * 60 * 60 * 1000;
const TITLE_PREFIX = /^Geomacro\s+(?:finds|observes)\s+/iu;
const TOKEN_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "over", "under",
  "after", "before", "amid", "among", "this", "that", "these", "those",
  "its", "their", "his", "her", "our", "your", "was", "were", "are",
  "has", "have", "had", "will", "would", "could", "should", "about",
  "through", "across", "within", "without", "more", "less", "new",
]);

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(TITLE_PREFIX, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokens(value) {
  const out = new Set();
  for (const token of normalizeText(value).split(" ")) {
    if (token.length < 3 || TOKEN_STOPWORDS.has(token)) continue;
    out.add(token);
  }
  return out;
}

function overlap(a, b) {
  if (a.size === 0 || b.size === 0) return { jaccard: 0, containment: 0, minSize: 0 };
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  const minSize = Math.min(a.size, b.size);
  return {
    jaccard: union > 0 ? intersection / union : 0,
    containment: minSize > 0 ? intersection / minSize : 0,
    minSize,
  };
}

function sameStory(a, b) {
  if (String(a?.category ?? "") !== String(b?.category ?? "")) return false;
  const timeA = rowTime(a);
  const timeB = rowTime(b);
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || Math.abs(timeA - timeB) > DUPLICATE_WINDOW_MS) return false;

  const summaryA = normalizeText(a?.summary);
  const summaryB = normalizeText(b?.summary);
  if (summaryA.length >= 32 && summaryA === summaryB) return true;

  const titleA = normalizeText(a?.source_title);
  const titleB = normalizeText(b?.source_title);
  if (titleA.length >= 32 && titleA === titleB) return true;

  const summaryOverlap = overlap(tokens(a?.summary), tokens(b?.summary));
  if (
    (summaryOverlap.minSize >= 5 && summaryOverlap.jaccard >= 0.82) ||
    (summaryOverlap.minSize >= 8 && summaryOverlap.containment >= 0.74)
  ) return true;

  const titleOverlap = overlap(tokens(a?.source_title), tokens(b?.source_title));
  return (
    (titleOverlap.minSize >= 6 && titleOverlap.jaccard >= 0.82) ||
    (titleOverlap.minSize >= 8 && titleOverlap.containment >= 0.82)
  );
}

function dedupeScoredRows(rows) {
  const accepted = [];
  for (const row of [...rows].sort((a, b) => rowTime(b) - rowTime(a))) {
    if (accepted.some((prior) => sameStory(row, prior))) continue;
    accepted.push(row);
  }
  return accepted;
}

function assertConfig() {
  if (
    String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID ||
    !process.env.B2_APPLICATION_KEY ||
    String(process.env.GRI_DB_MODE ?? "").trim() !== "direct_postgres" ||
    !process.env.SUPABASE_DB_URL
  ) throw new Error("FASTLANE_SCORED_ONLY_CONFIG_INVALID");
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
  if (error) throw new Error(`FASTLANE_SCORED_ONLY_DB_READ_FAILED:${error.message}`);

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
      !Number.isFinite(timestamp) || timestamp > Date.now() + FUTURE_TOLERANCE_MS ||
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
  const now = Date.now();
  for (const category of REQUIRED_CATEGORIES) {
    const rows = dedupeScoredRows(grouped.get(category));
    const latest = rows[0];
    const latestMs = rowTime(latest);
    const ageMs = now - latestMs;
    if (!latest || !Number.isFinite(latestMs)) {
      throw new Error(`FASTLANE_SCORED_ONLY_CATEGORY_MISSING:${category}`);
    }
    if (latestMs > now + FUTURE_TOLERANCE_MS || ageMs > REQUIRED_FRESH_MS) {
      throw new Error(`FASTLANE_SCORED_ONLY_CATEGORY_STALE:${category}:${latest?.published_at ?? latest?.created_at ?? "missing"}`);
    }
    latestByCategory[category] = new Date(latestMs).toISOString();
    output.push(...rows.slice(0, ROWS_PER_CATEGORY));
  }
  return { rows: output, latestByCategory };
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > REQUIRED_CATEGORIES.length * ROWS_PER_CATEGORY) {
    throw new Error("FASTLANE_SCORED_ONLY_ROW_COUNT_INVALID");
  }
  const categories = new Set();
  const seen = new Set();
  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    const title = String(row?.source_title ?? "").trim();
    const category = String(row?.category ?? "").trim();
    const severity = Number(row?.severity);
    const timestamp = rowTime(row);
    if (
      !id || !title || !REQUIRED_CATEGORIES.includes(category) ||
      row?.public_status !== "verified_b2" ||
      !title.startsWith("Geomacro finds ") ||
      !Number.isFinite(severity) || severity < 0 || severity > 100 ||
      !Number.isFinite(timestamp) || timestamp > Date.now() + FUTURE_TOLERANCE_MS ||
      "source_name" in row || "source_domain" in row || "source_url" in row
    ) throw new Error("FASTLANE_SCORED_ONLY_ROW_INVALID");
    const key = `${category}|${title.toLowerCase().replace(/\s+/gu, " ")}`;
    if (seen.has(key)) throw new Error("FASTLANE_SCORED_ONLY_DUPLICATE_ROW");
    seen.add(key);
    categories.add(category);
  }
  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) throw new Error(`FASTLANE_SCORED_ONLY_CATEGORY_MISSING:${category}`);
  }
  const nearDedupe = dedupeScoredRows(rows);
  if (nearDedupe.length !== rows.length) throw new Error("FASTLANE_SCORED_ONLY_NEAR_DUPLICATE_ROW");
}

assertConfig();
const { rows, latestByCategory } = await readScoredRows();
validateRows(rows);
rows.sort((a, b) => rowTime(b) - rowTime(a) || String(b.id).localeCompare(String(a.id)));

const generatedAt = new Date().toISOString();
const value = {
  schema: "geomacro.public-intelligence-live.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  scoring_policy: "canonical-current-scored-only",
  classification_version: CLASSIFICATION_VERSION,
  current_evidence_contract: null,
  public_language: "en",
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  rows,
};
const packed = gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
const digest = sha256(packed);

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});
await b2.put(LIVE_KEY, packed);
const readback = await b2.get(LIVE_KEY);
if (readback.length !== packed.length || sha256(readback) !== digest) {
  throw new Error("FASTLANE_SCORED_ONLY_B2_HASH_INVALID");
}
let restored;
try {
  restored = JSON.parse(gunzipSync(readback).toString("utf8"));
} catch {
  throw new Error("FASTLANE_SCORED_ONLY_B2_RESTORE_INVALID");
}
validateRows(restored?.rows);
if (
  restored?.schema !== value.schema ||
  restored?.generated_at !== generatedAt ||
  restored?.source_project !== PROJECT_REF ||
  restored?.scoring_policy !== value.scoring_policy ||
  restored?.classification_version !== CLASSIFICATION_VERSION ||
  restored?.current_evidence_contract !== null ||
  restored?.raw_source_headlines_exposed !== false ||
  restored?.provider_identity_exposed !== false
) throw new Error("FASTLANE_SCORED_ONLY_B2_BINDING_INVALID");

const proofValue = {
  schema: "geomacro.public-intelligence-live-proof.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  live_key: LIVE_KEY,
  classification_version: CLASSIFICATION_VERSION,
  current_evidence_contract: null,
  current_source_id: null,
  current_source_batch_at: null,
  current_source_export_md5: null,
  current_source_fips_sha256: null,
  categories: REQUIRED_CATEGORIES,
  row_count: rows.length,
  verified_scored_rows: rows.length,
  live_observed_rows: 0,
  current_scored_latest_at: latestByCategory,
  required_scored_freshness_ms: REQUIRED_FRESH_MS,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  scored_only: true,
  live_observed_unscored: false,
  real_event_timestamps_preserved: true,
  near_duplicate_suppression: true,
  duplicate_window_ms: DUPLICATE_WINDOW_MS,
  public_language: "en",
  derived_titles_only: true,
  guardian_commercial_dependency: false,
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  synthetic_score: false,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
};
const proof = Buffer.from(JSON.stringify(proofValue));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) {
  throw new Error("FASTLANE_SCORED_ONLY_PROOF_READBACK_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.public-intelligence-scored-only-republish.v1",
  authority_read: "direct-postgres-canonical-classifier-scored",
  authority_serve: "backblaze-b2",
  classification_version: CLASSIFICATION_VERSION,
  categories: REQUIRED_CATEGORIES,
  current_scored_latest_at: latestByCategory,
  required_scored_freshness_ms: REQUIRED_FRESH_MS,
  verified_scored_rows: rows.length,
  live_observed_rows: 0,
  scored_only: true,
  near_duplicate_suppression: true,
  duplicate_window_ms: DUPLICATE_WINDOW_MS,
  synthetic_score: false,
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  b2_readback_verified: true,
  exact_gzip_restore_verified: true,
}));
