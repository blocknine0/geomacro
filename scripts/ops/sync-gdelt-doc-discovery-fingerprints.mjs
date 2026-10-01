#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_KEY = "gdelt_doc";
const LOOKBACK_HOURS = 72;
const TTL_HOURS = 12;
const MAX_RECORDS = 25;
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const CLASSIFICATION_PROMPT_VERSION = "risk-desk-filter-v1.0.5";
const PRIORITY_ORDER = ["rare_earth", "geopolitics", "macro"];
const ROTATION_ORDER = ["geopolitics", "macro", "rare_earth"];
const MAX_ARTICLE_AGE_MS = Number(process.env.MAX_ARTICLE_AGE_MS || 72 * 60 * 60 * 1000);

const QUERIES = Object.freeze({
  geopolitics: '(war OR military OR missile OR sanctions OR ceasefire OR coup OR blockade)',
  macro: '("interest rate" OR inflation OR recession OR "sovereign debt" OR tariff OR "bond yield")',
  rare_earth: '("rare earth" OR "critical minerals" OR lithium OR cobalt OR nickel OR gallium OR germanium)',
});

function projectRef(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalUrl(raw) {
  try {
    const u = new URL(String(raw));
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const drop = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src"]);
    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || drop.has(lower)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function gdeltTimestamp(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}

function rotationCategory(now = new Date()) {
  const slot = Math.floor(now.getTime() / (2 * 60 * 60 * 1000));
  return ROTATION_ORDER[((slot % ROTATION_ORDER.length) + ROTATION_ORDER.length) % ROTATION_ORDER.length];
}

async function discoveryCategory(db, now) {
  const forced = String(process.env.GDELT_FORCE_CATEGORY || "").trim();
  if (ROTATION_ORDER.includes(forced)) return { category: forced, reason: "forced" };

  const cutoff = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("events")
    .select("category,created_at")
    .gte("created_at", cutoff)
    .eq("classification_version", CLASSIFICATION_VERSION)
    .eq("classification_prompt_version", CLASSIFICATION_PROMPT_VERSION)
    .in("category", PRIORITY_ORDER);
  if (error) throw new Error(`GDELT_DOC_PREFLIGHT_FAILED_${error.message}`);

  const counts = new Map(PRIORITY_ORDER.map((category) => [category, 0]));
  for (const row of data ?? []) {
    if (counts.has(row.category)) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  const missing = PRIORITY_ORDER.find((category) => (counts.get(category) ?? 0) === 0);
  return missing
    ? { category: missing, reason: "missing_gri_domain" }
    : { category: rotationCategory(now), reason: "deterministic_rotation" };
}

async function fetchGdeltDoc(category, now) {
  const base = QUERIES[category];
  if (!base) throw new Error(`GDELT_DOC_CATEGORY_INVALID_${category}`);
  const query = category === "geopolitics"
    ? `(${base}) OR ("China" OR "Taiwan" OR "South China Sea" OR "Philippines")`
    : base;
  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    maxrecords: String(MAX_RECORDS),
    format: "json",
    sort: "HybridRel",
    startdatetime: gdeltTimestamp(new Date(now.getTime() - MAX_ARTICLE_AGE_MS)),
    enddatetime: gdeltTimestamp(now),
  });
  const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`, {
    headers: { "user-agent": "Geomacro-GDELT-DOC-Provenance/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`GDELT_DOC_HTTP_${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.articles) ? payload.articles : [];
}

async function main() {
  const url = String(process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase server credentials are required");
  if (projectRef(url) !== AUTHORITATIVE_PROJECT_REF) throw new Error("Supabase URL is not the authoritative Geomacro project");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { category, reason } = await discoveryCategory(db, now);
  const articles = await fetchGdeltDoc(category, now);

  const unique = new Map();
  for (const article of articles) {
    const urlValue = canonicalUrl(article?.url);
    if (!urlValue) continue;
    const fingerprint = sha256(urlValue);
    if (!unique.has(fingerprint)) {
      unique.set(fingerprint, {
        fingerprint,
        source_key: SOURCE_KEY,
        observed_at: nowIso,
        expires_at: expiresAt,
        source_domain: domainOf(urlValue),
        updated_at: nowIso,
      });
    }
  }

  const rows = [...unique.values()];
  if (rows.length) {
    const { error } = await db
      .from("live_source_discovery_fingerprints")
      .upsert(rows, { onConflict: "fingerprint,source_key" });
    if (error) throw new Error(`GDELT_DOC_FINGERPRINT_UPSERT_FAILED_${error.message}`);
  }

  const { error: pruneError } = await db
    .from("live_source_discovery_fingerprints")
    .delete()
    .lt("expires_at", nowIso);
  if (pruneError) throw new Error(`GDELT_DOC_FINGERPRINT_PRUNE_FAILED_${pruneError.message}`);

  let verified = 0;
  let attachedEvidence = 0;
  const fingerprints = rows.map((row) => row.fingerprint);
  if (fingerprints.length) {
    const { data: ledger, error: ledgerError } = await db
      .from("live_source_discovery_fingerprints")
      .select("fingerprint")
      .eq("source_key", SOURCE_KEY)
      .in("fingerprint", fingerprints);
    if (ledgerError) throw new Error(`GDELT_DOC_FINGERPRINT_VERIFY_FAILED_${ledgerError.message}`);
    verified = ledger?.length ?? 0;
    if (verified !== fingerprints.length) throw new Error("GDELT_DOC_FINGERPRINT_VERIFY_COUNT_MISMATCH");

    const { data: evidence, error: evidenceError } = await db
      .from("live_structured_event_evidence")
      .select("event_id,fingerprint,acquisition_source_key")
      .in("fingerprint", fingerprints);
    if (evidenceError) throw new Error(`GDELT_DOC_EVIDENCE_VERIFY_FAILED_${evidenceError.message}`);
    attachedEvidence = (evidence ?? []).filter((row) => row.acquisition_source_key === SOURCE_KEY).length;
  }

  console.log(JSON.stringify({
    ok: true,
    source_key: SOURCE_KEY,
    category,
    category_reason: reason,
    gdelt_articles: articles.length,
    exact_fingerprints_seeded: rows.length,
    exact_fingerprints_verified: verified,
    structured_evidence_attached: attachedEvidence,
    expires_at: expiresAt,
    raw_publisher_payload_stored: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
