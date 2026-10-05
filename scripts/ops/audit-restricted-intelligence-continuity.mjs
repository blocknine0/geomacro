#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { createGriDbClient } from "../lib/gri-db-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const DOMAINS = ["geopolitics", "macro", "rare_earth"];
const RAW_CATEGORIES = ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"];
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const STRUCTURED_FRESH_MS = Number(process.env.RESTRICTED_STRUCTURED_FRESH_MS || 24 * 60 * 60 * 1000);
const SCORED_FRESH_MS = Number(process.env.RESTRICTED_SCORED_FRESH_MS || 24 * 60 * 60 * 1000);
const FRAGMENT_FRESH_MS = Number(process.env.RESTRICTED_FRAGMENT_FRESH_MS || 60 * 60 * 1000);
const OUT = process.env.RESTRICTED_INTELLIGENCE_AUDIT_OUTPUT || "artifacts/restricted-intelligence-continuity.json";

function eventTime(row) {
  const parsed = Date.parse(String(row?.published_at ?? row?.created_at ?? ""));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function observedTime(row) {
  const parsed = Date.parse(String(row?.last_observed_at ?? row?.last_seen_at ?? row?.updated_at ?? ""));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function isoOrNull(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function ageMs(ms) {
  return Number.isFinite(ms) ? Math.max(0, Date.now() - ms) : Infinity;
}

async function paged(db, table, select, configure, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = db.from(table).select(select);
    query = configure ? configure(query) : query;
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`${table.toUpperCase()}_READ_FAILED:${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

const db = createGriDbClient();
const now = Date.now();

const countries = await paged(
  db,
  "live_country_registry",
  "iso3,enabled",
  (query) => query.eq("enabled", true).order("iso3", { ascending: true }),
);
const enabledCountries = [...new Set(countries.map((row) => String(row.iso3 ?? "").trim()).filter(Boolean))];

const rawTargets = await paged(
  db,
  "live_raw_source_targets",
  "country_iso3,category,enabled",
  (query) => query.eq("enabled", true).in("category", RAW_CATEGORIES).order("country_iso3", { ascending: true }),
);
const rawCells = new Set(rawTargets.map((row) => `${row.country_iso3}|${row.category}`));
const missingCells = [];
for (const iso3 of enabledCountries) {
  for (const category of RAW_CATEGORIES) {
    if (!rawCells.has(`${iso3}|${category}`)) missingCells.push(`${iso3}|${category}`);
  }
}

const { data: fragmentRows, error: fragmentError } = await db
  .from("live_fragment_manifest")
  .select("id,source_key,storage_bucket,object_path,period_end,verified_at,verification_method,compressed_sha256")
  .in("source_key", ["gdelt_gal", "country_raw_web_mesh"])
  .eq("storage_bucket", "geomacro-private-archive")
  .eq("verification_method", "b2-readback-sha256")
  .order("period_end", { ascending: false })
  .limit(50);
if (fragmentError) throw new Error(`B2_FRAGMENT_READ_FAILED:${fragmentError.message}`);
const fragments = fragmentRows ?? [];
const newestFragmentMs = fragments.reduce((max, row) => Math.max(max, Date.parse(String(row.period_end ?? "")) || -Infinity), -Infinity);
const fragmentPathsValid = fragments.every((row) =>
  /^geomacro-evidence\/v1\/(?:live|fragments)\/v1\/[A-Za-z0-9_./-]+\.ndjson\.gz$/.test(String(row.object_path ?? "")) &&
  /^[a-f0-9]{64}$/.test(String(row.compressed_sha256 ?? "")),
);

const structuredRows = await paged(
  db,
  "live_structured_events",
  "id,domain,last_observed_at,last_seen_at,updated_at,commercial_eligibility_status,structure_version,classification_version",
  (query) => query.in("domain", DOMAINS).order("last_observed_at", { ascending: false }),
);
const latestStructured = Object.fromEntries(DOMAINS.map((domain) => [domain, -Infinity]));
const latestEligibleStructured = Object.fromEntries(DOMAINS.map((domain) => [domain, -Infinity]));
for (const row of structuredRows) {
  const domain = String(row.domain ?? "");
  if (!DOMAINS.includes(domain)) continue;
  const at = observedTime(row);
  latestStructured[domain] = Math.max(latestStructured[domain], at);
  if (["VERIFIED", "DERIVED_ONLY"].includes(String(row.commercial_eligibility_status ?? ""))) {
    latestEligibleStructured[domain] = Math.max(latestEligibleStructured[domain], at);
  }
}

const scoredRows = await paged(
  db,
  "events",
  "id,category,severity,published_at,created_at,classification_version,classification_prompt_version,classification_input_hash",
  (query) => query
    .in("category", DOMAINS)
    .eq("classification_version", CLASSIFICATION_VERSION)
    .order("published_at", { ascending: false }),
);
const latestScored = Object.fromEntries(DOMAINS.map((domain) => [domain, -Infinity]));
const invalidScored = [];
for (const row of scoredRows) {
  const category = String(row.category ?? "");
  if (!DOMAINS.includes(category)) continue;
  const severity = Number(row.severity);
  const at = eventTime(row);
  if (!Number.isFinite(severity) || severity < 0 || severity > 100 || !Number.isFinite(at) || !String(row.classification_input_hash ?? "").trim()) {
    invalidScored.push(String(row.id ?? "unknown"));
    continue;
  }
  latestScored[category] = Math.max(latestScored[category], at);
}

const structuredFresh = Object.fromEntries(DOMAINS.map((domain) => [domain, ageMs(latestStructured[domain]) <= STRUCTURED_FRESH_MS]));
const eligibleStructuredFresh = Object.fromEntries(DOMAINS.map((domain) => [domain, ageMs(latestEligibleStructured[domain]) <= STRUCTURED_FRESH_MS]));
const scoredFresh = Object.fromEntries(DOMAINS.map((domain) => [domain, ageMs(latestScored[domain]) <= SCORED_FRESH_MS]));

const checks = {
  authoritative_project_ref: PROJECT_REF,
  enabled_country_count: enabledCountries.length,
  country_registry_at_least_195: enabledCountries.length >= 195,
  represented_country_domain_cells: rawCells.size,
  minimum_country_domain_cells: enabledCountries.length * RAW_CATEGORIES.length,
  country_domain_matrix_complete: missingCells.length === 0,
  newest_verified_b2_fragment_at: isoOrNull(newestFragmentMs),
  verified_b2_fragment_current: ageMs(newestFragmentMs) <= FRAGMENT_FRESH_MS,
  verified_b2_fragment_paths_valid: fragmentPathsValid && fragments.length > 0,
  latest_structured_at: Object.fromEntries(DOMAINS.map((domain) => [domain, isoOrNull(latestStructured[domain])])),
  latest_commercially_eligible_structured_at: Object.fromEntries(DOMAINS.map((domain) => [domain, isoOrNull(latestEligibleStructured[domain])])),
  structured_fresh_by_domain: structuredFresh,
  commercially_eligible_structured_fresh_by_domain: eligibleStructuredFresh,
  latest_scored_at: Object.fromEntries(DOMAINS.map((domain) => [domain, isoOrNull(latestScored[domain])])),
  scored_fresh_by_domain: scoredFresh,
  invalid_scored_rows: invalidScored.length,
  direct_postgres_transport: String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres",
  b2_archive_mode: String(process.env.RAW_SOURCE_ARCHIVE_MODE ?? "").trim().toLowerCase() === "b2",
  local_canonical_structuring: String(process.env.LIVE_STRUCTURE_EXECUTION_MODE ?? "").trim().toLowerCase() === "local_direct_postgres",
};

const failures = [];
if (!checks.country_registry_at_least_195) failures.push("COUNTRY_REGISTRY_LT_195");
if (!checks.country_domain_matrix_complete) failures.push("COUNTRY_DOMAIN_MATRIX_INCOMPLETE");
if (!checks.verified_b2_fragment_current) failures.push("VERIFIED_B2_FRAGMENT_STALE");
if (!checks.verified_b2_fragment_paths_valid) failures.push("VERIFIED_B2_FRAGMENT_CONTRACT_INVALID");
for (const domain of DOMAINS) {
  if (!structuredFresh[domain]) failures.push(`STRUCTURED_${domain.toUpperCase()}_STALE`);
  if (!eligibleStructuredFresh[domain]) failures.push(`ELIGIBLE_STRUCTURED_${domain.toUpperCase()}_STALE`);
  if (!scoredFresh[domain]) failures.push(`SCORED_${domain.toUpperCase()}_STALE`);
}
if (invalidScored.length > 0) failures.push("INVALID_CANONICAL_SCORED_ROWS");
if (!checks.direct_postgres_transport) failures.push("DIRECT_POSTGRES_MODE_NOT_ACTIVE");
if (!checks.b2_archive_mode) failures.push("B2_ARCHIVE_MODE_NOT_ACTIVE");
if (!checks.local_canonical_structuring) failures.push("LOCAL_CANONICAL_STRUCTURING_NOT_ACTIVE");

const result = {
  schema: "geomacro.restricted-intelligence-continuity.v1",
  ok: failures.length === 0,
  generated_at: new Date(now).toISOString(),
  transport_boundary: {
    supabase_postgrest_required: false,
    direct_postgres_is_transport_only: true,
    canonical_database_project_ref: PROJECT_REF,
    raw_archive_authority: "backblaze-b2-verified-readback",
  },
  checks,
  missing_country_domain_cells: missingCells.slice(0, 100),
  failures,
};

mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
