#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createGriDbClient } from "../lib/gri-db-client.mjs";

const DOMAINS = ["geopolitics", "macro", "rare_earth"];
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const CLASSIFICATION_PROMPT_VERSION = "risk-desk-filter-v1.0.5";
const SCORER = "scripts/ingest-news.js";
const PUBLICATION_SYNC = "scripts/ops/sync-fastlane-scored-intelligence.mjs";
const ARTIFACT_DIR = "artifacts/intelligence-current-scoring-cycle";
const PROOF_PATH = `${ARTIFACT_DIR}/proof.json`;
const FRESH_ENOUGH_MS = Number(process.env.INTELLIGENCE_DOMAIN_SCORE_FRESH_MS || 40 * 60 * 1000);
const REQUIRED_FRESH_MS = Number(process.env.INTELLIGENCE_REQUIRED_FRESH_MS || 24 * 60 * 60 * 1000);

function eventTime(row) {
  const parsed = Date.parse(String(row?.published_at ?? row?.created_at ?? ""));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function isoOrNull(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

async function latestCanonicalScored(category) {
  const db = createGriDbClient();
  const { data, error } = await db
    .from("events")
    .select("id,category,severity,confidence,classification_version,classification_prompt_version,published_at,created_at")
    .eq("category", category)
    .eq("classification_version", CLASSIFICATION_VERSION)
    .order("published_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`CURRENT_SCORING_DB_READ_FAILED:${category}:${error.message}`);
  const row = data?.[0] ?? null;
  if (!row) return null;
  const severity = Number(row.severity);
  const timestamp = eventTime(row);
  if (!Number.isFinite(severity) || severity < 0 || severity > 100 || !Number.isFinite(timestamp)) {
    throw new Error(`CURRENT_SCORING_LATEST_INVALID:${category}`);
  }
  return { ...row, timestamp };
}

function patchCanonicalScorer() {
  let source = readFileSync(SCORER, "utf8");

  const categoryMarker = "function gdeltCategoryForCurrentRun(now = new Date()) {\n";
  const categoryInjection = categoryMarker +
    "  const forcedCategory = String(process.env.GDELT_FORCE_CATEGORY || '').trim();\n" +
    "  if (GDELT_DISCOVERY_CATEGORY_ORDER.includes(forcedCategory)) return forcedCategory;\n\n";
  if (!source.includes(categoryMarker)) throw new Error("CURRENT_SCORING_SELECTOR_MARKER_MISSING");
  if (!source.includes("GDELT_FORCE_CATEGORY")) source = source.replace(categoryMarker, categoryInjection);

  const guardianMarker = "function guardianQueryPlan(\n  queries,\n  priorityQueries = [],\n) {\n";
  const guardianInjection = guardianMarker +
    "  if (String(process.env.GEOMACRO_GDELT_ONLY || '').toLowerCase() === 'true') {\n" +
    "    return { queries: [], totalQueries: Array.isArray(queries) ? queries.length : 0, budget: 0, totalChunks: 0, chunkIndex: 0, startIndex: 0, endIndex: 0, priorityQueries: [] };\n" +
    "  }\n\n";
  if (!source.includes(guardianMarker)) throw new Error("CURRENT_SCORING_GUARDIAN_MARKER_MISSING");
  if (!source.includes("GEOMACRO_GDELT_ONLY")) source = source.replace(guardianMarker, guardianInjection);

  const historyMarker = ".select('source_url, source_title')\n        .range(from, from + PAGE_SIZE - 1);";
  const historyReplacement = ".select('source_url, source_title')\n        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())\n        .range(from, from + PAGE_SIZE - 1);";
  if (!source.includes(historyMarker) && !source.includes("7 * 24 * 60 * 60 * 1000).toISOString()")) {
    throw new Error("CURRENT_SCORING_HISTORY_MARKER_MISSING");
  }
  if (!source.includes("7 * 24 * 60 * 60 * 1000).toISOString()")) source = source.replace(historyMarker, historyReplacement);

  const apiMarker = "async function fetchArticlesFromApis(query, categoryName) {";
  const fallbackWrapper = `async function fetchGdeltArticlesWithGalFallback(query, categoryName) {
    const enabled = String(process.env.GDELT_GAL_FALLBACK_ENABLED || '').toLowerCase() === 'true';
    let primaryError = null;
    try {
      const primary = await fetchGdeltArticles(query);
      if (primary.length > 0 || !enabled) return primary;
      console.log('  GDELT DOC returned no current candidates; trying governed GAL fallback.');
    } catch (error) {
      primaryError = error;
      if (!enabled) throw error;
      console.log(\`  GDELT DOC failed (\${String(error?.message || error)}); trying governed GAL fallback.\`);
    }
    const { fetchGdeltGalFastlaneArticles } = await import('./lib/gdelt-gal-fastlane-fallback.mjs');
    const fallback = await fetchGdeltGalFastlaneArticles({
      categoryName,
      maxArticleAgeMs: MAX_ARTICLE_AGE_MS,
      maxCandidates: Math.max(1, Math.min(2, safeCandidatesPerCategory())),
    });
    console.log(\`  GDELT GAL fallback: \${fallback.length} current candidate(s) for \${categoryName}.\`);
    if (fallback.length === 0 && primaryError) console.log(\`  Primary DOC error retained as diagnostic: \${primaryError.message}\`);
    return fallback;
  }

  `;
  if (!source.includes(apiMarker)) throw new Error("CURRENT_SCORING_GAL_INSERT_MARKER_MISSING");
  if (!source.includes("fetchGdeltArticlesWithGalFallback")) source = source.replace(apiMarker, fallbackWrapper + apiMarker);

  const callMarker = "await fetchGdeltArticles(gdeltQuery);";
  if (source.includes(callMarker)) source = source.replace(callMarker, "await fetchGdeltArticlesWithGalFallback(gdeltQuery, category.name);");
  if (!source.includes("await fetchGdeltArticlesWithGalFallback(gdeltQuery, category.name);")) {
    throw new Error("CURRENT_SCORING_GDELT_CALL_MARKER_MISSING");
  }

  writeFileSync(SCORER, source, "utf8");
  const verified = readFileSync(SCORER, "utf8");
  for (const marker of [
    "GDELT_FORCE_CATEGORY",
    "GEOMACRO_GDELT_ONLY",
    "fetchGdeltArticlesWithGalFallback",
    "gdelt-gal-fastlane-fallback.mjs",
    "trying governed GAL fallback",
  ]) {
    if (!verified.includes(marker)) throw new Error(`CURRENT_SCORING_PATCH_MISSING:${marker}`);
  }
}

function parseSummary(log) {
  const matches = [...log.matchAll(/\{"discovery_candidates_classified":(\d+),"events_inserted":(\d+),"candidates_rejected":(\d+)\}/g)];
  if (!matches.length) throw new Error("CURRENT_SCORING_SUMMARY_MISSING");
  const [, classified, inserted, rejected] = matches.at(-1);
  return {
    classified_candidates: Number(classified),
    inserted_events: Number(inserted),
    rejected_candidates: Number(rejected),
  };
}

function runDomain(category) {
  const logPath = `${ARTIFACT_DIR}/${category}.log`;
  const child = spawnSync("node", [SCORER], {
    encoding: "utf8",
    env: {
      ...process.env,
      GDELT_FORCE_CATEGORY: category,
      FASTLANE_DOMAIN: category,
      GEOMACRO_GDELT_ONLY: "true",
      GDELT_GAL_FALLBACK_ENABLED: "true",
      GUARDIAN_QUERY_BUDGET_PER_CATEGORY: "0",
      GDACS_ENABLED: "false",
      RELIEFWEB_ENABLED: "false",
      MAX_CANDIDATES_PER_CATEGORY: process.env.MAX_CANDIDATES_PER_CATEGORY || "1",
      MAX_ARTICLE_AGE_MS: process.env.MAX_ARTICLE_AGE_MS || "21600000",
      GROQ_BATCH_SIZE: process.env.GROQ_BATCH_SIZE || "1",
      GROQ_MAX_REQUESTS_PER_RUN: process.env.GROQ_MAX_REQUESTS_PER_RUN || "3",
      GROQ_MAX_WAIT_MS: process.env.GROQ_MAX_WAIT_MS || "45000",
      NEWS_QUERY_DELAY_MS: "0",
      NODE_OPTIONS: "--experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs",
    },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });
  const log = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  writeFileSync(logPath, log, "utf8");
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`CURRENT_SCORING_DOMAIN_FAILED:${category}:${child.status ?? "unknown"}`);
  if (/Guardian discovery:|GDACS discovery:|ReliefWeb discovery:/.test(log)) {
    throw new Error(`CURRENT_SCORING_NON_GDELT_DISCOVERY_USED:${category}`);
  }
  return {
    ...parseSummary(log),
    discovery_provider: /GDELT GAL fallback: [1-9]/.test(log) ? "gdelt_gal" : "gdelt",
    primary_doc_failed: /GDELT DOC failed/.test(log),
    gal_fallback_attempted: /GDELT GAL fallback:/.test(log),
  };
}

function runPublicationSync() {
  const child = spawnSync("node", [PUBLICATION_SYNC], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 240_000,
  });
  const log = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  writeFileSync(`${ARTIFACT_DIR}/publication.log`, log, "utf8");
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`CURRENT_SCORING_PUBLICATION_FAILED:${child.status ?? "unknown"}`);
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
patchCanonicalScorer();

const startedAt = Date.now();
const results = [];
for (const category of DOMAINS) {
  const before = await latestCanonicalScored(category);
  const beforeMs = before?.timestamp ?? -Infinity;
  const ageBeforeMs = Number.isFinite(beforeMs) ? Date.now() - beforeMs : Infinity;
  if (ageBeforeMs <= FRESH_ENOUGH_MS) {
    results.push({
      category,
      action: "skipped_recent_score",
      before_at: isoOrNull(beforeMs),
      after_at: isoOrNull(beforeMs),
      advanced: false,
      age_after_ms: ageBeforeMs,
      within_required_freshness: ageBeforeMs <= REQUIRED_FRESH_MS,
    });
    continue;
  }

  const run = runDomain(category);
  const after = await latestCanonicalScored(category);
  const afterMs = after?.timestamp ?? -Infinity;
  const ageAfterMs = Number.isFinite(afterMs) ? Date.now() - afterMs : Infinity;
  results.push({
    category,
    action: "scored",
    before_at: isoOrNull(beforeMs),
    after_at: isoOrNull(afterMs),
    advanced: afterMs > beforeMs,
    age_after_ms: Number.isFinite(ageAfterMs) ? ageAfterMs : null,
    within_required_freshness: ageAfterMs <= REQUIRED_FRESH_MS,
    ...run,
  });
}

const stale = results.filter((row) => row.within_required_freshness !== true).map((row) => row.category);
const proof = {
  schema: "geomacro.intelligence-current-scoring-cycle.v1",
  ok: stale.length === 0,
  classification_version: CLASSIFICATION_VERSION,
  classification_prompt_version: CLASSIFICATION_PROMPT_VERSION,
  domains: DOMAINS,
  raw_feature_score_promotion: false,
  raw_event_metadata_score_promotion: false,
  fresh_enough_ms: FRESH_ENOUGH_MS,
  required_fresh_ms: REQUIRED_FRESH_MS,
  results,
  stale_domains: stale,
  started_at: new Date(startedAt).toISOString(),
  completed_at: new Date().toISOString(),
};
writeFileSync(PROOF_PATH, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify(proof));

if (stale.length > 0) throw new Error(`CURRENT_SCORING_REQUIRED_FRESHNESS_MISSING:${stale.join(",")}`);
runPublicationSync();
